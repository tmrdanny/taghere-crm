import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { productUpload } from './admin-uploads.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/store-products - 전체 상품 목록
router.get('/store-products', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const products = await prisma.storeProduct.findMany({
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
    console.error('Admin get store products error:', error);
    res.status(500).json({ error: '상품 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/store-products/upload - 상품 이미지 업로드
router.post('/store-products/upload', adminAuthMiddleware, productUpload.single('image'), async (req: AdminRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });
    }

    // 업로드된 파일의 URL 생성
    const imageUrl = `/uploads/products/${req.file.filename}`;

    res.json({
      success: true,
      imageUrl,
      filename: req.file.filename,
    });
  } catch (error: any) {
    console.error('Product image upload error:', error);
    res.status(500).json({ error: error.message || '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/store-products - 상품 등록
router.post('/store-products', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { name, description, price, imageUrl, isActive, sortOrder } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: '상품명과 가격은 필수입니다.' });
    }

    const product = await prisma.storeProduct.create({
      data: {
        name,
        description: description || null,
        price: Number(price),
        imageUrl: imageUrl || null,
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
      },
    });

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error('Admin create store product error:', error);
    res.status(500).json({ error: '상품 등록 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/store-products/:id - 상품 수정
router.put('/store-products/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, imageUrl, isActive, sortOrder } = req.body;

    const existing = await prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    const product = await prisma.storeProduct.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        description: description !== undefined ? description : existing.description,
        price: price !== undefined ? Number(price) : existing.price,
        imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
      },
    });

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error('Admin update store product error:', error);
    res.status(500).json({ error: '상품 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/store-products/:id - 상품 삭제
router.delete('/store-products/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    // 주문 내역이 있는 상품은 비활성화만 가능
    const orderCount = await prisma.storeOrderItem.count({
      where: { productId: id },
    });

    if (orderCount > 0) {
      // 주문 내역이 있으면 비활성화만 처리
      await prisma.storeProduct.update({
        where: { id },
        data: { isActive: false },
      });

      return res.json({
        success: true,
        message: '주문 내역이 있어 비활성화 처리되었습니다.',
        deactivated: true,
      });
    }

    await prisma.storeProduct.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: '상품이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Admin delete store product error:', error);
    res.status(500).json({ error: '상품 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
