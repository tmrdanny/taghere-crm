import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { bannerUpload, bannerMediaUpload } from './admin-uploads.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/banners - 배너 목록 조회
router.get('/banners', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const banners = await prisma.orderCompleteBanner.findMany({
      orderBy: [
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(banners);
  } catch (error) {
    console.error('Admin banners error:', error);
    res.status(500).json({ error: '배너 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/banners - 배너 생성
router.post('/banners', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { title, imageUrl, linkUrl, isActive, order, autoSlide, slideInterval, targetSlugs, mediaType } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ error: '제목과 미디어 URL을 입력해주세요.' });
    }

    const banner = await prisma.orderCompleteBanner.create({
      data: {
        title,
        imageUrl,
        linkUrl: linkUrl || null,
        isActive: isActive ?? true,
        order: order ?? 0,
        autoSlide: autoSlide ?? true,
        slideInterval: slideInterval ?? 3000,
        targetSlugs: targetSlugs || [],
        mediaType: mediaType || 'IMAGE',
      },
    });

    res.status(201).json(banner);
  } catch (error) {
    console.error('Admin create banner error:', error);
    res.status(500).json({ error: '배너 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/banners/:id - 배너 수정
router.put('/banners/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, imageUrl, linkUrl, isActive, order, autoSlide, slideInterval, targetSlugs, mediaType } = req.body;

    const existing = await prisma.orderCompleteBanner.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '배너를 찾을 수 없습니다.' });
    }

    const banner = await prisma.orderCompleteBanner.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        imageUrl: imageUrl ?? existing.imageUrl,
        linkUrl: linkUrl !== undefined ? (linkUrl || null) : existing.linkUrl,
        isActive: isActive ?? existing.isActive,
        order: order ?? existing.order,
        autoSlide: autoSlide ?? existing.autoSlide,
        slideInterval: slideInterval ?? existing.slideInterval,
        targetSlugs: targetSlugs ?? existing.targetSlugs,
        mediaType: mediaType ?? existing.mediaType,
      },
    });

    res.json(banner);
  } catch (error) {
    console.error('Admin update banner error:', error);
    res.status(500).json({ error: '배너 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/banners/:id - 배너 삭제
router.delete('/banners/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.orderCompleteBanner.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '배너를 찾을 수 없습니다.' });
    }

    await prisma.orderCompleteBanner.delete({
      where: { id },
    });

    res.json({ success: true, message: '배너가 삭제되었습니다.' });
  } catch (error) {
    console.error('Admin delete banner error:', error);
    res.status(500).json({ error: '배너 삭제 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/banners/active - 특정 slug에 대한 활성 배너 조회 (공개 API)
router.get('/banners/active', async (req: Request, res: Response) => {
  try {
    const { slug } = req.query;

    const banners = await prisma.orderCompleteBanner.findMany({
      where: {
        isActive: true,
        OR: [
          { targetSlugs: { isEmpty: true } }, // 전체 대상
          { targetSlugs: { has: slug as string } }, // 특정 slug 대상
        ],
      },
      orderBy: { order: 'asc' },
    });

    // 같은 order 값을 가진 배너들끼리 랜덤하게 섞기
    const shuffledBanners = shuffleSameOrder(banners);

    res.json(shuffledBanners);
  } catch (error) {
    console.error('Active banners error:', error);
    res.status(500).json({ error: '배너 조회 중 오류가 발생했습니다.' });
  }
});

// 같은 order 값을 가진 항목들을 랜덤하게 섞는 함수
function shuffleSameOrder<T extends { order: number }>(items: T[]): T[] {
  if (items.length <= 1) return items;

  // order 값으로 그룹화
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const group = groups.get(item.order) || [];
    group.push(item);
    groups.set(item.order, group);
  }

  // 각 그룹 내에서 랜덤하게 섞기 (Fisher-Yates)
  for (const group of groups.values()) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }

  // order 순서대로 결과 배열 생성
  const sortedOrders = Array.from(groups.keys()).sort((a, b) => a - b);
  const result: T[] = [];
  for (const order of sortedOrders) {
    result.push(...(groups.get(order) || []));
  }

  return result;
}

// POST /api/admin/banners/upload - 배너 이미지 업로드 (기존 API 유지)
router.post('/banners/upload', adminAuthMiddleware, bannerUpload.single('image'), async (req: AdminRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });
    }

    // 업로드된 파일의 URL 생성
    const imageUrl = `/uploads/banners/${req.file.filename}`;

    res.json({
      success: true,
      imageUrl,
      filename: req.file.filename,
    });
  } catch (error: any) {
    console.error('Banner upload error:', error);
    res.status(500).json({ error: error.message || '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/banners/upload-media - 배너 미디어(이미지/영상) 업로드
router.post('/banners/upload-media', adminAuthMiddleware, bannerMediaUpload.single('media'), async (req: AdminRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    // 업로드된 파일의 URL 생성
    const mediaUrl = `/uploads/banners/${req.file.filename}`;
    const isVideo = req.file.mimetype.startsWith('video/');

    res.json({
      success: true,
      mediaUrl,
      filename: req.file.filename,
      mediaType: isVideo ? 'VIDEO' : 'IMAGE',
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error: any) {
    console.error('Banner media upload error:', error);
    res.status(500).json({ error: error.message || '파일 업로드 중 오류가 발생했습니다.' });
  }
});

export default router;
