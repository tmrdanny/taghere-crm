import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';

const router = Router();

// 배너 이미지 업로드 디렉토리 설정
const bannerUploadDir = path.join(process.cwd(), 'uploads', 'banners');
if (!fs.existsSync(bannerUploadDir)) {
  fs.mkdirSync(bannerUploadDir, { recursive: true });
}

// Multer 설정 - 배너 이미지용
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bannerUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// 하드코딩된 어드민 계정 (환경변수로 관리 권장)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'taghere';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '!Tmrfounders6023';

interface AdminRequest extends Request {
  isAdmin?: boolean;
}

// 어드민 JWT 검증 미들웨어
const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { isSystemAdmin: boolean };

    if (!decoded.isSystemAdmin) {
      return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// POST /api/admin/login - 어드민 로그인
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 어드민 토큰 생성
    const token = jwt.sign(
      {
        isSystemAdmin: true,
        username: ADMIN_USERNAME,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: {
        username: ADMIN_USERNAME,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/me - 어드민 정보 확인
router.get('/me', adminAuthMiddleware, (req: AdminRequest, res: Response) => {
  res.json({
    username: ADMIN_USERNAME,
    isSystemAdmin: true,
  });
});

// GET /api/admin/stores - 모든 매장 목록 조회
router.get('/stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        ownerName: true,
        phone: true,
        businessRegNumber: true,
        createdAt: true,
        staffUsers: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
          where: {
            role: 'OWNER',
          },
          take: 1,
        },
        _count: {
          select: {
            customers: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 데이터 포맷팅
    const formattedStores = stores.map((store) => ({
      id: store.id,
      name: store.name,
      slug: store.slug,
      ownerName: store.ownerName,
      phone: store.phone,
      businessRegNumber: store.businessRegNumber,
      createdAt: store.createdAt,
      ownerEmail: store.staffUsers[0]?.email || null,
      ownerId: store.staffUsers[0]?.id || null,
      customerCount: store._count.customers,
    }));

    res.json(formattedStores);
  } catch (error) {
    console.error('Admin stores error:', error);
    res.status(500).json({ error: '매장 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/reset-password - 매장 점주 비밀번호 초기화
router.post('/stores/:storeId/reset-password', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const defaultPassword = '123456789a';

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        staffUsers: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const owner = store.staffUsers[0];

    if (!owner) {
      return res.status(404).json({ error: '매장 점주를 찾을 수 없습니다.' });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // 비밀번호 업데이트
    await prisma.staffUser.update({
      where: { id: owner.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: `${store.name} 매장의 비밀번호가 초기화되었습니다.`,
      ownerEmail: owner.email,
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: '비밀번호 초기화 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/stats - 대시보드 통계
router.get('/stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const [storeCount, customerCount, userCount] = await Promise.all([
      prisma.store.count(),
      prisma.customer.count(),
      prisma.staffUser.count(),
    ]);

    res.json({
      storeCount,
      customerCount,
      userCount,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/customer-trend - 고객 증감 추이
router.get('/customer-trend', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = days === 'all' ? 365 : parseInt(days as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // 기간 내 일별 고객 등록 수
    const customers = await prisma.customer.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 시작일 이전 총 고객 수
    const baseCount = await prisma.customer.count({
      where: {
        createdAt: {
          lt: startDate,
        },
      },
    });

    // 일별 데이터 집계
    const dailyData: { date: string; count: number; cumulative: number }[] = [];
    const dateMap = new Map<string, number>();

    customers.forEach((customer) => {
      const dateStr = customer.createdAt.toISOString().split('T')[0];
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    });

    // 기간 내 모든 날짜 생성
    let cumulative = baseCount;
    const currentDate = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = dateMap.get(dateStr) || 0;
      cumulative += count;

      dailyData.push({
        date: dateStr,
        count,
        cumulative,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      trend: dailyData,
      totalCustomers: cumulative,
      periodNew: customers.length,
    });
  } catch (error) {
    console.error('Admin customer trend error:', error);
    res.status(500).json({ error: '고객 추이 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/payment-stats - 실 결제 금액 통계 (admin 충전 제외)
router.get('/payment-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 먼저 모든 TOPUP 트랜잭션을 가져와서 admin 충전 제외
    const allTopups = await prisma.paymentTransaction.findMany({
      where: {
        type: 'TOPUP',
        status: 'SUCCESS',
      },
      select: {
        amount: true,
        createdAt: true,
        meta: true,
      },
    });

    console.log('All TOPUP transactions count:', allTopups.length);

    // TossPayments 결제만 필터링 (source === 'tosspayments'인 것만)
    const tossPayments = allTopups.filter((tx) => {
      const meta = tx.meta as Record<string, unknown> | null;
      return meta && meta.source === 'tosspayments';
    });

    // 토스페이먼츠에서 취소된 orderId 목록 (수동 관리)
    // TODO: 향후 취소 웹훅 구현 시 DB에서 관리하도록 변경
    const cancelledOrderIds = new Set([
      'TH1766880557965cgisd4td60b9l',
      'TH1766847377539026mphq9nt0r',
      'order_1766670545082_4rsfeyp4j',
    ]);

    // 취소된 orderId 제외
    const realPaymentTransactions = tossPayments.filter((tx) => {
      const meta = tx.meta as Record<string, unknown>;
      const orderId = meta.orderId as string;
      return orderId && !cancelledOrderIds.has(orderId);
    });

    console.log('TossPayments transactions:', tossPayments.length);
    console.log('After removing cancelled:', realPaymentTransactions.length);
    console.log('Cancelled count:', tossPayments.length - realPaymentTransactions.length);

    // 누적 실 결제 금액
    const totalRealPayments = realPaymentTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // 이번 달 실 결제 금액
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRealPayments = realPaymentTransactions
      .filter((tx) => tx.createdAt >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    // 총 결제 건수
    const totalTransactions = realPaymentTransactions.length;

    console.log('Stats:', { totalRealPayments, monthlyRealPayments, totalTransactions });

    // 디버그: 각 트랜잭션 상세 정보
    const debugTransactions = realPaymentTransactions.map(tx => ({
      amount: tx.amount,
      createdAt: tx.createdAt,
      meta: tx.meta,
    }));
    console.log('Debug transactions:', JSON.stringify(debugTransactions, null, 2));

    res.json({
      totalRealPayments,
      monthlyRealPayments,
      totalTransactions,
      // 임시 디버그 정보
      debug: debugTransactions,
    });
  } catch (error) {
    console.error('Admin payment stats error:', error);
    res.status(500).json({ error: '결제 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/stores/:storeId/wallet - 매장 충전금 조회
router.get('/stores/:storeId/wallet', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!wallet) {
      return res.json({ balance: 0, walletExists: false });
    }

    res.json({
      balance: wallet.balance,
      walletExists: true,
      updatedAt: wallet.updatedAt,
    });
  } catch (error) {
    console.error('Admin wallet error:', error);
    res.status(500).json({ error: '충전금 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/wallet/topup - 매장 충전금 충전
router.post('/stores/:storeId/wallet/topup', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 충전 금액을 입력해주세요.' });
    }

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 지갑이 없으면 생성, 있으면 업데이트
    const wallet = await prisma.wallet.upsert({
      where: { storeId },
      create: {
        storeId,
        balance: amount,
      },
      update: {
        balance: { increment: amount },
      },
    });

    // 결제 트랜잭션 기록
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount,
        type: 'TOPUP',
        status: 'SUCCESS',
        meta: {
          paymentMethod: 'ADMIN',
          description: reason || '관리자 충전',
        },
      },
    });

    res.json({
      success: true,
      message: `${store.name} 매장에 ${amount.toLocaleString()}원이 충전되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin wallet topup error:', error);
    res.status(500).json({ error: '충전 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/wallet/deduct - 매장 충전금 차감 (삭제)
router.post('/stores/:storeId/wallet/deduct', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 차감 금액을 입력해주세요.' });
    }

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 현재 지갑 잔액 확인
    const currentWallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!currentWallet) {
      return res.status(400).json({ error: '지갑이 존재하지 않습니다.' });
    }

    if (currentWallet.balance < amount) {
      return res.status(400).json({ error: '잔액이 부족합니다.' });
    }

    // 잔액 차감
    const wallet = await prisma.wallet.update({
      where: { storeId },
      data: {
        balance: { decrement: amount },
      },
    });

    // 결제 트랜잭션 기록 (차감)
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount: -amount,
        type: 'DEDUCT',
        status: 'SUCCESS',
        meta: {
          paymentMethod: 'ADMIN',
          description: reason || '관리자 차감',
        },
      },
    });

    res.json({
      success: true,
      message: `${store.name} 매장에서 ${amount.toLocaleString()}원이 차감되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin wallet deduct error:', error);
    res.status(500).json({ error: '차감 중 오류가 발생했습니다.' });
  }
});

// ========================================
// 공지사항 관리 API
// ========================================

// GET /api/admin/announcements - 공지사항 목록 조회
router.get('/announcements', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(announcements);
  } catch (error) {
    console.error('Admin announcements error:', error);
    res.status(500).json({ error: '공지사항 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/announcements - 공지사항 생성
router.post('/announcements', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { title, content, isActive, priority, startAt, endAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        isActive: isActive ?? true,
        priority: priority ?? 0,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Admin create announcement error:', error);
    res.status(500).json({ error: '공지사항 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/announcements/:id - 공지사항 수정
router.put('/announcements/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, isActive, priority, startAt, endAt } = req.body;

    const existing = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        content: content ?? existing.content,
        isActive: isActive ?? existing.isActive,
        priority: priority ?? existing.priority,
        startAt: startAt !== undefined ? (startAt ? new Date(startAt) : null) : existing.startAt,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : existing.endAt,
      },
    });

    res.json(announcement);
  } catch (error) {
    console.error('Admin update announcement error:', error);
    res.status(500).json({ error: '공지사항 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/announcements/:id - 공지사항 삭제
router.delete('/announcements/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    }

    await prisma.announcement.delete({
      where: { id },
    });

    res.json({ success: true, message: '공지사항이 삭제되었습니다.' });
  } catch (error) {
    console.error('Admin delete announcement error:', error);
    res.status(500).json({ error: '공지사항 삭제 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/stores/:storeId/customers - 매장의 모든 고객 삭제
router.delete('/stores/:storeId/customers', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const customerCount = store._count.customers;

    if (customerCount === 0) {
      return res.status(400).json({ error: '삭제할 고객이 없습니다.' });
    }

    // 트랜잭션으로 관련 데이터 모두 삭제
    await prisma.$transaction(async (tx) => {
      // 먼저 해당 매장의 모든 고객 ID를 조회
      const customers = await tx.customer.findMany({
        where: { storeId },
        select: { id: true },
      });
      const customerIds = customers.map(c => c.id);

      // 1. 고객의 포인트 원장 삭제
      await tx.pointLedger.deleteMany({
        where: {
          customerId: { in: customerIds },
        },
      });

      // 2. 고객 피드백 삭제
      await tx.customerFeedback.deleteMany({
        where: {
          customerId: { in: customerIds },
        },
      });

      // 3. 리뷰 요청 로그에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.reviewRequestLog.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 4. 알림톡 아웃박스에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.alimTalkOutbox.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 5. SMS 메시지에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.smsMessage.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 6. 최종적으로 고객 삭제
      await tx.customer.deleteMany({
        where: { storeId },
      });
    });

    res.json({
      success: true,
      message: `${store.name} 매장의 고객 ${customerCount}명이 삭제되었습니다.`,
      deletedCount: customerCount,
    });
  } catch (error) {
    console.error('Admin delete customers error:', error);
    res.status(500).json({ error: '고객 삭제 중 오류가 발생했습니다.' });
  }
});

// ========================================
// 주문완료 배너 관리 API
// ========================================

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
    const { title, imageUrl, linkUrl, isActive, order, autoSlide, slideInterval, targetSlugs } = req.body;

    if (!title || !imageUrl) {
      return res.status(400).json({ error: '제목과 이미지 URL을 입력해주세요.' });
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
    const { title, imageUrl, linkUrl, isActive, order, autoSlide, slideInterval, targetSlugs } = req.body;

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

// POST /api/admin/banners/upload - 배너 이미지 업로드
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

export default router;
