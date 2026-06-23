import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/store-orders - 전체 주문 목록
router.get('/store-orders', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { status, page = '1', limit = '50' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = status ? { status: status as 'PENDING' | 'PAID' | 'CANCELLED' } : {};

    const [orders, total] = await Promise.all([
      prisma.storeOrder.findMany({
        where,
        include: {
          store: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.storeOrder.count({ where }),
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Admin get store orders error:', error);
    res.status(500).json({ error: '주문 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
