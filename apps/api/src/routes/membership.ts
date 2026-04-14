import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { enqueueCorporateAdAlimTalk } from '../services/solapi.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/membership/coupons
 * 활성화된 쿠폰 리스트 조회 (public)
 */
router.get('/coupons', async (_req: Request, res: Response) => {
  try {
    const coupons = await prisma.corporateAd.findMany({
      where: { enabled: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        brandName: true,
        imageUrl: true,
        couponName: true,
        couponContent: true,
        couponAmount: true,
        amountValue: true,
        expiryDate: true,
      },
    });

    res.json({ coupons });
  } catch (error) {
    console.error('[Membership] coupons list error:', error);
    res.status(500).json({ error: '쿠폰 목록 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * POST /api/membership/coupons/send
 * 선택한 쿠폰들을 알림톡으로 발송
 *
 * Body: { customerId: string, couponIds: string[] }
 * 응답: { success: true, sent: string[], skipped: string[], failed: string[] }
 */
router.post('/coupons/send', async (req: Request, res: Response) => {
  try {
    const { customerId, couponIds } = req.body as {
      customerId?: string;
      couponIds?: string[];
    };

    if (!customerId || !Array.isArray(couponIds) || couponIds.length === 0) {
      return res.status(400).json({ error: 'customerId와 couponIds가 필요합니다.' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    if (!customer.phone) {
      return res.status(400).json({ error: '전화번호가 없는 고객입니다.' });
    }

    const sent: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const couponId of couponIds) {
      try {
        const result = await enqueueCorporateAdAlimTalk({
          storeId: customer.storeId,
          customerId: customer.id,
          phone: customer.phone,
          couponId,
        });
        if (result.success) {
          sent.push(couponId);
        } else if (result.error === 'Already sent') {
          skipped.push(couponId);
        } else {
          failed.push(couponId);
        }
      } catch (err) {
        console.error(`[Membership] send coupon ${couponId} error:`, err);
        failed.push(couponId);
      }
    }

    res.json({ success: true, sent, skipped, failed });
  } catch (error) {
    console.error('[Membership] coupons send error:', error);
    res.status(500).json({ error: '쿠폰 발송 중 오류가 발생했습니다.' });
  }
});

/**
 * GET /api/membership/coupons/sent/:customerId
 * 해당 고객이 이미 발송받은 쿠폰 ID 리스트 조회
 */
router.get('/coupons/sent/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // idempotencyKey는 'corporate_ad:{storeId}:{customerId}:{couponId}' 형식
    const prefix = `corporate_ad:${customer.storeId}:${customer.id}:`;
    const records = await prisma.alimTalkOutbox.findMany({
      where: {
        idempotencyKey: { startsWith: prefix },
        status: { not: 'FAILED' },
      },
      select: { idempotencyKey: true },
    });

    const sentCouponIds = records.map((r) => r.idempotencyKey.replace(prefix, ''));
    res.json({ sentCouponIds });
  } catch (error) {
    console.error('[Membership] sent coupons error:', error);
    res.status(500).json({ error: '발송 내역 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
