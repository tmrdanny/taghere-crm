import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/wallet
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let wallet = await prisma.wallet.findUnique({ where: { storeId } });

    // Create wallet if not exists
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { storeId, balance: 0 },
      });
    }

    res.json({ balance: wallet.balance });
  } catch (error) {
    console.error('Wallet get error:', error);
    res.status(500).json({ error: '지갑 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/wallet/topup - 개발용 충전
router.post('/topup', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '충전 금액을 입력해주세요.' });
    }

    // Update wallet
    const wallet = await prisma.wallet.upsert({
      where: { storeId },
      update: {
        balance: { increment: amount },
      },
      create: {
        storeId,
        balance: amount,
      },
    });

    // Record transaction
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount,
        type: 'TOPUP',
        status: 'SUCCESS',
        meta: { source: 'dev' },
      },
    });

    res.json({
      success: true,
      newBalance: wallet.balance,
      topupAmount: amount,
    });
  } catch (error) {
    console.error('Wallet topup error:', error);
    res.status(500).json({ error: '충전 중 오류가 발생했습니다.' });
  }
});

// GET /api/wallet/transactions
router.get('/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.paymentTransaction.count({ where: { storeId } }),
    ]);

    res.json({
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Wallet transactions error:', error);
    res.status(500).json({ error: '결제 내역 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
