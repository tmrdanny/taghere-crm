import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { customAlphabet } from 'nanoid';
import { calculateCostWithCredits, useCredits } from '../services/credit-service.js';
import { resolveTargetCustomerIds } from '../lib/customer-filters.js';

const router = Router();

const COUPON_COST_PER_MESSAGE = 50; // 건당 50원

// 1회 발송 최대 인원 (안전망 — 워커/지갑/SOLAPI 대량 트랜잭션 부하 보호)
const MAX_RECIPIENTS_PER_SEND = 3000;

// DB createMany 청크 크기 (Prisma connection pool 보호)
const INSERT_CHUNK_SIZE = 500;

// 쿠폰 코드 생성기 (10자리, 헷갈리는 문자 제외)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

// GET /api/retarget-coupon/settings - 매장 설정 조회
router.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        name: true,
        naverPlaceUrl: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json({
      storeName: store.name,
      naverPlaceUrl: store.naverPlaceUrl || '',
    });
  } catch (error) {
    console.error('Failed to fetch retarget coupon settings:', error);
    res.status(500).json({ error: '설정을 불러오는데 실패했습니다.' });
  }
});

// GET /api/retarget-coupon/estimate - 비용 예상 (무료 크레딧 포함)
router.get('/estimate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const targetCount = parseInt(req.query.targetCount as string) || 0;

    // 무료 크레딧 적용 계산 (isRetarget = true)
    const creditResult = await calculateCostWithCredits(
      storeId,
      targetCount,
      COUPON_COST_PER_MESSAGE,
      true // 리타겟 쿠폰이므로 무료 크레딧 적용
    );

    // 지갑 잔액 조회
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    res.json({
      targetCount,
      costPerMessage: COUPON_COST_PER_MESSAGE,
      totalCost: creditResult.totalCost,
      walletBalance: wallet?.balance || 0,
      canSend: (wallet?.balance || 0) >= creditResult.totalCost,
      freeCredits: {
        remaining: creditResult.remainingCredits,
        freeCount: creditResult.freeCount,
        paidCount: creditResult.paidCount,
      },
    });
  } catch (error) {
    console.error('Failed to estimate retarget coupon cost:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/retarget-coupon/send - 쿠폰 알림톡 발송
router.post('/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const {
      customerIds,
      couponContent,
      expiryDate,
      naverPlaceUrl,
      // 신규: 서버에서 대상 고객을 직접 해소 (프론트가 페이지네이션 미지정으로 /api/customers를 호출해
      //       발송 대상이 50명으로 잘리던 버그 회피)
      targetType,
      genderFilter,
      ageGroups,
      regionSidos,
      regionSigungus,
    } = req.body;

    if (!couponContent || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }

    if (!expiryDate || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }

    // 발송 대상 결정 분기:
    //   - targetType이 ALL/REVISIT/NEW이면 서버에서 필터 기반 전체 매칭 고객 조회 (페이지네이션 없음)
    //   - targetType이 CUSTOM 또는 미지정이면 customerIds 사용 (기존 호환)
    const serverResolved = targetType && ['ALL', 'REVISIT', 'NEW'].includes(targetType);
    if (!serverResolved && (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0)) {
      return res.status(400).json({ error: '발송할 고객을 선택해주세요.' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, naverPlaceUrl: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 발송 대상 고객 조회 (id + phone, 페이지네이션 없음)
    const resolved = await resolveTargetCustomerIds(prisma, storeId, {
      targetType,
      customerIds,
      genderFilter,
      ageGroups,
      regionSidos,
      regionSigungus,
    });

    const requested = serverResolved ? resolved.length : (Array.isArray(customerIds) ? customerIds.length : 0);

    if (resolved.length === 0) {
      return res.status(400).json({ error: '발송 가능한 고객이 없습니다.' });
    }

    // 1회 최대 발송 인원 초과 시 명시적 에러 (사용자가 캡을 인지하도록)
    if (resolved.length > MAX_RECIPIENTS_PER_SEND) {
      return res.status(400).json({
        error: `1회 발송 최대 인원(${MAX_RECIPIENTS_PER_SEND.toLocaleString()}명)을 초과했습니다. 현재 ${resolved.length.toLocaleString()}명. 필터를 좁히거나 나눠 발송해 주세요.`,
        requested,
        maxRecipients: MAX_RECIPIENTS_PER_SEND,
      });
    }

    // 무료 크레딧 적용 비용 계산 (실제 대상 수 기준)
    const creditResult = await calculateCostWithCredits(
      storeId,
      resolved.length,
      COUPON_COST_PER_MESSAGE,
      true,
    );

    // 지갑 잔액 확인 (유료분만 확인)
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (creditResult.paidCount > 0 && (!wallet || wallet.balance < creditResult.totalCost)) {
      return res.status(400).json({
        error: `충전금이 부족합니다. 필요: ${creditResult.totalCost.toLocaleString()}원, 잔액: ${(wallet?.balance || 0).toLocaleString()}원`,
        requested,
        resolved: resolved.length,
        requiredCost: creditResult.totalCost,
        walletBalance: wallet?.balance || 0,
      });
    }

    // 도메인 설정 (환경별)
    const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3999';
    const domain = appUrl.replace(/^https?:\/\//, '');

    // 알림톡 템플릿 ID / pfId
    const templateId = process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) {
      return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });
    }
    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(500).json({ error: 'SOLAPI 채널이 설정되지 않았습니다.' });
    }

    // ── 청크 단위 createMany + 트랜잭션 (지갑 차감과 동일 트랜잭션 보장)
    // Promise.all per-row create를 사용하면 수천 건 발송 시 Prisma 풀이 고갈되어 mid-batch 실패가 발생함.
    let queued = 0;
    let dropped = 0;
    const droppedReasons: { phoneMissing?: number; codeCollision?: number } = {};
    const codePoolDedup = new Set<string>();
    const couponCodes: string[] = []; // 응답용 (디버그/감사)

    for (let i = 0; i < resolved.length; i += INSERT_CHUNK_SIZE) {
      const slice = resolved.slice(i, i + INSERT_CHUNK_SIZE);

      // 각 row에 대해 코드 사전 생성 (배치 내 중복 회피)
      const couponRows = slice.map((c) => {
        let code = generateCouponCode();
        let guard = 0;
        while (codePoolDedup.has(code) && guard < 5) {
          code = generateCouponCode();
          guard++;
        }
        codePoolDedup.add(code);
        return {
          code,
          storeId,
          customerId: c.id,
          phone: c.phone!,
          couponContent: couponContent.trim(),
          expiryDate: expiryDate.trim(),
          naverPlaceUrl: naverPlaceUrl || store.naverPlaceUrl || null,
        };
      });

      // alimTalkOutbox는 동일 트랜잭션에서 함께 생성. idempotencyKey = 쿠폰코드 (글로벌 unique).
      const outboxRows = couponRows.map((cr) => ({
        storeId,
        customerId: cr.customerId,
        phone: cr.phone,
        messageType: 'RETARGET_COUPON' as const,
        templateId,
        variables: {
          '#{상호}': store.name,
          '#{쿠폰내용}': couponContent.trim(),
          '#{유효기간}': expiryDate.trim(),
          '#{네이버플레이스}': (naverPlaceUrl || store.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
          '#{직원확인}': `${domain}/coupon/verify/${cr.code}`,
        } as any,
        idempotencyKey: `retarget-coupon-${cr.code}`,
        status: 'PENDING' as const,
      }));

      // 이 청크의 유료분 비용 (지갑 차감용). 무료 크레딧 분배 단순화: 청크별 비율 대신
      // 사전 계산된 전체 paidCount를 청크 비율로 차감.
      const chunkPaidCount = Math.round((creditResult.paidCount * slice.length) / resolved.length);
      const chunkCost = chunkPaidCount * COUPON_COST_PER_MESSAGE;

      try {
        await prisma.$transaction(async (tx) => {
          const couponInsert = await (tx as any).retargetCoupon.createMany({
            data: couponRows,
            skipDuplicates: true, // 코드 글로벌 unique 충돌 시 silent skip
          });
          const outboxInsert = await tx.alimTalkOutbox.createMany({
            data: outboxRows,
            skipDuplicates: true,
          });
          // 두 insert가 다르면 정합성 깨짐 — 보수적으로 작은 쪽 기준
          const ok = Math.min(couponInsert.count, outboxInsert.count);
          queued += ok;
          dropped += slice.length - ok;
          if (slice.length - ok > 0) {
            droppedReasons.codeCollision = (droppedReasons.codeCollision || 0) + (slice.length - ok);
          }

          // 지갑에서 유료 비용 즉시 차감 (mid-batch 동시 발송으로 인한 잔액 부족 방지)
          if (chunkCost > 0) {
            await tx.wallet.update({
              where: { storeId },
              data: { balance: { decrement: chunkCost } },
            });
            await tx.paymentTransaction.create({
              data: {
                storeId,
                amount: -chunkCost,
                type: 'ALIMTALK_SEND',
                status: 'SUCCESS',
                meta: {
                  messageType: 'RETARGET_COUPON_BATCH',
                  chunkSize: ok,
                  totalRequested: requested,
                } as any,
              },
            });
          }
        });

        // 응답용 (선택) — 너무 많으면 자르기
        if (couponCodes.length < 100) {
          for (const cr of couponRows.slice(0, 100 - couponCodes.length)) {
            couponCodes.push(cr.code);
          }
        }
      } catch (chunkErr) {
        console.error(`[RetargetCoupon] chunk ${i}-${i + slice.length} failed:`, chunkErr);
        dropped += slice.length;
        droppedReasons.codeCollision = (droppedReasons.codeCollision || 0) + slice.length;
      }
    }

    console.log(`[RetargetCoupon] storeId=${storeId} requested=${requested} resolved=${resolved.length} queued=${queued} dropped=${dropped}`);

    res.json({
      success: true,
      message: `${queued.toLocaleString()}명에게 쿠폰 알림톡 발송이 예약되었습니다.${dropped > 0 ? ` (${dropped}명은 일시적 충돌로 제외)` : ''}`,
      count: queued,
      requested,
      resolved: resolved.length,
      queued,
      dropped,
      droppedReasons: dropped > 0 ? droppedReasons : undefined,
      maxRecipients: MAX_RECIPIENTS_PER_SEND,
    });
  } catch (error) {
    console.error('Failed to send retarget coupon:', error);
    res.status(500).json({ error: '쿠폰 발송에 실패했습니다.' });
  }
});

// GET /api/retarget-coupon/history - 발송 내역 조회
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      (prisma as any).retargetCoupon.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: {
            select: { name: true, phone: true },
          },
        },
      }),
      (prisma as any).retargetCoupon.count({ where: { storeId } }),
    ]);

    res.json({
      coupons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch coupon history:', error);
    res.status(500).json({ error: '발송 내역을 불러오는데 실패했습니다.' });
  }
});

export default router;
