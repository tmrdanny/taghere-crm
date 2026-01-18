import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { enqueueAlimTalk } from '../services/solapi.js';

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

// Multer 설정 - 프랜차이즈 로고용 (메모리 저장)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// 어드민 계정 (환경변수 필수)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'taghere';
// 비밀번호는 bcrypt 해시로 저장 (ADMIN_PASSWORD_HASH 환경변수 사용)
// 해시 생성: npx bcrypt-cli hash "비밀번호"
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { isSystemAdmin: boolean };

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

    if (username !== ADMIN_USERNAME) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 비밀번호 해시 검증
    if (!ADMIN_PASSWORD_HASH) {
      console.error('[Admin] ADMIN_PASSWORD_HASH 환경변수가 설정되지 않았습니다.');
      return res.status(500).json({ error: '서버 설정 오류입니다.' });
    }

    const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!isValidPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 어드민 토큰 생성
    const token = jwt.sign(
      {
        isSystemAdmin: true,
        username: ADMIN_USERNAME,
      },
      process.env.JWT_SECRET!,
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
        category: true,
        slug: true,
        ownerName: true,
        phone: true,
        businessRegNumber: true,
        address: true,
        createdAt: true,
        // Point settings
        pointRatePercent: true,
        pointUsageRule: true,
        pointsAlimtalkEnabled: true,
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
        // Wallet 정보 함께 조회 (N+1 문제 해결)
        wallet: {
          select: {
            balance: true,
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
      category: store.category,
      slug: store.slug,
      ownerName: store.ownerName,
      phone: store.phone,
      businessRegNumber: store.businessRegNumber,
      address: store.address,
      createdAt: store.createdAt,
      ownerEmail: store.staffUsers[0]?.email || null,
      ownerId: store.staffUsers[0]?.id || null,
      customerCount: store._count.customers,
      // Point settings
      pointRatePercent: store.pointRatePercent,
      pointUsageRule: store.pointUsageRule,
      pointsAlimtalkEnabled: store.pointsAlimtalkEnabled,
      // Wallet balance 포함
      walletBalance: store.wallet?.balance || 0,
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

// PATCH /api/admin/stores/:storeId - 매장 정보 수정
router.patch('/stores/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const {
      name,
      category,
      slug,
      ownerName,
      phone,
      businessRegNumber,
      address,
      pointRatePercent,
      pointUsageRule,
      pointsAlimtalkEnabled,
    } = req.body;

    // 매장 확인
    const existingStore = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!existingStore) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug 중복 체크 (변경하려는 경우)
    if (slug && slug !== existingStore.slug) {
      const slugExists = await prisma.store.findFirst({
        where: {
          slug,
          id: { not: storeId },
        },
      });

      if (slugExists) {
        return res.status(400).json({ error: '이미 사용 중인 slug입니다.' });
      }
    }

    // 매장 정보 업데이트
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category || null }),
        ...(slug !== undefined && { slug: slug || null }),
        ...(ownerName !== undefined && { ownerName: ownerName || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(businessRegNumber !== undefined && { businessRegNumber: businessRegNumber || null }),
        ...(address !== undefined && { address: address || null }),
        ...(pointRatePercent !== undefined && { pointRatePercent }),
        ...(pointUsageRule !== undefined && { pointUsageRule: pointUsageRule || null }),
        ...(pointsAlimtalkEnabled !== undefined && { pointsAlimtalkEnabled }),
      },
    });

    res.json({
      success: true,
      message: '매장 정보가 수정되었습니다.',
      store: updatedStore,
    });
  } catch (error) {
    console.error('Admin update store error:', error);
    res.status(500).json({ error: '매장 정보 수정 중 오류가 발생했습니다.' });
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
    // 토스페이먼츠 결제(TOPUP)와 환불(REFUND) 모두 조회
    const allTransactions = await prisma.paymentTransaction.findMany({
      where: {
        type: { in: ['TOPUP', 'REFUND'] },
        status: 'SUCCESS',
      },
      select: {
        amount: true,
        type: true,
        createdAt: true,
        meta: true,
      },
    });

    // TossPayments 트랜잭션만 필터링 (source === 'tosspayments')
    // REFUND는 웹훅으로 생성된 것만 포함 (webhookTransmissionId가 있는 경우)
    const tossTransactions = allTransactions.filter((tx) => {
      const meta = tx.meta as Record<string, unknown> | null;
      if (!meta || meta.source !== 'tosspayments') return false;

      // TOPUP은 모두 포함
      if (tx.type === 'TOPUP') return true;

      // REFUND는 웹훅으로 생성된 것만 포함 (webhookTransmissionId가 있어야 함)
      if (tx.type === 'REFUND') {
        return !!meta.webhookTransmissionId;
      }

      return false;
    });

    // TOPUP과 REFUND 합산 (REFUND는 음수 금액으로 저장됨)
    const totalRealPayments = tossTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // 이번 달 결제 금액 계산
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRealPayments = tossTransactions
      .filter((tx) => tx.createdAt >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    // 총 결제 건수 (TOPUP만 카운트, REFUND 제외)
    const totalTransactions = tossTransactions.filter((tx) => tx.type === 'TOPUP').length;

    res.json({
      totalRealPayments,
      monthlyRealPayments,
      totalTransactions,
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

// POST /api/admin/stores/:storeId/impersonate - 매장 대리 로그인 (홈 화면 열기)
router.post('/stores/:storeId/impersonate', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    // 매장 및 Owner 조회
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

    // Store Owner JWT 토큰 생성 (1시간 만료)
    const token = jwt.sign(
      {
        id: owner.id,
        email: owner.email,
        storeId: store.id,
        role: owner.role,
        isAdmin: false,
        isImpersonated: true,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      storeName: store.name,
    });
  } catch (error) {
    console.error('Admin impersonate error:', error);
    res.status(500).json({ error: '대리 로그인 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/alimtalk/low-balance-bulk - 발송잔액 부족 알림 일괄 발송
router.post('/alimtalk/low-balance-bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { excludeStoreIds = [] } = req.body;
    const templateId = 'KA01TP26010513462218279L5IthM7TY';

    // 1. 300원 미만 매장 조회 (전화번호가 있는 매장만)
    const stores = await prisma.store.findMany({
      where: {
        phone: { not: null },
        wallet: {
          balance: { lt: 300 }
        },
        id: {
          notIn: excludeStoreIds
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        wallet: {
          select: { balance: true }
        }
      }
    });

    // 2. 날짜 기반 멱등성 키용 날짜 (KST)
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 3. 각 매장에 알림톡 발송 요청
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const store of stores) {
      const balance = store.wallet?.balance ?? 0;
      // 타임스탬프 기반 멱등성 키 - 매번 발송 가능하도록 변경
      const idempotencyKey = `admin_low_balance_bulk:${store.id}:${Date.now()}`;

      // #{상호명} 변수에 매장명 + 안내 문구 (줄바꿈 포함)
      const storeNameVariable = `${store.name}

현재 충전금이 부족하여 손님께 네이버 리뷰 요청과 포인트 적립 완료 알림톡이 전달되지 않고 있어요.

알림톡을 끄시려면 '설정 > 알림톡 발송 OFF'를 클릭해주세요.`;

      try {
        const result = await enqueueAlimTalk({
          storeId: store.id,
          phone: store.phone!,
          messageType: 'LOW_BALANCE',
          templateId,
          variables: {
            '#{상호명}': storeNameVariable,
            '#{잔액}': balance.toLocaleString(),
          },
          idempotencyKey,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${store.name}: ${result.error}`);
          }
        }
      } catch (err: any) {
        failed++;
        errors.push(`${store.name}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      totalStores: stores.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Low balance bulk notification error:', error);
    res.status(500).json({ error: error.message || '알림 발송 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 프랜차이즈 관리 API
// ============================================

// GET /api/admin/franchises - 전체 프랜차이즈 목록 조회
router.get('/franchises', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const franchises = await prisma.franchise.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            stores: true,
            users: true,
          },
        },
        wallet: {
          select: {
            balance: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ franchises });
  } catch (error: any) {
    console.error('Failed to fetch franchises:', error);
    res.status(500).json({ error: '프랜차이즈 목록 조회에 실패했습니다.' });
  }
});

// GET /api/admin/franchises/:franchiseId - 특정 프랜차이즈 상세 조회
router.get('/franchises/:franchiseId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;

    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        createdAt: true,
        updatedAt: true,
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        stores: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            ownerName: true,
            phone: true,
            address: true,
            createdAt: true,
            _count: {
              select: {
                customers: true,
              },
            },
            wallet: {
              select: {
                balance: true,
              },
            },
          },
        },
        wallet: {
          select: {
            balance: true,
          },
        },
      },
    });

    if (!franchise) {
      return res.status(404).json({ error: '프랜차이즈를 찾을 수 없습니다.' });
    }

    res.json({ franchise });
  } catch (error: any) {
    console.error('Failed to fetch franchise:', error);
    res.status(500).json({ error: '프랜차이즈 조회에 실패했습니다.' });
  }
});

// POST /api/admin/franchises - 프랜차이즈 회원가입
router.post('/franchises', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { name, slug, email, password, userName, phone, logoUrl } = req.body;

    // 필수 필드 검증
    if (!name || !slug || !email || !password || !userName) {
      return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
    }

    // slug 중복 검사
    const existingFranchiseBySlug = await prisma.franchise.findUnique({
      where: { slug },
    });

    if (existingFranchiseBySlug) {
      return res.status(400).json({ error: '이미 사용 중인 slug입니다.' });
    }

    // 이메일 중복 검사
    const existingUser = await prisma.franchiseUser.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    // 프랜차이즈 및 사용자 생성 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      // 1. 프랜차이즈 생성
      const franchise = await tx.franchise.create({
        data: {
          name,
          slug,
          logoUrl: logoUrl || null,
        },
      });

      // 2. 프랜차이즈 지갑 생성
      await tx.franchiseWallet.create({
        data: {
          franchiseId: franchise.id,
          balance: 0,
        },
      });

      // 3. 프랜차이즈 관리자 사용자 생성
      const franchiseUser = await tx.franchiseUser.create({
        data: {
          email,
          passwordHash,
          name: userName,
          phone: phone || null,
          role: 'OWNER',
          franchiseId: franchise.id,
        },
      });

      return { franchise, franchiseUser };
    });

    res.status(201).json({
      success: true,
      franchise: result.franchise,
      user: {
        id: result.franchiseUser.id,
        email: result.franchiseUser.email,
        name: result.franchiseUser.name,
        phone: result.franchiseUser.phone,
        role: result.franchiseUser.role,
      },
    });
  } catch (error: any) {
    console.error('Failed to create franchise:', error);
    res.status(500).json({ error: '프랜차이즈 생성에 실패했습니다.' });
  }
});

// POST /api/admin/franchises/:franchiseId/stores - 기존 매장을 프랜차이즈에 연결
router.post('/franchises/:franchiseId/stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;
    const { storeId } = req.body;

    if (!storeId) {
      return res.status(400).json({ error: '매장 ID를 입력해주세요.' });
    }

    // 프랜차이즈 존재 확인
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
    });

    if (!franchise) {
      return res.status(404).json({ error: '프랜차이즈를 찾을 수 없습니다.' });
    }

    // 매장 존재 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 이미 다른 프랜차이즈에 연결되어 있는지 확인
    if (store.franchiseId && store.franchiseId !== franchiseId) {
      return res.status(400).json({ error: '이미 다른 프랜차이즈에 연결된 매장입니다.' });
    }

    // 매장을 프랜차이즈에 연결
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        franchiseId,
      },
      include: {
        _count: {
          select: {
            customers: true,
          },
        },
        wallet: {
          select: {
            balance: true,
          },
        },
      },
    });

    res.json({
      success: true,
      store: updatedStore,
    });
  } catch (error: any) {
    console.error('Failed to connect store to franchise:', error);
    res.status(500).json({ error: '매장 연결에 실패했습니다.' });
  }
});

// DELETE /api/admin/franchises/:franchiseId/stores/:storeId - 프랜차이즈에서 매장 연결 해제
router.delete('/franchises/:franchiseId/stores/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId, storeId } = req.params;

    // 매장 존재 및 연결 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    if (store.franchiseId !== franchiseId) {
      return res.status(400).json({ error: '해당 프랜차이즈에 연결되지 않은 매장입니다.' });
    }

    // 매장 연결 해제
    await prisma.store.update({
      where: { id: storeId },
      data: {
        franchiseId: null,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to disconnect store from franchise:', error);
    res.status(500).json({ error: '매장 연결 해제에 실패했습니다.' });
  }
});

// POST /api/admin/franchises/:franchiseId/logo - 프랜차이즈 로고 업로드
router.post('/franchises/:franchiseId/logo', adminAuthMiddleware, logoUpload.single('logo'), async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;

    console.log('Logo upload request:', {
      franchiseId,
      hasFile: !!req.file,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype,
    });

    if (!req.file) {
      return res.status(400).json({ error: '로고 파일을 업로드해주세요.' });
    }

    // 프랜차이즈 존재 확인
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
    });

    if (!franchise) {
      return res.status(404).json({ error: '프랜차이즈를 찾을 수 없습니다.' });
    }

    console.log('Updating franchise logo in database...');

    // 로고를 DB에 저장
    await prisma.franchise.update({
      where: { id: franchiseId },
      data: {
        logo: req.file.buffer,
        logoMimeType: req.file.mimetype,
      },
    });

    console.log('Logo uploaded successfully');

    res.json({ success: true, message: '로고가 업로드되었습니다.' });
  } catch (error: any) {
    console.error('Failed to upload franchise logo:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({ error: '로고 업로드에 실패했습니다.', details: error.message });
  }
});

// PATCH /api/admin/franchises/:franchiseId - 프랜차이즈 정보 수정
router.patch('/franchises/:franchiseId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;
    const { name, logoUrl } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

    const franchise = await prisma.franchise.update({
      where: { id: franchiseId },
      data: updateData,
    });

    res.json({ success: true, franchise });
  } catch (error: any) {
    console.error('Failed to update franchise:', error);
    res.status(500).json({ error: '프랜차이즈 정보 수정에 실패했습니다.' });
  }
});

// GET /api/admin/stores/available - 프랜차이즈 미연결 매장 목록 조회
router.get('/stores/available', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: {
        franchiseId: null, // 프랜차이즈에 연결되지 않은 매장만
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        ownerName: true,
        phone: true,
        address: true,
        createdAt: true,
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

    res.json({ stores });
  } catch (error: any) {
    console.error('Failed to fetch available stores:', error);
    res.status(500).json({ error: '매장 목록 조회에 실패했습니다.' });
  }
});

export default router;
