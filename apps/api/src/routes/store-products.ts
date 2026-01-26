/**
 * 스토어 상품 API
 *
 * - GET /api/store-products - 활성 상품 목록 조회
 * - GET /api/store-products/:id - 상품 상세 조회
 */

import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

/**
 * GET /api/store-products
 * 활성 상품 목록 조회
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error('Failed to get store products:', error);
    res.status(500).json({
      success: false,
      error: '상품 목록 조회 중 오류가 발생했습니다.',
    });
  }
});

/**
 * GET /api/store-products/:id
 * 상품 상세 조회
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: '상품을 찾을 수 없습니다.',
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error('Failed to get store product:', error);
    res.status(500).json({
      success: false,
      error: '상품 조회 중 오류가 발생했습니다.',
    });
  }
});

export default router;
