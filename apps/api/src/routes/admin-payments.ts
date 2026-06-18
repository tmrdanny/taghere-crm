import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/payments - 전체 결제내역 조회
router.get('/payments', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      type,
      status,
      storeId,
      startDate,
      endDate,
      search,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // 필터 조건 구성
    const where: any = {};

    if (type && type !== 'all') {
      where.type = type;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (storeId) {
      where.storeId = storeId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // 검색 (매장명)
    if (search) {
      where.store = {
        name: { contains: search as string },
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              ownerName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    // 통계 계산
    const stats = await prisma.paymentTransaction.aggregate({
      where: {
        ...where,
        status: 'SUCCESS',
      },
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        storeId: t.storeId,
        storeName: t.store.name,
        ownerName: t.store.ownerName,
        amount: t.amount,
        type: t.type,
        status: t.status,
        meta: t.meta,
        createdAt: t.createdAt,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      stats: {
        totalAmount: stats._sum.amount || 0,
        totalCount: stats._count,
      },
    });
  } catch (error) {
    console.error('Admin payments list error:', error);
    res.status(500).json({ error: '결제내역 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/payments/summary - 결제 통계 요약
router.get('/payments/summary', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { period = '30days' } = req.query;

    let startDate: Date;
    const now = new Date();

    switch (period) {
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 유형별 통계
    const [topupStats, deductStats, totalStats] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: {
          type: 'TOPUP',
          status: 'SUCCESS',
          createdAt: { gte: startDate },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.paymentTransaction.aggregate({
        where: {
          type: 'DEDUCT',
          status: 'SUCCESS',
          createdAt: { gte: startDate },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.paymentTransaction.aggregate({
        where: {
          status: 'SUCCESS',
          createdAt: { gte: startDate },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    res.json({
      period,
      topup: {
        totalAmount: topupStats._sum.amount || 0,
        count: topupStats._count,
      },
      deduct: {
        totalAmount: Math.abs(deductStats._sum.amount || 0),
        count: deductStats._count,
      },
      total: {
        netAmount: totalStats._sum.amount || 0,
        count: totalStats._count,
      },
    });
  } catch (error) {
    console.error('Admin payments summary error:', error);
    res.status(500).json({ error: '결제 통계 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
