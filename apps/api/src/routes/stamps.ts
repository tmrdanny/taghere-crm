import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// POST /api/stamps/earn - 스탬프 적립 (CRM에서 수동 적립)
router.post('/earn', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, reason } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    // 매장 스탬프 설정 확인
    const setting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });

    if (!setting?.enabled) {
      return res.status(400).json({ error: '스탬프 기능이 비활성화되어 있습니다.' });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 오늘 이미 적립했는지 확인 (1일 1회 제한) - [DEV] 테스트를 위해 비활성화. 배포 시 주석 해제 필요
    // const todayStart = new Date();
    // todayStart.setHours(0, 0, 0, 0);

    // const todayEarn = await prisma.stampLedger.findFirst({
    //   where: {
    //     storeId,
    //     customerId,
    //     type: 'EARN',
    //     createdAt: { gte: todayStart },
    //   },
    // });

    // if (todayEarn) {
    //   return res.status(400).json({
    //     error: '오늘 이미 스탬프를 적립했습니다.',
    //     alreadyEarned: true,
    //     currentStamps: customer.totalStamps,
    //   });
    // }

    // 스탬프 적립 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = customer.totalStamps + 1;

      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: 'EARN',
          delta: 1,
          balance: newBalance,
          earnMethod: 'MANUAL',
          reason: reason || '수동 적립',
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    res.json({
      success: true,
      currentStamps: result.customer.totalStamps,
      customerId,
    });
  } catch (error) {
    console.error('Stamp earn error:', error);
    res.status(500).json({ error: '스탬프 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/use - 스탬프 사용 (5개 또는 10개)
router.post('/use', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, amount } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    // 5개 또는 10개만 사용 가능
    if (amount !== 5 && amount !== 10) {
      return res.status(400).json({ error: '5개 또는 10개 단위로만 사용 가능합니다.' });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 잔액 확인
    if (customer.totalStamps < amount) {
      return res.status(400).json({
        error: `스탬프가 부족합니다. (현재: ${customer.totalStamps}개)`,
      });
    }

    // 스탬프 사용 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = customer.totalStamps - amount;
      const ledgerType = amount === 5 ? 'USE_5' : 'USE_10';

      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: ledgerType,
          delta: -amount,
          balance: newBalance,
          reason: `${amount}개 보상 사용`,
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    res.json({
      success: true,
      usedAmount: amount,
      remainingStamps: result.customer.totalStamps,
    });
  } catch (error) {
    console.error('Stamp use error:', error);
    res.status(500).json({ error: '스탬프 사용 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/adjust - 스탬프 조정 (관리자)
router.post('/adjust', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, delta, reason } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    if (typeof delta !== 'number' || delta === 0) {
      return res.status(400).json({ error: '조정할 스탬프 수를 입력해주세요.' });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 차감 시 잔액 확인
    const newBalance = customer.totalStamps + delta;
    if (newBalance < 0) {
      return res.status(400).json({
        error: `스탬프가 부족합니다. (현재: ${customer.totalStamps}개)`,
      });
    }

    // 스탬프 조정 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: delta > 0 ? 'ADMIN_ADD' : 'ADMIN_REMOVE',
          delta,
          balance: newBalance,
          reason: reason || (delta > 0 ? '관리자 추가' : '관리자 차감'),
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    res.json({
      success: true,
      adjustedAmount: delta,
      currentStamps: result.customer.totalStamps,
    });
  } catch (error) {
    console.error('Stamp adjust error:', error);
    res.status(500).json({ error: '스탬프 조정 중 오류가 발생했습니다.' });
  }
});

// GET /api/stamps/history/:customerId - 고객 스탬프 내역 조회
router.get('/history/:customerId', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 스탬프 내역 조회
    const [history, total] = await Promise.all([
      prisma.stampLedger.findMany({
        where: { customerId, storeId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.stampLedger.count({
        where: { customerId, storeId },
      }),
    ]);

    res.json({
      currentStamps: customer.totalStamps,
      history: history.map((h) => ({
        id: h.id,
        type: h.type,
        delta: h.delta,
        balance: h.balance,
        reason: h.reason,
        earnMethod: h.earnMethod,
        createdAt: h.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error('Get stamp history error:', error);
    res.status(500).json({ error: '스탬프 내역 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
