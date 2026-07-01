import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { customAlphabet } from 'nanoid';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { getAgeGroupBirthYearRange } from '../lib/customer-filters.js';

const router = Router();

const COUPON_COST_PER_MESSAGE = 50; // 건당 50원
const MAX_RECIPIENTS_PER_SEND = 3000;
const INSERT_CHUNK_SIZE = 500;

const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

// 성별/연령대 필터 조건 빌더 (franchise-sms 와 동일 규칙)
function buildFilterConditions(genderFilter?: string, ageGroups?: string[]): any {
  const conditions: any = {};
  if (genderFilter && genderFilter !== 'ALL' && genderFilter !== 'all') {
    conditions.gender = genderFilter;
  }
  if (ageGroups && ageGroups.length > 0) {
    const birthYearConditions: any[] = [];
    for (const ageGroup of ageGroups) {
      const range = getAgeGroupBirthYearRange(ageGroup);
      if (range) birthYearConditions.push({ birthYear: range });
    }
    if (birthYearConditions.length > 0) conditions.OR = birthYearConditions;
  }
  return conditions;
}

// 대상 고객 where 조건 구성 (targetType + 필터)
function buildTargetWhere(storeIds: string[], body: any): any {
  const { targetType, customerIds, genderFilter, ageGroups } = body;
  const ageGroupList = ageGroups && Array.isArray(ageGroups) ? ageGroups : [];
  const where: any = {
    storeId: { in: storeIds },
    phone: { not: null },
    ...buildFilterConditions(genderFilter, ageGroupList),
  };
  if (targetType === 'CUSTOM' && customerIds && Array.isArray(customerIds)) {
    where.id = { in: customerIds };
  } else if (targetType === 'REVISIT') {
    where.visitCount = { gte: 2 };
  } else if (targetType === 'NEW') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    where.createdAt = { gte: thirtyDaysAgo };
  }
  return where;
}

// GET /api/franchise/retarget-coupon/settings - 미리보기용 프랜차이즈 정보
router.get('/settings', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: { name: true },
    });
    // 프랜차이즈는 매장이 여러 개이므로 발송 시 각 고객의 매장명/네이버URL이 사용된다.
    // 미리보기 상호명은 프랜차이즈명을 대표로 표시.
    res.json({
      storeName: franchise?.name || '',
      naverPlaceUrl: '',
    });
  } catch (error) {
    console.error('Failed to fetch franchise retarget coupon settings:', error);
    res.status(500).json({ error: '설정을 불러오는데 실패했습니다.' });
  }
});

// GET /api/franchise/retarget-coupon/estimate?targetCount=N - 비용 예상
router.get('/estimate', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const targetCount = parseInt(req.query.targetCount as string) || 0;
    const totalCost = targetCount * COUPON_COST_PER_MESSAGE;

    const wallet = await prisma.franchiseWallet.findUnique({ where: { franchiseId } });
    const walletBalance = wallet?.balance || 0;

    res.json({
      targetCount,
      costPerMessage: COUPON_COST_PER_MESSAGE,
      totalCost,
      walletBalance,
      canSend: walletBalance >= totalCost,
    });
  } catch (error) {
    console.error('Failed to estimate franchise retarget coupon cost:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/retarget-coupon/send - 프랜차이즈 쿠폰 알림톡 발송
router.post('/send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { couponContent, expiryDate, naverPlaceUrl, targetType, customerIds } = req.body;

    if (!couponContent || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }
    if (!expiryDate || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }

    // 프랜차이즈 소속 매장 (이름/네이버URL 포함 — 발송 시 각 고객 매장 정보 사용)
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true, name: true, naverPlaceUrl: true },
    });
    if (stores.length === 0) {
      return res.status(400).json({ error: '연동된 매장이 없습니다.' });
    }
    const storeIds = stores.map((s) => s.id);
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    if (targetType === 'CUSTOM' && (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0)) {
      return res.status(400).json({ error: '발송할 고객을 선택해주세요.' });
    }

    // 대상 고객 조회 (매장 정보를 위해 storeId 포함)
    const resolved = await prisma.customer.findMany({
      where: buildTargetWhere(storeIds, req.body),
      select: { id: true, phone: true, storeId: true },
    });

    if (resolved.length === 0) {
      return res.status(400).json({ error: '발송 가능한 고객이 없습니다.' });
    }
    if (resolved.length > MAX_RECIPIENTS_PER_SEND) {
      return res.status(400).json({
        error: `1회 발송 최대 인원(${MAX_RECIPIENTS_PER_SEND.toLocaleString()}명)을 초과했습니다. 현재 ${resolved.length.toLocaleString()}명. 필터를 좁히거나 나눠 발송해 주세요.`,
        resolved: resolved.length,
        maxRecipients: MAX_RECIPIENTS_PER_SEND,
      });
    }

    const totalCost = resolved.length * COUPON_COST_PER_MESSAGE;
    const wallet = await prisma.franchiseWallet.findUnique({ where: { franchiseId } });
    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: `충전금이 부족합니다. 필요: ${totalCost.toLocaleString()}원, 잔액: ${(wallet?.balance || 0).toLocaleString()}원`,
        requiredCost: totalCost,
        walletBalance: wallet?.balance || 0,
      });
    }

    const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3999';
    const domain = appUrl.replace(/^https?:\/\//, '');

    const templateId = process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) {
      return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });
    }
    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(500).json({ error: 'SOLAPI 채널이 설정되지 않았습니다.' });
    }

    const overrideNaver = (naverPlaceUrl || '').trim();
    const codePoolDedup = new Set<string>();
    let queued = 0;
    let dropped = 0;

    for (let i = 0; i < resolved.length; i += INSERT_CHUNK_SIZE) {
      const slice = resolved.slice(i, i + INSERT_CHUNK_SIZE);

      const couponRows = slice.map((c) => {
        let code = generateCouponCode();
        let guard = 0;
        while (codePoolDedup.has(code) && guard < 5) {
          code = generateCouponCode();
          guard++;
        }
        codePoolDedup.add(code);
        const store = storeMap.get(c.storeId);
        const effectiveNaver = overrideNaver || store?.naverPlaceUrl || '';
        return {
          code,
          storeId: c.storeId,
          customerId: c.id,
          phone: c.phone!,
          storeName: store?.name || '',
          naverPlaceUrl: effectiveNaver || null,
        };
      });

      const retargetRows = couponRows.map((cr) => ({
        code: cr.code,
        storeId: cr.storeId,
        customerId: cr.customerId,
        phone: cr.phone,
        couponContent: couponContent.trim(),
        expiryDate: expiryDate.trim(),
        naverPlaceUrl: cr.naverPlaceUrl,
      }));

      const outboxRows = couponRows.map((cr) => ({
        storeId: cr.storeId,
        customerId: cr.customerId,
        phone: cr.phone,
        messageType: 'RETARGET_COUPON' as const,
        templateId,
        variables: {
          '#{상호}': cr.storeName,
          '#{쿠폰내용}': couponContent.trim(),
          '#{유효기간}': expiryDate.trim(),
          '#{네이버플레이스}': (cr.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
          '#{직원확인}': `${domain}/coupon/verify/${cr.code}`,
        } as any,
        idempotencyKey: `retarget-coupon-${cr.code}`,
        status: 'PENDING' as const,
      }));

      const chunkCost = slice.length * COUPON_COST_PER_MESSAGE;

      try {
        await prisma.$transaction(async (tx) => {
          const couponInsert = await (tx as any).retargetCoupon.createMany({
            data: retargetRows,
            skipDuplicates: true,
          });
          const outboxInsert = await tx.alimTalkOutbox.createMany({
            data: outboxRows,
            skipDuplicates: true,
          });
          const ok = Math.min(couponInsert.count, outboxInsert.count);
          queued += ok;
          dropped += slice.length - ok;

          const effectiveCost = ok * COUPON_COST_PER_MESSAGE;
          if (effectiveCost > 0) {
            await tx.franchiseWallet.update({
              where: { franchiseId },
              data: { balance: { decrement: effectiveCost } },
            });
          }
        });
      } catch (chunkErr) {
        console.error(`[FranchiseRetargetCoupon] chunk ${i}-${i + slice.length} failed:`, chunkErr);
        dropped += slice.length;
      }
    }

    console.log(`[FranchiseRetargetCoupon] franchiseId=${franchiseId} resolved=${resolved.length} queued=${queued} dropped=${dropped}`);

    res.json({
      success: true,
      message: `${queued.toLocaleString()}명에게 쿠폰 알림톡 발송이 예약되었습니다.${dropped > 0 ? ` (${dropped}명은 일시적 충돌로 제외)` : ''}`,
      count: queued,
      resolved: resolved.length,
      queued,
      dropped,
      maxRecipients: MAX_RECIPIENTS_PER_SEND,
    });
  } catch (error) {
    console.error('Failed to send franchise retarget coupon:', error);
    res.status(500).json({ error: '쿠폰 발송에 실패했습니다.' });
  }
});

export default router;
