import { Router, Response, Request } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { buildFilterConditions } from '../lib/customer-filters.js';
import {
  countSegmentInStores,
  loadFranchiseSegment,
  loadStoreSegment,
  resolveSegmentCustomersInStores,
} from '../services/segment-engine.js';
import { brandMessageImageUpload as upload } from './message-uploads.js';
import { isSendableTime, getNextSendableTime, resolveSendTime, formatKst } from '../utils/send-window.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { BubbleType, IMAGE_SLOT_SIZE, ImageSlot, PkContent, SENDER_FOOTER_ENABLED, SPEC, STORE_NAME_VAR, applySenderFooter, emptyContent, validate } from '../services/premium-kakao/spec.js';

/** 발송 매장 안내를 붙인 내용 — 검사용(실제 이름)과 발송용(프랜차이즈는 #{매장명} 변수) */
function withFooter(scope: { footerName: string; storeNames: Map<string, string> | null }, type: BubbleType, content: PkContent) {
  return {
    check: applySenderFooter(type, content, scope.footerName).content,
    send: applySenderFooter(type, content, scope.storeNames ? STORE_NAME_VAR : scope.footerName).content,
  };
}
import { PremiumPayer, sendPremiumKakao } from '../services/premium-kakao/send.js';
import { uploadBmsImage } from '../services/premium-kakao/solapi-bms.js';

/**
 * 프리미엄 카카오톡 — 카카오 브랜드 메시지 ("태그히어 플레이스" 채널) 리타겟 발송.
 * 편집 내용은 발송 시점에 솔라피 브랜드 템플릿으로 등록해 보낸다 (services/premium-kakao/send.ts).
 *
 * 같은 라우터를 두 곳에 건다:
 *  - /api/premium-kakao            사장님 — 우리 매장 고객, 매장 지갑 과금
 *  - /api/franchise/premium-kakao  프랜차이즈 본사 — 전 가맹점 고객, 프랜차이즈 지갑 과금
 */

const MAX_RECIPIENTS_PER_SEND = 50000;
const TEST_SENDS_PER_DAY = 5;
const uploadDir = path.join(process.cwd(), 'uploads', 'premium-kakao');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const BUBBLE_TYPES = Object.keys(SPEC) as BubbleType[];
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const img = (v: any) => (v && typeof v.imageId === 'string' && typeof v.url === 'string' ? { imageId: v.imageId.slice(0, 64), url: v.url.slice(0, 300) } : null);
const btns = (v: any) => (Array.isArray(v) ? v.slice(0, 5).map((b: any) => ({ name: str(b?.name, 40), link: str(b?.link, 500) })) : []);
const commerce = (v: any) => ({ title: str(v?.title, 60), regularPrice: str(v?.regularPrice, 12), discountPrice: str(v?.discountPrice, 12) });
const item = (v: any) => ({ title: str(v?.title, 60), image: img(v?.image), link: str(v?.link, 500) });

/** 클라이언트가 보낸 편집 내용을 허용된 모양으로만 다시 만든다 */
function normalizeContent(type: BubbleType, raw: any): PkContent {
  const base = emptyContent(type);
  if (!raw || typeof raw !== 'object') return base;
  const kinds = ['WON', 'PCT', 'FREE', 'UP'];
  return {
    header: str(raw.header, 40),
    content: str(raw.content, 1500),
    image: img(raw.image),
    buttons: btns(raw.buttons),
    coupon: raw.coupon && kinds.includes(raw.coupon.kind)
      ? { kind: raw.coupon.kind, value: str(raw.coupon.value, 20), description: str(raw.coupon.description, 40) }
      : null,
    commerce: commerce(raw.commerce),
    additionalContent: str(raw.additionalContent, 60),
    mainItem: item(raw.mainItem),
    subItems: Array.isArray(raw.subItems) ? raw.subItems.slice(0, 5).map(item) : [],
    cards: Array.isArray(raw.cards)
      ? raw.cards.slice(0, 6).map((c: any) => ({
          header: str(c?.header, 40),
          content: str(c?.content, 400),
          image: img(c?.image),
          commerce: commerce(c?.commerce),
          additionalContent: str(c?.additionalContent, 60),
          buttons: btns(c?.buttons),
        }))
      : [],
    videoUrl: str(raw.videoUrl, 300),
  };
}

const parseType = (v: unknown): BubbleType | null => (BUBBLE_TYPES.includes(v as BubbleType) ? (v as BubbleType) : null);

/** 직원 확인 옵션 — 모든 형태에 “직원 확인” 버튼을 붙인다 (쿠폰 내용·유효기간은 직원 확인 화면에 표시) */
function parseStaffVerify(raw: any): { couponContent: string; expiryDate: string } | null {
  if (!raw || raw.enabled !== true) return null;
  const expiryDate = str(raw.expiryDate, 30).trim();
  return expiryDate ? { couponContent: str(raw.couponContent, 60).trim(), expiryDate } : null;
}

interface TargetInput {
  targetType?: string;
  customerIds?: string[];
  segmentId?: string;
  genderFilter?: string;
  ageGroups?: string[];
}

const pickTarget = (body: any): TargetInput => ({
  targetType: str(body?.targetType, 20) || 'ALL',
  customerIds: Array.isArray(body?.customerIds) ? body.customerIds.map((x: unknown) => str(x, 40)) : undefined,
  segmentId: body?.segmentId ? str(body.segmentId, 40) : undefined,
  genderFilter: body?.genderFilter ? str(body.genderFilter, 10) : undefined,
  ageGroups: Array.isArray(body?.ageGroups) ? body.ageGroups.map((x: unknown) => str(x, 20)) : undefined,
});

/** 발송 주체별 동작 — 매장(사장님) / 프랜차이즈 */
interface Scope {
  payer: PremiumPayer;
  storeIds: string[];
  senderName: string;
  defaultLink: string;
  /** 테스트 발송 쿠폰을 묶을 매장 */
  testStoreId: string;
  loadSegment: (segmentId: string) => Promise<{ conditions: any } | null>;
  walletBalance: () => Promise<number>;
  testCountToday: (since: Date) => Promise<number>;
  campaignsWhere: object;
  uploadPrefix: string;
  /** 발송 매장 안내에 들어갈 이름 — 사장님은 매장명, 프랜차이즈는 길이 검사용으로 가장 긴 가맹점명 */
  footerName: string;
  /** 프랜차이즈: 손님별 매장명 (#{매장명} 변수) */
  storeNames: Map<string, string> | null;
}

async function storeScope(req: Request): Promise<Scope> {
  const storeId = (req as AuthRequest).user!.storeId;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, naverPlaceUrl: true } });
  return {
    payer: { kind: 'STORE', storeId },
    storeIds: [storeId],
    senderName: store?.name || '매장',
    defaultLink: store?.naverPlaceUrl || '',
    testStoreId: storeId,
    loadSegment: (id) => loadStoreSegment(storeId, id),
    walletBalance: async () => (await prisma.wallet.findUnique({ where: { storeId }, select: { balance: true } }))?.balance ?? 0,
    testCountToday: (since) => prisma.premiumKakaoCampaign.count({ where: { storeId, isTest: true, createdAt: { gte: since } } }),
    campaignsWhere: { storeId },
    uploadPrefix: storeId,
    footerName: store?.name || '매장',
    storeNames: null,
  };
}

async function franchiseScope(req: Request): Promise<Scope> {
  const franchiseId = (req as FranchiseAuthRequest).franchiseUser!.franchiseId;
  const [franchise, stores] = await Promise.all([
    prisma.franchise.findUnique({ where: { id: franchiseId }, select: { name: true } }),
    prisma.store.findMany({ where: { franchiseId }, select: { id: true, name: true, naverPlaceUrl: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  if (stores.length === 0) throw Object.assign(new Error('연동된 가맹점이 없습니다.'), { status: 400 });
  return {
    payer: { kind: 'FRANCHISE', franchiseId },
    storeIds: stores.map((s) => s.id),
    senderName: franchise?.name || '프랜차이즈',
    defaultLink: '',
    testStoreId: stores[0].id,
    loadSegment: (id) => loadFranchiseSegment(franchiseId, id),
    walletBalance: async () => (await prisma.franchiseWallet.findUnique({ where: { franchiseId }, select: { balance: true } }))?.balance ?? 0,
    testCountToday: (since) => prisma.premiumKakaoCampaign.count({ where: { franchiseId, isTest: true, createdAt: { gte: since } } }),
    campaignsWhere: { franchiseId },
    uploadPrefix: `f_${franchiseId}`,
    footerName: stores.map((s) => s.name).sort((a, b) => b.length - a.length)[0] || '매장',
    storeNames: new Map(stores.map((s) => [s.id, s.name])),
  };
}

/** 발송 대상 where — 마케팅 수신 동의 + 전화번호 보유 고객만 (고객 그룹 제외) */
function targetWhere(storeIds: string[], t: TargetInput): any {
  const where: any = { storeId: { in: storeIds }, phone: { not: null }, consentMarketing: true };
  if (t.targetType === 'CUSTOM') {
    where.id = { in: Array.isArray(t.customerIds) ? t.customerIds.slice(0, 20000) : [] };
    return where;
  }
  Object.assign(where, buildFilterConditions(t.genderFilter, Array.isArray(t.ageGroups) ? t.ageGroups : undefined));
  if (t.targetType === 'REVISIT') where.visitCount = { gte: 2 };
  if (t.targetType === 'NEW') where.createdAt = { gte: new Date(Date.now() - 30 * 86400000) };
  return where;
}

async function segmentOf(scope: Scope, t: TargetInput) {
  const segment = t.segmentId ? await scope.loadSegment(String(t.segmentId)) : null;
  if (!segment) throw Object.assign(new Error('고객 그룹을 찾을 수 없습니다.'), { status: 400 });
  return segment;
}

async function countTargets(scope: Scope, t: TargetInput): Promise<number> {
  if (t.targetType === 'SEGMENT') return (await countSegmentInStores(scope.storeIds, (await segmentOf(scope, t)).conditions)).reachable;
  return prisma.customer.count({ where: targetWhere(scope.storeIds, t) });
}

async function resolveTargets(scope: Scope, t: TargetInput): Promise<Array<{ customerId: string; phone: string; storeId: string }>> {
  if (t.targetType === 'SEGMENT') {
    const rows = await resolveSegmentCustomersInStores(scope.storeIds, (await segmentOf(scope, t)).conditions);
    return rows.map((c) => ({ customerId: c.id, phone: c.phone, storeId: c.storeId }));
  }
  const rows = await prisma.customer.findMany({
    where: targetWhere(scope.storeIds, t),
    select: { id: true, phone: true, storeId: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.filter((r) => r.phone).map((r) => ({ customerId: r.id, phone: r.phone!, storeId: r.storeId }));
}

const fail = (res: Response, e: any, fallback: string) => {
  if (e?.status === 400) return res.status(400).json({ error: e.message });
  console.error(`[PremiumKakao] ${fallback}:`, e);
  return res.status(500).json({ error: e?.message || fallback });
};

function buildRouter(auth: any, getScope: (req: Request) => Promise<Scope>): Router {
  const router = Router();
  router.use(auth);

  // POST /estimate — 대상 수 · 비용 · 잔액 · 발송 가능 시간
  router.post('/estimate', async (req, res) => {
    try {
      const scope = await getScope(req);
      const type = parseType(req.body?.bubbleType) ?? 'TEXT';
      const unitCost = SPEC[type].price;
      const [targetCount, walletBalance] = await Promise.all([countTargets(scope, pickTarget(req.body)), scope.walletBalance()]);
      const sendableNow = isSendableTime();
      res.json({
        targetCount,
        unitCost,
        totalCost: targetCount * unitCost,
        walletBalance,
        footerName: scope.footerName,
        canSend: walletBalance >= targetCount * unitCost,
        sendableNow,
        nextSendableAt: sendableNow ? null : getNextSendableTime().toISOString(),
      });
    } catch (e) {
      fail(res, e, '비용을 계산하지 못했습니다.');
    }
  });

  // POST /upload-image — 형태별 슬롯에 맞춘 이미지를 솔라피에 올린다 (프론트에서 비율대로 잘라 보냄)
  router.post('/upload-image', upload.single('image'), async (req, res) => {
    let filepath = '';
    try {
      const scope = await getScope(req);
      const slot = str(req.body?.slot, 40) as ImageSlot;
      if (!IMAGE_SLOT_SIZE[slot]) return res.status(400).json({ error: '이미지 위치가 올바르지 않습니다.' });
      if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
      const meta = await sharp(req.file.buffer).metadata();
      if (!meta.width || !meta.height) return res.status(400).json({ error: '이미지를 읽을 수 없습니다.' });

      const filename = `${scope.uploadPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      filepath = path.join(uploadDir, filename);
      await sharp(req.file.buffer).jpeg({ quality: 88 }).toFile(filepath);

      const imageId = await uploadBmsImage(filepath, slot);
      res.json({ imageId, url: `/uploads/premium-kakao/${filename}`, width: meta.width, height: meta.height });
    } catch (e: any) {
      if (filepath) await fs.promises.unlink(filepath).catch(() => {});
      if (e?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '이미지 용량이 너무 큽니다. (최대 5MB)' });
      fail(res, e, '이미지를 올리지 못했습니다.');
    }
  });

  // POST /test-send — 입력한 번호로 1건 (무료, 하루 5회)
  router.post('/test-send', async (req, res) => {
    try {
      const scope = await getScope(req);
      const type = parseType(req.body?.bubbleType);
      if (!type) return res.status(400).json({ error: '메시지 형태를 선택해주세요.' });
      const content = normalizeContent(type, req.body?.content);
      const staffVerify = parseStaffVerify(req.body?.staffVerify);
      const footered = withFooter(scope, type, content);
      const issues = validate(type, footered.check, !!staffVerify);
      if (issues.length) return res.status(400).json({ error: issues[0], issues });

      const phone = normalizePhoneNumber(str(req.body?.phone, 20));
      if (!/^01\d{8,9}$/.test(phone)) return res.status(400).json({ error: '휴대폰 번호를 확인해주세요.' });

      const kstMidnight = new Date(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+09:00');
      const used = await scope.testCountToday(kstMidnight);
      if (used >= TEST_SENDS_PER_DAY) return res.status(400).json({ error: `테스트는 하루 ${TEST_SENDS_PER_DAY}번까지 보낼 수 있어요.` });
      if (!isSendableTime()) return res.status(400).json({ error: '광고 메시지는 08:00~20:50 사이에만 보낼 수 있어요.' });

      const result = await sendPremiumKakao({
        payer: scope.payer,
        senderName: scope.senderName,
        type,
        content: footered.send,
        storeNames: SENDER_FOOTER_ENABLED ? scope.storeNames : null,
        recipients: [{ customerId: null, phone, storeId: scope.testStoreId }],
        unitCost: SPEC[type].price,
        isTest: true,
        targetType: 'TEST',
        defaultLink: scope.defaultLink,
        staffVerify,
      });
      if (result.queued === 0) return res.status(400).json({ error: '카카오톡이 테스트 메시지를 접수하지 않았어요. 번호를 확인해주세요.' });
      res.json({ success: true, campaignId: result.campaignId, remaining: TEST_SENDS_PER_DAY - used - 1 });
    } catch (e) {
      fail(res, e, '테스트를 보내지 못했습니다.');
    }
  });

  // POST /send — 실제 발송 (접수된 건만 차감, 실패 확정 시 환불)
  router.post('/send', async (req, res) => {
    try {
      const scope = await getScope(req);
      const type = parseType(req.body?.bubbleType);
      if (!type) return res.status(400).json({ error: '메시지 형태를 선택해주세요.' });
      const content = normalizeContent(type, req.body?.content);
      const staffVerify = parseStaffVerify(req.body?.staffVerify);
      const footered = withFooter(scope, type, content);
      const issues = validate(type, footered.check, !!staffVerify);
      if (issues.length) return res.status(400).json({ error: issues[0], issues });

      const target = pickTarget(req.body);
      const recipients = await resolveTargets(scope, target);
      if (recipients.length === 0) return res.status(400).json({ error: '보낼 수 있는 고객이 없어요.' });
      if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
        return res.status(400).json({ error: `1회 최대 ${MAX_RECIPIENTS_PER_SEND.toLocaleString()}명까지 보낼 수 있어요. 현재 ${recipients.length.toLocaleString()}명.` });
      }

      const unitCost = SPEC[type].price;
      const requiredCost = recipients.length * unitCost;
      const balance = await scope.walletBalance();
      if (balance < requiredCost) {
        return res.status(400).json({
          error: `충전금이 부족해요. 필요 ${requiredCost.toLocaleString()}원, 잔액 ${balance.toLocaleString()}원`,
          requiredCost,
          walletBalance: balance,
        });
      }

      // 예약 요청이 있으면 그 시각, 없는데 발송 불가 시간이면 다음 오전 8시
      const sendTime = resolveSendTime(req.body?.scheduledAt, { adWindow: true });
      if (sendTime.error) return res.status(400).json({ error: sendTime.error });
      const scheduledAt = sendTime.at;
      const result = await sendPremiumKakao({
        payer: scope.payer,
        senderName: scope.senderName,
        type,
        content: footered.send,
        storeNames: SENDER_FOOTER_ENABLED ? scope.storeNames : null,
        recipients,
        unitCost,
        isTest: false,
        targetType: target.targetType || 'ALL',
        targetFilter: {
          segmentId: target.segmentId ?? null,
          genderFilter: target.genderFilter ?? null,
          ageGroups: target.ageGroups ?? [],
          customerCount: target.customerIds?.length ?? null,
        },
        scheduledAt,
        defaultLink: scope.defaultLink,
        staffVerify,
      });

      if (result.queued === 0) return res.status(502).json({ error: '카카오톡이 메시지를 접수하지 않았어요. 잠시 후 다시 시도해주세요.', ...result });
      const when = scheduledAt
        ? ` ${formatKst(scheduledAt)}에 발송돼요.`
        : '';
      res.json({
        success: true,
        ...result,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        message: `${result.queued.toLocaleString()}명에게 보냈어요 (${result.totalCost.toLocaleString()}원).${when}${result.dropped > 0 ? ` ${result.dropped.toLocaleString()}명은 접수되지 않아 차감하지 않았어요.` : ''}`,
      });
    } catch (e) {
      fail(res, e, '메시지를 보내지 못했습니다.');
    }
  });

  // GET /campaigns — 발송 내역
  router.get('/campaigns', async (req, res) => {
    try {
      const scope = await getScope(req);
      const campaigns = await prisma.premiumKakaoCampaign.findMany({
        where: scope.campaignsWhere,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, bubbleType: true, targetType: true, targetCount: true, queuedCount: true, sentCount: true, failedCount: true,
          unitCost: true, totalCost: true, status: true, isTest: true, scheduledAt: true, completedAt: true, createdAt: true,
        },
      });
      res.json({ campaigns });
    } catch (e) {
      fail(res, e, '발송 내역을 불러오지 못했습니다.');
    }
  });

  return router;
}

export const franchisePremiumKakaoRoutes = buildRouter(franchiseAuthMiddleware, franchiseScope);
export default buildRouter(authMiddleware, storeScope);
