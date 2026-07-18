/**
 * 쿠폰 발행 링크 — 점주가 만든 공개 설문 폼으로 쿠폰 알림톡 자동 발송
 *
 * 공개(무인증):
 *   GET  /api/coupon-form/public/:slug          폼 정보 (손님 폼 렌더용)
 *   POST /api/coupon-form/public/:slug/submit   제출 → RetargetCoupon 생성 + 알림톡 outbox 등록
 *     (발송·과금은 alimtalk-worker가 처리: 무료 크레딧 우선, 없으면 지갑 50원 차감, 잔액 부족 시 FAILED)
 *
 * 점주(인증):
 *   GET    /api/coupon-form            폼 목록 + 통계(제출/사용)
 *   POST   /api/coupon-form            폼 생성
 *   PUT    /api/coupon-form/:id        폼 수정
 *   DELETE /api/coupon-form/:id        폼 삭제
 */
import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 혼동 문자 제외 (retarget-coupon과 동일 알파벳)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);
const generateFormSlug = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12);

const MAX_FIELDS = 10;

interface FormField {
  id: string;
  type: 'TEXT' | 'CHOICE';
  label: string;
  required: boolean;
  choiceOptions?: string[];
}

function sanitizeFields(raw: unknown): FormField[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_FIELDS) return null;
  const out: FormField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const { id, type, label, required, choiceOptions } = f as any;
    if (typeof id !== 'string' || !id) return null;
    if (type !== 'TEXT' && type !== 'CHOICE') return null;
    if (typeof label !== 'string' || !label.trim() || label.length > 50) return null;
    const field: FormField = { id, type, label: label.trim(), required: !!required };
    if (type === 'CHOICE') {
      if (!Array.isArray(choiceOptions) || choiceOptions.length < 2 || choiceOptions.length > 10) return null;
      if (!choiceOptions.every((o: any) => typeof o === 'string' && o.trim() && o.length <= 30)) return null;
      field.choiceOptions = choiceOptions.map((o: string) => o.trim());
    }
    out.push(field);
  }
  return out;
}

function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 10 || digits.length > 11) return null;
  if (!digits.startsWith('01')) return null;
  return digits;
}

// ============================================================
// 공개 엔드포인트 (무인증) — authMiddleware 적용 전에 선언
// ============================================================

// GET /api/coupon-form/public/:slug - 손님 폼 렌더용 정보
router.get('/public/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const form = await prisma.couponFormLink.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        description: true,
        fields: true,
        couponContent: true,
        expiryDate: true,
        enabled: true,
        store: { select: { name: true } },
      },
    });

    if (!form || !form.enabled) {
      return res.status(404).json({ error: '진행 중인 이벤트가 아닙니다.' });
    }

    res.json({
      slug: form.slug,
      title: form.title,
      description: form.description,
      fields: form.fields,
      couponContent: form.couponContent,
      expiryDate: form.expiryDate,
      storeName: form.store.name,
    });
  } catch (error) {
    console.error('[CouponForm] public get error:', error);
    res.status(500).json({ error: '폼 정보를 불러오지 못했습니다.' });
  }
});

// POST /api/coupon-form/public/:slug/submit - 제출 → 쿠폰 발급 + 알림톡 등록
router.post('/public/:slug/submit', async (req, res) => {
  try {
    const { slug } = req.params;
    const phone = normalizePhone(req.body?.phone);
    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

    if (!phone) {
      return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해주세요.' });
    }

    const form = await prisma.couponFormLink.findUnique({
      where: { slug },
      include: { store: { select: { id: true, name: true, naverPlaceUrl: true } } },
    });
    if (!form || !form.enabled) {
      return res.status(404).json({ error: '진행 중인 이벤트가 아닙니다.' });
    }

    // 필수 필드 응답 검증
    const fields = (form.fields as unknown as FormField[]) || [];
    for (const f of fields) {
      if (f.required) {
        const v = answers[f.id];
        if (v === undefined || v === null || String(v).trim() === '') {
          return res.status(400).json({ error: `'${f.label}' 항목을 입력해주세요.` });
        }
      }
    }
    // 응답 값 정리 (정의된 필드만, 길이 제한)
    const cleanAnswers: Record<string, string> = {};
    for (const f of fields) {
      const v = answers[f.id];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        cleanAnswers[f.id] = String(v).trim().slice(0, 200);
      }
    }

    // 중복 제출 확인 (폼당 번호 1회)
    const existing = await prisma.couponFormSubmission.findUnique({
      where: { formId_phone: { formId: form.id, phone } },
    });
    if (existing) {
      return res.status(400).json({ error: 'already_submitted', message: '이미 참여하셨어요. 쿠폰은 카카오톡을 확인해주세요.' });
    }

    // 알림톡 템플릿 설정 확인
    const templateId = process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) {
      console.error('[CouponForm] SOLAPI_TEMPLATE_ID_RETARGET_COUPON not configured');
      return res.status(500).json({ error: '쿠폰 발송 설정이 완료되지 않았습니다. 매장에 문의해주세요.' });
    }

    const appUrl = process.env.PUBLIC_APP_URL || '';
    const domain = appUrl.replace(/^https?:\/\//, '');

    // 같은 매장 기존 고객이면 연결 (best-effort)
    const customer = await prisma.customer.findFirst({
      where: { storeId: form.storeId, phone: { contains: phone.slice(-8) } },
      select: { id: true },
    });

    const code = generateCouponCode();

    // 쿠폰 + 제출 기록 + 알림톡 outbox를 한 트랜잭션으로.
    // 발송/과금(무료 크레딧 우선 → 지갑 50원)은 alimtalk-worker가 SENT 시점에 처리.
    await prisma.$transaction(async (tx) => {
      await tx.retargetCoupon.create({
        data: {
          code,
          storeId: form.storeId,
          customerId: customer?.id || null,
          phone,
          couponContent: form.couponContent,
          expiryDate: form.expiryDate,
          naverPlaceUrl: form.store.naverPlaceUrl || null,
        },
      });
      await tx.couponFormSubmission.create({
        data: {
          formId: form.id,
          storeId: form.storeId,
          phone,
          answers: cleanAnswers as any,
          couponCode: code,
        },
      });
      await tx.alimTalkOutbox.create({
        data: {
          storeId: form.storeId,
          customerId: customer?.id || null,
          phone,
          messageType: 'RETARGET_COUPON',
          templateId,
          variables: {
            '#{상호}': form.store.name,
            '#{쿠폰내용}': form.couponContent,
            '#{유효기간}': form.expiryDate,
            '#{네이버플레이스}': (form.store.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
            '#{직원확인}': `${domain}/coupon/verify/${code}`,
          } as any,
          idempotencyKey: `retarget-coupon-${code}`,
          status: 'PENDING',
        },
      });
    });

    res.json({ success: true, message: '쿠폰이 카카오톡으로 발송돼요!' });
  } catch (error: any) {
    // 동시 제출 경합으로 unique 충돌 시 중복 안내
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'already_submitted', message: '이미 참여하셨어요. 쿠폰은 카카오톡을 확인해주세요.' });
    }
    console.error('[CouponForm] submit error:', error);
    res.status(500).json({ error: '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

// ============================================================
// 점주 엔드포인트 (인증)
// ============================================================
router.use(authMiddleware);

// GET /api/coupon-form - 폼 목록 + 통계 (+ 매장 네이버플레이스 URL)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { naverPlaceUrl: true },
    });

    const forms = await prisma.couponFormLink.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    });

    // 사용 수: 제출로 발급된 쿠폰 중 usedAt이 채워진 것
    const submissions = await prisma.couponFormSubmission.findMany({
      where: { storeId, couponCode: { not: null } },
      select: { formId: true, couponCode: true },
    });
    const codes = submissions.map((s) => s.couponCode!).filter(Boolean);
    const usedCodes = new Set(
      codes.length > 0
        ? (
            await prisma.retargetCoupon.findMany({
              where: { code: { in: codes }, usedAt: { not: null } },
              select: { code: true },
            })
          ).map((c) => c.code)
        : [],
    );
    const usedByForm = new Map<string, number>();
    for (const s of submissions) {
      if (s.couponCode && usedCodes.has(s.couponCode)) {
        usedByForm.set(s.formId, (usedByForm.get(s.formId) || 0) + 1);
      }
    }

    res.json({
      naverPlaceUrl: store?.naverPlaceUrl || '',
      forms: forms.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        description: f.description,
        fields: f.fields,
        couponContent: f.couponContent,
        expiryDate: f.expiryDate,
        enabled: f.enabled,
        createdAt: f.createdAt,
        submissionCount: f._count.submissions,
        usedCount: usedByForm.get(f.id) || 0,
      })),
    });
  } catch (error) {
    console.error('[CouponForm] list error:', error);
    res.status(500).json({ error: '쿠폰 발행 링크 조회 중 오류가 발생했습니다.' });
  }
});

// 네이버 플레이스 URL 검증 (필수) — naver 도메인 링크만 허용
function sanitizeNaverPlaceUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/(^|\.)naver\.(com|me)$/.test(u.hostname)) return null;
    return withScheme.slice(0, 300);
  } catch {
    return null;
  }
}

// POST /api/coupon-form - 폼 생성 (네이버 플레이스 URL 필수 — 매장 정보에 저장)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { title, description, couponContent, expiryDate } = req.body || {};

    if (typeof couponContent !== 'string' || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }
    if (typeof expiryDate !== 'string' || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }
    const naverPlaceUrl = sanitizeNaverPlaceUrl(req.body?.naverPlaceUrl);
    if (!naverPlaceUrl) {
      return res.status(400).json({ error: '네이버 플레이스 URL을 입력해주세요. (naver.com / naver.me 링크)' });
    }
    const fields = sanitizeFields(req.body?.fields ?? []);
    if (fields === null) {
      return res.status(400).json({ error: '설문 항목 형식이 올바르지 않습니다.' });
    }

    const [, form] = await prisma.$transaction([
      prisma.store.update({ where: { id: storeId }, data: { naverPlaceUrl } }),
      prisma.couponFormLink.create({
        data: {
          storeId,
          slug: generateFormSlug(),
          title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 50) : '쿠폰 받기',
          description: typeof description === 'string' && description.trim() ? description.trim().slice(0, 300) : null,
          fields: fields as any,
          couponContent: couponContent.trim().slice(0, 200),
          expiryDate: expiryDate.trim().slice(0, 100),
        },
      }),
    ]);

    res.json({ success: true, form });
  } catch (error) {
    console.error('[CouponForm] create error:', error);
    res.status(500).json({ error: '쿠폰 발행 링크 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/coupon-form/:id - 폼 수정 (enabled 토글 포함)
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const existing = await prisma.couponFormLink.findFirst({ where: { id, storeId } });
    if (!existing) {
      return res.status(404).json({ error: '쿠폰 발행 링크를 찾을 수 없습니다.' });
    }

    const { title, description, couponContent, expiryDate, enabled } = req.body || {};
    const data: Record<string, any> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
      data.title = title.trim().slice(0, 50);
    }
    if (description !== undefined) {
      data.description = typeof description === 'string' && description.trim() ? description.trim().slice(0, 300) : null;
    }
    if (couponContent !== undefined) {
      if (typeof couponContent !== 'string' || !couponContent.trim()) return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
      data.couponContent = couponContent.trim().slice(0, 200);
    }
    if (expiryDate !== undefined) {
      if (typeof expiryDate !== 'string' || !expiryDate.trim()) return res.status(400).json({ error: '유효기간을 입력해주세요.' });
      data.expiryDate = expiryDate.trim().slice(0, 100);
    }
    if (req.body?.fields !== undefined) {
      const fields = sanitizeFields(req.body.fields);
      if (fields === null) return res.status(400).json({ error: '설문 항목 형식이 올바르지 않습니다.' });
      data.fields = fields as any;
    }
    if (enabled !== undefined) {
      data.enabled = !!enabled;
    }

    // 네이버 플레이스 URL 갱신 (전달된 경우 필수 검증 후 매장 정보에 저장)
    if (req.body?.naverPlaceUrl !== undefined) {
      const naverPlaceUrl = sanitizeNaverPlaceUrl(req.body.naverPlaceUrl);
      if (!naverPlaceUrl) {
        return res.status(400).json({ error: '네이버 플레이스 URL을 입력해주세요. (naver.com / naver.me 링크)' });
      }
      await prisma.store.update({ where: { id: storeId }, data: { naverPlaceUrl } });
    }

    const form = await prisma.couponFormLink.update({ where: { id }, data });
    res.json({ success: true, form });
  } catch (error) {
    console.error('[CouponForm] update error:', error);
    res.status(500).json({ error: '쿠폰 발행 링크 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/coupon-form/:id - 폼 삭제 (제출 기록도 cascade 삭제, 발급된 쿠폰은 유지)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const existing = await prisma.couponFormLink.findFirst({ where: { id, storeId } });
    if (!existing) {
      return res.status(404).json({ error: '쿠폰 발행 링크를 찾을 수 없습니다.' });
    }

    await prisma.couponFormLink.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[CouponForm] delete error:', error);
    res.status(500).json({ error: '쿠폰 발행 링크 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
