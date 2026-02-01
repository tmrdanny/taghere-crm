import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 토스페이먼츠 시크릿 키
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_WEBHOOK_SECRET = process.env.TOSS_WEBHOOK_SECRET || '';

// 금액에 따른 보너스율 계산 (프론트엔드와 동일하게 유지)
const getBonusRate = (amount: number): number => {
  if (amount >= 1000000) return 7;
  if (amount >= 500000) return 5;
  if (amount >= 200000) return 3;
  return 0;
};

// 보너스 포함 충전 금액 계산
const getChargeAmountWithBonus = (amount: number): number => {
  const bonusRate = getBonusRate(amount);
  return Math.floor(amount * (1 + bonusRate / 100));
};

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
            // DB에 없지만 토스에서는 성공 - 충전 처리 (보너스 포함)
            const paidAmount = paymentData.totalAmount || amount;
            const chargeAmount = getChargeAmountWithBonus(paidAmount);
            const recoveryBonusRate = getBonusRate(paidAmount);
            const recoveryBonusAmount = chargeAmount - paidAmount;

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
                  paidAmount,
                  chargedAmount: chargeAmount,
                  bonusRate: recoveryBonusRate,
                  bonusAmount: recoveryBonusAmount,
                  method: paymentData.method,
                  card: paymentData.card,
                  recoveredFromError: confirmData.code,
                },
              },
            });

            console.error('Payment recovered successfully, paid:', paidAmount, 'charged:', chargeAmount);

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

    // 결제 성공 - 지갑에 충전금 추가 (보너스 포함)
    const chargeAmount = getChargeAmountWithBonus(amount);
    const bonusRate = getBonusRate(amount);
    const bonusAmount = chargeAmount - amount;

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
          paidAmount: amount,
          chargedAmount: chargeAmount,
          bonusRate,
          bonusAmount,
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

// 토스페이먼츠 웹훅 시그니처 검증
function verifyWebhookSignature(
  payload: string,
  signature: string,
  transmissionTime: string
): boolean {
  if (!TOSS_WEBHOOK_SECRET) {
    console.warn('TOSS_WEBHOOK_SECRET not configured, skipping signature verification');
    return true; // 개발 환경에서는 시크릿 없이 허용
  }

  try {
    const message = `${payload}:${transmissionTime}`;
    const expectedSignature = crypto
      .createHmac('sha256', TOSS_WEBHOOK_SECRET)
      .update(message)
      .digest('base64');

    // v1: 뒤에 오는 값들과 비교
    const signatureParts = signature.split(',');
    for (const part of signatureParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('v1=')) {
        const sig = trimmed.substring(3);
        if (sig === expectedSignature) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
}

// 토스페이먼츠 웹훅 페이로드 타입
interface TossWebhookPayload {
  eventType: string;
  createdAt: string;
  data: {
    paymentKey: string;
    status: string;
    orderId: string;
    transactionKey?: string;
    cancelAmount?: number;
    cancelReason?: string;
  };
}

// POST /api/payments/webhook - 토스페이먼츠 웹훅 수신
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['tosspayments-webhook-signature'] as string;
    const transmissionTime = req.headers['tosspayments-webhook-transmission-time'] as string;
    const transmissionId = req.headers['tosspayments-webhook-transmission-id'] as string;

    console.log('Received TossPayments webhook:', {
      transmissionId,
      transmissionTime,
      body: req.body,
    });

    // 시그니처 검증 (시크릿이 설정된 경우에만)
    if (TOSS_WEBHOOK_SECRET && signature && transmissionTime) {
      const payload = JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(payload, signature, transmissionTime);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const webhookData = req.body as TossWebhookPayload;
    const { eventType, data } = webhookData;

    // PAYMENT_STATUS_CHANGED 이벤트 처리
    if (eventType === 'PAYMENT_STATUS_CHANGED') {
      const { paymentKey, status, orderId } = data;

      console.log('Payment status changed:', { paymentKey, status, orderId });

      // 취소 상태인 경우 처리
      if (status === 'CANCELED' || status === 'PARTIAL_CANCELED') {
        // 원본 결제 트랜잭션 찾기
        const originalTransaction = await prisma.paymentTransaction.findFirst({
          where: {
            meta: {
              string_contains: `"paymentKey":"${paymentKey}"`,
            },
            type: 'TOPUP',
            status: 'SUCCESS',
          },
        });

        if (!originalTransaction) {
          console.log('Original transaction not found for paymentKey:', paymentKey);
          // 원본 트랜잭션이 없어도 성공 응답 (중복 웹훅 방지)
          return res.status(200).json({ success: true, message: 'No matching transaction' });
        }

        // 이미 취소 처리된 건인지 확인
        const existingRefund = await prisma.paymentTransaction.findFirst({
          where: {
            meta: {
              string_contains: `"originalPaymentKey":"${paymentKey}"`,
            },
            type: 'REFUND',
          },
        });

        if (existingRefund) {
          console.log('Refund already processed for paymentKey:', paymentKey);
          return res.status(200).json({ success: true, message: 'Already processed' });
        }

        // 토스페이먼츠에서 취소 상세 정보 조회
        const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
        const paymentResponse = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}`, {
          headers: {
            Authorization: `Basic ${encryptedSecretKey}`,
          },
        });

        let cancelAmount = originalTransaction.amount; // 기본값: 전액 취소
        let cancelReason = '토스페이먼츠 취소';

        if (paymentResponse.ok) {
          const paymentData = await paymentResponse.json() as {
            cancels?: Array<{
              cancelAmount: number;
              cancelReason: string;
              canceledAt: string;
            }>;
          };

          if (paymentData.cancels && paymentData.cancels.length > 0) {
            // 가장 최근 취소 정보 사용
            const latestCancel = paymentData.cancels[paymentData.cancels.length - 1];
            cancelAmount = latestCancel.cancelAmount;
            cancelReason = latestCancel.cancelReason;
          }
        }

        // REFUND 트랜잭션 생성 (음수 금액으로 기록)
        await prisma.paymentTransaction.create({
          data: {
            storeId: originalTransaction.storeId,
            amount: -cancelAmount, // 음수로 기록하여 매출에서 차감
            type: 'REFUND',
            status: 'SUCCESS',
            meta: {
              source: 'tosspayments',
              originalPaymentKey: paymentKey,
              originalOrderId: orderId,
              cancelAmount,
              cancelReason,
              cancelStatus: status,
              webhookTransmissionId: transmissionId,
            },
          },
        });

        console.log('Refund recorded:', {
          storeId: originalTransaction.storeId,
          cancelAmount,
          cancelReason,
          originalPaymentKey: paymentKey,
        });
      }
    }

    // 웹훅 수신 성공 응답
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // 웹훅 에러시에도 200 반환 (재시도 방지)
    res.status(200).json({ success: false, error: 'Processing error' });
  }
});

export default router;
