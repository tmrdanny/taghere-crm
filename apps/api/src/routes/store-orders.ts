/**
 * 스토어 주문 API
 *
 * - POST /api/store-orders - 주문 생성 (결제 전)
 * - POST /api/store-orders/confirm - 결제 확인 (TossPayments + SMS 발송)
 * - GET /api/store-orders - 내 주문 내역 조회
 */

import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { randomBytes } from 'crypto';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// 주문번호 생성 (YYYYMMDD + 6자리 랜덤)
function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = randomBytes(3).toString('hex').toUpperCase();
  return `${date}${random}`;
}

// SMS 발송 함수 (Solapi)
async function sendOrderNotificationSms(
  orderNumber: string,
  customerName: string,
  customerPhone: string,
  productNames: string[],
  totalAmount: number,
  paidAt: Date
): Promise<void> {
  const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY;
  const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET;
  const ADMIN_PHONE = '01027636023';

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET) {
    console.error('SOLAPI credentials not configured');
    return;
  }

  try {
    // HMAC-SHA256 서명 생성
    const crypto = await import('crypto');
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const signature = crypto
      .createHmac('sha256', SOLAPI_API_SECRET)
      .update(date + salt)
      .digest('hex');

    const message = `[태그히어 스토어 주문]
주문번호: ${orderNumber}
구매자: ${customerName} (${customerPhone})
상품: ${productNames.join(', ')}
금액: ${totalAmount.toLocaleString()}원
결제시간: ${paidAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;

    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({
        message: {
          to: ADMIN_PHONE,
          from: process.env.SOLAPI_SENDER_NUMBER || '01027636023',
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send SMS:', error);
    } else {
      console.log('Order notification SMS sent successfully');
    }
  } catch (error) {
    console.error('Failed to send order notification SMS:', error);
  }
}

/**
 * POST /api/store-orders
 * 주문 생성 (결제 전)
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const { customerName, customerPhone, customerEmail, items } = req.body;

    if (!customerName || !customerPhone || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: '필수 정보가 누락되었습니다.',
      });
    }

    // 상품 정보 조회
    const productIds = items.map((item: { productId: string }) => item.productId);
    const products = await prisma.storeProduct.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        error: '일부 상품을 찾을 수 없습니다.',
      });
    }

    // 총 금액 계산
    let totalAmount = 0;
    const orderItems = items.map((item: { productId: string; quantity: number }) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw new Error('Product not found');
      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;
      return {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: item.quantity,
      };
    });

    // 주문 생성
    const orderNumber = generateOrderNumber();
    const order = await prisma.storeOrder.create({
      data: {
        orderNumber,
        storeId,
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
        totalAmount,
        status: 'PENDING',
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        items: order.items,
      },
    });
  } catch (error) {
    console.error('Failed to create store order:', error);
    res.status(500).json({
      success: false,
      error: '주문 생성 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/store-orders/confirm
 * 결제 확인 (TossPayments 연동 + SMS 발송)
 */
router.post('/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { paymentKey, orderId, amount } = req.body;

    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: '결제 정보가 누락되었습니다.',
      });
    }

    // 주문 조회
    const order = await prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '주문을 찾을 수 없습니다.',
      });
    }

    if (order.status === 'PAID') {
      return res.status(400).json({
        success: false,
        error: '이미 결제가 완료된 주문입니다.',
      });
    }

    // 금액 검증
    if (order.totalAmount !== amount) {
      return res.status(400).json({
        success: false,
        error: '결제 금액이 일치하지 않습니다.',
      });
    }

    // TossPayments 결제 확인
    const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
    if (!TOSS_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: '결제 서비스 설정이 누락되었습니다.',
      });
    }

    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId: order.orderNumber,
        amount,
      }),
    });

    if (!tossResponse.ok) {
      const errorData = await tossResponse.json() as { message?: string };
      console.error('TossPayments error:', errorData);
      return res.status(400).json({
        success: false,
        error: errorData.message || '결제 확인에 실패했습니다.',
      });
    }

    const tossData = await tossResponse.json() as { paymentKey: string };
    const paidAt = new Date();

    // 주문 상태 업데이트
    const updatedOrder = await prisma.storeOrder.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paymentKey: tossData.paymentKey,
        paidAt,
      },
      include: {
        items: true,
      },
    });

    // SMS 발송 (비동기)
    const productNames = updatedOrder.items.map(item => item.productName);
    sendOrderNotificationSms(
      updatedOrder.orderNumber,
      updatedOrder.customerName,
      updatedOrder.customerPhone,
      productNames,
      updatedOrder.totalAmount,
      paidAt
    ).catch(err => console.error('SMS send error:', err));

    res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Failed to confirm payment:', error);
    res.status(500).json({
      success: false,
      error: '결제 확인 중 오류가 발생했습니다.',
    });
  }
});

/**
 * GET /api/store-orders
 * 내 주문 내역 조회
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;

    const orders = await prisma.storeOrder.findMany({
      where: { storeId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error('Failed to get store orders:', error);
    res.status(500).json({
      success: false,
      error: '주문 내역 조회 중 오류가 발생했습니다.',
    });
  }
});

export default router;
