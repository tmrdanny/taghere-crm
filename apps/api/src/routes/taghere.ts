import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const TAGHERE_API_URL = process.env.TAGHERE_API_URL || 'https://api.d.tag-here.com';
const TAGHERE_API_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || '';

interface TaghereOrderData {
  resultPrice?: number;
  totalPrice?: number;
  orderItems?: any[];
  items?: any[];
}

// TagHere API에서 주문 정보 조회
async function fetchOrdersheet(ordersheetId: string): Promise<TaghereOrderData> {
  const response = await fetch(
    `${TAGHERE_API_URL}/webhook/crm/ordersheet?ordersheetId=${ordersheetId}`,
    {
      headers: {
        Authorization: `Bearer ${TAGHERE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TagHere] API error:', response.status, errorText);
    throw new Error(`TagHere API error: ${response.status}`);
  }

  return response.json() as Promise<TaghereOrderData>;
}

// GET /api/taghere/ordersheet - 주문 정보 조회 및 적립 예정 포인트 계산 (공개 API)
router.get('/ordersheet', async (req, res) => {
  try {
    const { ordersheetId, slug } = req.query;

    if (!ordersheetId) {
      return res.status(400).json({ error: 'ordersheetId is required' });
    }

    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findFirst({
      where: { slug: slug as string },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        pointRateEnabled: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // TagHere API 호출
    const orderData = await fetchOrdersheet(ordersheetId as string);

    console.log('[TagHere] Ordersheet data:', JSON.stringify(orderData, null, 2));

    // resultPrice 추출
    const resultPrice = orderData.resultPrice || orderData.totalPrice || 0;

    // 적립률 계산 (기본 5%)
    const ratePercent = store.pointRatePercent || 5;
    const earnPoints = Math.floor(resultPrice * ratePercent / 100);

    // 이미 적립된 ordersheetId인지 확인
    const existingEarn = await prisma.pointLedger.findFirst({
      where: {
        storeId: store.id,
        type: 'EARN',
        reason: { contains: ordersheetId as string },
      },
    });

    res.json({
      storeId: store.id,
      storeName: store.name,
      ordersheetId,
      resultPrice,
      ratePercent,
      earnPoints,
      alreadyEarned: !!existingEarn,
      orderItems: orderData.orderItems || orderData.items || [],
    });
  } catch (error: any) {
    console.error('[TagHere] Ordersheet error:', error);
    res.status(500).json({ error: error.message || '주문 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/order-event - 주문 이벤트 (리뷰 자동요청 트리거)
router.post('/order-event', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { storeId, orderId, customerKakaoId, phone, items } = req.body;

    const targetStoreId = storeId || req.user!.storeId;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId가 필요합니다.' });
    }

    if (!customerKakaoId && !phone) {
      return res.status(400).json({ error: 'customerKakaoId 또는 phone이 필요합니다.' });
    }

    // Get review automation settings
    const settings = await prisma.reviewAutomationSetting.findUnique({
      where: { storeId: targetStoreId },
    });

    if (!settings || !settings.enabled) {
      return res.json({
        success: false,
        reason: 'review_automation_disabled',
        message: '리뷰 자동요청이 비활성화되어 있습니다.',
      });
    }

    // Find customer
    let customer = null;
    if (customerKakaoId) {
      customer = await prisma.customer.findFirst({
        where: { storeId: targetStoreId, kakaoId: customerKakaoId }
      });
    } else if (phone) {
      const phoneLastDigits = phone.replace(/[^0-9]/g, '').slice(-8);
      customer = await prisma.customer.findFirst({
        where: { storeId: targetStoreId, phoneLastDigits },
      });
    }

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { storeId: targetStoreId },
    });

    if (!wallet) {
      await prisma.reviewRequestLog.create({
        data: {
          storeId: targetStoreId,
          customerId: customer?.id,
          orderId,
          phone,
          status: 'FAILED',
          cost: 0,
          failReason: '지갑이 존재하지 않습니다',
        },
      });
      return res.json({
        success: false,
        reason: 'no_wallet',
        message: '지갑이 존재하지 않습니다.',
      });
    }

    const costPerSend = settings.costPerSend || 50;

    // Check balance and auto-topup
    if (wallet.balance < costPerSend) {
      // Try auto-topup
      if (settings.autoTopupEnabled) {
        const card = await prisma.card.findFirst({
          where: { storeId: targetStoreId, enabled: true, isDefault: true },
        });

        if (card) {
          // Simulate auto-topup (in production, call payment gateway)
          const topupAmount = settings.autoTopupAmount || 100000;

          await prisma.$transaction([
            prisma.wallet.update({
              where: { storeId: targetStoreId },
              data: { balance: { increment: topupAmount } },
            }),
            prisma.paymentTransaction.create({
              data: {
                storeId: targetStoreId,
                amount: topupAmount,
                type: 'TOPUP',
                status: 'SUCCESS',
                cardId: card.id,
                meta: { source: 'auto_topup', trigger: 'review_request' },
              },
            }),
          ]);

          console.log(`Auto-topup: ${topupAmount}원 충전 완료`);
        } else {
          // No card, fail
          await prisma.reviewRequestLog.create({
            data: {
              storeId: targetStoreId,
              customerId: customer?.id,
              orderId,
              phone,
              status: 'FAILED',
              cost: 0,
              failReason: '잔액 부족 및 등록된 카드 없음',
            },
          });

          return res.json({
            success: false,
            reason: 'insufficient_balance_no_card',
            message: '잔액이 부족하고 등록된 카드가 없습니다.',
          });
        }
      } else {
        // Auto-topup disabled
        await prisma.reviewRequestLog.create({
          data: {
            storeId: targetStoreId,
            customerId: customer?.id,
            orderId,
            phone,
            status: 'FAILED',
            cost: 0,
            failReason: '잔액 부족 (자동충전 비활성화)',
          },
        });

        return res.json({
          success: false,
          reason: 'insufficient_balance',
          message: '잔액이 부족합니다.',
        });
      }
    }

    // Deduct cost and create log
    const [updatedWallet, log] = await prisma.$transaction([
      prisma.wallet.update({
        where: { storeId: targetStoreId },
        data: { balance: { decrement: costPerSend } },
      }),
      prisma.reviewRequestLog.create({
        data: {
          storeId: targetStoreId,
          customerId: customer?.id,
          orderId,
          phone,
          status: 'SENT',
          cost: costPerSend,
          sentAt: new Date(),
        },
      }),
    ]);

    // In production, send actual KakaoTalk notification here
    console.log(`리뷰 요청 발송: orderId=${orderId}, cost=${costPerSend}원`);

    res.json({
      success: true,
      message: '리뷰 요청이 발송되었습니다.',
      logId: log.id,
      cost: costPerSend,
      newBalance: updatedWallet.balance,
    });
  } catch (error) {
    console.error('Order event error:', error);
    res.status(500).json({ error: '주문 이벤트 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
