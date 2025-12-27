import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 토스페이먼츠 시크릿 키
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

// POST /api/payments/confirm - 토스페이먼츠 결제 승인
router.post('/confirm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { paymentKey, orderId, amount } = req.body;

    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });
    }

    // 이미 처리된 결제인지 확인 (중복 충전 방지)
    // MySQL JSON 필드에서 paymentKey로 검색
    const existingTransaction = await prisma.paymentTransaction.findFirst({
      where: {
        storeId,
        meta: {
          string_contains: `"paymentKey":"${paymentKey}"`,
        },
      },
    });

    if (existingTransaction) {
      // 이미 처리된 결제 - 성공 응답 반환 (중복 충전 방지)
      const wallet = await prisma.wallet.findUnique({ where: { storeId } });
      return res.json({
        success: true,
        amount: existingTransaction.amount,
        newBalance: wallet?.balance || 0,
        paymentKey,
        orderId,
        alreadyProcessed: true,
      });
    }

    // 토스페이먼츠 결제 승인 API 호출
    const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');

    const confirmResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    const confirmData = await confirmResponse.json() as {
      status?: string;
      code?: string;
      message?: string;
      totalAmount?: number;
      method?: string;
      card?: {
        company?: string;
        number?: string;
      };
    };

    // 결제 승인 실패 처리
    if (!confirmResponse.ok) {
      // S008 에러 또는 이미 승인된 결제인 경우 - 토스에서 결제 상태 확인
      const isRecoverableError =
        confirmData.code === 'ALREADY_PROCESSED_PAYMENT' ||
        confirmData.code === 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING' ||
        (confirmData.message && confirmData.message.includes('S008'));

      console.error('Payment confirm failed, isRecoverableError:', isRecoverableError, 'code:', confirmData.code);

      if (isRecoverableError) {
        // 토스페이먼츠에서 결제 상태 확인
        const paymentResponse = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}`, {
          headers: {
            Authorization: `Basic ${encryptedSecretKey}`,
          },
        });

        console.error('Payment status check response ok:', paymentResponse.ok);

        if (paymentResponse.ok) {
          const paymentData = await paymentResponse.json() as {
            status?: string;
            totalAmount?: number;
            method?: string;
            card?: { company?: string; number?: string };
          };

          console.error('Payment status from Toss:', paymentData.status, 'amount:', paymentData.totalAmount);

          if (paymentData.status === 'DONE') {
            // DB에 없지만 토스에서는 성공 - 충전 처리
            const chargeAmount = paymentData.totalAmount || amount;

            const wallet = await prisma.wallet.upsert({
              where: { storeId },
              update: { balance: { increment: chargeAmount } },
              create: { storeId, balance: chargeAmount },
            });

            await prisma.paymentTransaction.create({
              data: {
                storeId,
                amount: chargeAmount,
                type: 'TOPUP',
                status: 'SUCCESS',
                meta: {
                  source: 'tosspayments',
                  paymentKey,
                  orderId,
                  totalAmount: chargeAmount,
                  method: paymentData.method,
                  card: paymentData.card,
                  recoveredFromError: confirmData.code,
                },
              },
            });

            console.error('Payment recovered successfully, amount:', chargeAmount);

            return res.json({
              success: true,
              amount: chargeAmount,
              newBalance: wallet.balance,
              paymentKey,
              orderId,
            });
          }
        }
      }

      console.error('TossPayments confirm error:', confirmData);
      return res.status(400).json({
        error: confirmData.message || '결제 승인에 실패했습니다.',
        code: confirmData.code,
      });
    }

    // 결제 성공 - 지갑에 충전금 추가 (결제 금액 그대로 충전)
    const chargeAmount = amount;

    // Update wallet
    const wallet = await prisma.wallet.upsert({
      where: { storeId },
      update: {
        balance: { increment: chargeAmount },
      },
      create: {
        storeId,
        balance: chargeAmount,
      },
    });

    // Record transaction
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount: chargeAmount,
        type: 'TOPUP',
        status: 'SUCCESS',
        meta: {
          source: 'tosspayments',
          paymentKey,
          orderId,
          totalAmount: amount,
          method: confirmData.method,
          card: confirmData.card,
        },
      },
    });

    res.json({
      success: true,
      amount: chargeAmount,
      newBalance: wallet.balance,
      paymentKey,
      orderId,
    });
  } catch (error) {
    console.error('Payment confirm error:', error);
    res.status(500).json({ error: '결제 처리 중 오류가 발생했습니다.' });
  }
});

// GET /api/payments/:paymentKey - 결제 조회
router.get('/:paymentKey', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { paymentKey } = req.params;

    const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');

    const response = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}`, {
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Payment get error:', error);
    res.status(500).json({ error: '결제 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
