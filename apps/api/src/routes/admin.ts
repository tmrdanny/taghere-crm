import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { enqueueAlimTalk } from '../services/solapi.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import { notifyCrmOn, notifyCrmOff } from '../services/taghere-api.js';
import { parseKoreanAddress, sidoToShort } from '../utils/address-parser.js';

const router = Router();

// 배너 이미지 업로드 디렉토리 설정
const bannerUploadDir = path.join(process.cwd(), 'uploads', 'banners');
if (!fs.existsSync(bannerUploadDir)) {
  fs.mkdirSync(bannerUploadDir, { recursive: true });
}

// 스토어 상품 이미지 업로드 디렉토리 설정
const productUploadDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
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

// Multer 설정 - 스토어 상품 이미지용
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

const productUpload = multer({
  storage: productStorage,
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

// Multer 설정 - 배너 미디어(이미지/영상)용
const bannerMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bannerUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.mimetype.startsWith('video/') ? 'banner-video' : 'banner';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  },
});

const bannerMediaUpload = multer({
  storage: bannerMediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB (영상용)
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP, MP4, WebM 파일만 업로드 가능합니다.'));
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
    // 현재 연월 계산
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
        crmEnabled: true,
        enrollmentMode: true,
        taghereVersion: true,
        metacityEnabled: true,
        metacityBrandCode: true,
        metacityStoreIdx: true,
        metacityAccessCode: true,
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

    // 모든 매장의 이번 달 크레딧 한 번에 조회 (N+1 방지)
    const monthlyCredits = await prisma.monthlyCredit.findMany({
      where: {
        storeId: { in: stores.map((s) => s.id) },
        yearMonth: currentYearMonth,
      },
      select: {
        storeId: true,
        totalCredits: true,
        usedCredits: true,
      },
    });

    // storeId -> credit 맵 생성
    const creditMap = new Map(monthlyCredits.map((c) => [c.storeId, c]));

    // 데이터 포맷팅
    const formattedStores = stores.map((store) => {
      const credit = creditMap.get(store.id);
      const totalCredits = credit?.totalCredits ?? 30;
      const usedCredits = credit?.usedCredits ?? 0;
      const remainingCredits = Math.max(0, totalCredits - usedCredits);

      return {
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
        crmEnabled: (store as any).crmEnabled ?? true,
        enrollmentMode: (store as any).enrollmentMode ?? 'POINTS',
        taghereVersion: (store as any).taghereVersion ?? 'v1',
        // Wallet balance 포함
        walletBalance: store.wallet?.balance || 0,
        // 월별 무료 크레딧 정보
        monthlyCredit: {
          total: totalCredits,
          used: usedCredits,
          remaining: remainingCredits,
        },
      };
    });

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
      crmEnabled,
      enrollmentMode,
      taghereVersion,
      metacityEnabled,
      metacityBrandCode,
      metacityStoreIdx,
      metacityAccessCode,
    } = req.body;

    // 매장 확인 (스탬프 설정과 OWNER 이메일도 함께 조회)
    const existingStore = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        stampSetting: true,
        staffUsers: {
          where: { role: 'OWNER' },
          select: { email: true },
          take: 1,
        },
      },
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

    // 주소 변경 시 자동 파싱하여 addressSido/Sigungu/Detail도 함께 업데이트
    const addressUpdateFields: Record<string, any> = {};
    if (address !== undefined) {
      const addrStr = (address || '').trim();
      addressUpdateFields.address = addrStr || null;
      if (addrStr) {
        const parsed = parseKoreanAddress(addrStr);
        addressUpdateFields.addressSido = parsed.sido;
        addressUpdateFields.addressSigungu = parsed.sigungu;
        addressUpdateFields.addressDetail = parsed.detail;
      } else {
        addressUpdateFields.addressSido = null;
        addressUpdateFields.addressSigungu = null;
        addressUpdateFields.addressDetail = null;
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
        ...addressUpdateFields,
        ...(pointRatePercent !== undefined && { pointRatePercent }),
        ...(pointUsageRule !== undefined && { pointUsageRule: pointUsageRule || null }),
        ...(pointsAlimtalkEnabled !== undefined && { pointsAlimtalkEnabled }),
        ...(crmEnabled !== undefined && { crmEnabled }),
        ...(enrollmentMode !== undefined && ['POINTS', 'STAMP', 'MEMBERSHIP'].includes(enrollmentMode) && { enrollmentMode }),
        ...(taghereVersion !== undefined && ['v1', 'v2'].includes(taghereVersion) && { taghereVersion }),
        ...(metacityEnabled !== undefined && { metacityEnabled }),
        ...(metacityBrandCode !== undefined && { metacityBrandCode: metacityBrandCode || null }),
        ...(metacityStoreIdx !== undefined && { metacityStoreIdx: metacityStoreIdx || null }),
        ...(metacityAccessCode !== undefined && { metacityAccessCode: metacityAccessCode || null }),
      } as any,
    });

    // CRM 활성화 상태 변경, taghereVersion 변경, 또는 enrollmentMode 변경 시 태그히어 서버에 알림
    const wasCrmEnabled = (existingStore as any).crmEnabled ?? true;
    const wasVersion = existingStore.taghereVersion;
    const wasEnrollmentMode = existingStore.enrollmentMode;
    const versionChanged = taghereVersion !== undefined && taghereVersion !== wasVersion;
    const crmToggled = crmEnabled !== undefined && crmEnabled !== wasCrmEnabled;
    const enrollmentModeChanged = enrollmentMode !== undefined && enrollmentMode !== wasEnrollmentMode;

    if (crmToggled || versionChanged || enrollmentModeChanged) {
      const ownerEmail = existingStore.staffUsers?.[0]?.email;
      const storeSlug = slug || existingStore.slug;

      if (storeSlug) {
        const isStampMode = existingStore.stampSetting?.enabled ?? false;
        const effectiveVersion = taghereVersion || existingStore.taghereVersion;
        const effectiveCrmEnabled = crmEnabled ?? wasCrmEnabled;
        const effectiveEnrollmentMode = enrollmentMode || existingStore.enrollmentMode;
        const baseParams = {
          userId: ownerEmail,
          storeName: existingStore.name,
          slug: storeSlug,
          isStampMode,
          enrollmentMode: effectiveEnrollmentMode,
        };

        if (versionChanged && effectiveCrmEnabled) {
          // 버전 변경 시: 구 버전 OFF → 신 버전 ON (redirect URL 파라미터명 변경)
          await notifyCrmOff({ ...baseParams, version: wasVersion });
          console.log(`[Admin] CRM off (old version ${wasVersion}) for store ${storeId}`);
          await notifyCrmOn({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM on (new version ${effectiveVersion}) for store ${storeId}, isStampMode: ${isStampMode}`);
        } else if (effectiveCrmEnabled) {
          await notifyCrmOn({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM on for store ${storeId}, version: ${effectiveVersion}, isStampMode: ${isStampMode}`);
        } else {
          await notifyCrmOff({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM off for store ${storeId}, version: ${effectiveVersion}, isStampMode: ${isStampMode}`);
        }
      } else {
        console.log(`[Admin] Store ${storeId} missing slug, skipped TagHere notification`);
      }
    }

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

// GET /api/admin/payment-stats - 토스페이먼츠 실 결제 금액 통계
router.get('/payment-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 1. 토스페이먼츠 Store 결제(TOPUP) 조회
    const tossStoreTopups = await prisma.paymentTransaction.findMany({
      where: {
        type: 'TOPUP',
        status: 'SUCCESS',
        meta: {
          path: ['source'],
          equals: 'tosspayments',
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // 2. 토스페이먼츠 Store 환불(REFUND) 조회
    const tossStoreRefunds = await prisma.paymentTransaction.findMany({
      where: {
        type: 'REFUND',
        status: 'SUCCESS',
        meta: {
          path: ['source'],
          equals: 'tosspayments',
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // 3. 토스페이먼츠 프랜차이즈 충전 조회
    const tossFranchiseTopups = await prisma.franchiseTransaction.findMany({
      where: {
        type: 'TOPUP',
        meta: {
          path: ['source'],
          equals: 'tosspayments',
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // 4. Store 매출 합산 (TOPUP - REFUND)
    const storeTopupTotal = tossStoreTopups.reduce((sum, tx) => sum + tx.amount, 0);
    const storeRefundTotal = tossStoreRefunds.reduce((sum, tx) => sum + tx.amount, 0);
    const storeTotal = storeTopupTotal - storeRefundTotal;

    // 5. 프랜차이즈 충전 합산
    const franchiseTotal = tossFranchiseTopups.reduce((sum, tx) => sum + tx.amount, 0);

    // 6. 전체 누적 매출 (토스페이먼츠 실 결제만)
    const totalRealPayments = storeTotal + franchiseTotal;

    // 7. 이번 달 매출 계산
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyStoreTopups = tossStoreTopups
      .filter((tx) => tx.createdAt >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyStoreRefunds = tossStoreRefunds
      .filter((tx) => tx.createdAt >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyStorePayments = monthlyStoreTopups - monthlyStoreRefunds;

    const monthlyFranchisePayments = tossFranchiseTopups
      .filter((tx) => tx.createdAt >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyRealPayments = monthlyStorePayments + monthlyFranchisePayments;

    // 8. 총 결제 건수 (토스페이먼츠만)
    const totalTransactions = tossStoreTopups.length + tossFranchiseTopups.length;

    // 9. 외부 매출 (계좌이체 등) 합산
    const externalRevenues = await prisma.externalRevenue.findMany({
      select: {
        amount: true,
        revenueDate: true,
      },
    });

    const totalExternalRevenue = externalRevenues.reduce((sum, r) => sum + r.amount, 0);
    const monthlyExternalRevenue = externalRevenues
      .filter((r) => r.revenueDate >= startOfMonth)
      .reduce((sum, r) => sum + r.amount, 0);

    res.json({
      totalRealPayments: totalRealPayments + totalExternalRevenue,
      monthlyRealPayments: monthlyRealPayments + monthlyExternalRevenue,
      totalTransactions,
      // 분리된 값도 제공
      tossPayments: totalRealPayments,
      externalRevenue: totalExternalRevenue,
    });
  } catch (error) {
    console.error('Admin payment stats error:', error);
    res.status(500).json({ error: '결제 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/external-revenue - 외부 매출 목록 조회
router.get('/external-revenue', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const revenues = await prisma.externalRevenue.findMany({
      orderBy: { revenueDate: 'desc' },
      take: 50,
    });

    res.json({ revenues });
  } catch (error) {
    console.error('Admin external revenue list error:', error);
    res.status(500).json({ error: '외부 매출 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/external-revenue - 외부 매출 추가
router.post('/external-revenue', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { amount, description, revenueDate } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '금액을 입력해주세요.' });
    }

    const revenue = await prisma.externalRevenue.create({
      data: {
        amount: Number(amount),
        description: description || '계좌이체',
        revenueDate: revenueDate ? new Date(revenueDate) : new Date(),
      },
    });

    res.json({ success: true, revenue });
  } catch (error) {
    console.error('Admin external revenue create error:', error);
    res.status(500).json({ error: '외부 매출 추가 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/external-revenue/:id - 외부 매출 삭제
router.delete('/external-revenue/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.externalRevenue.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin external revenue delete error:', error);
    res.status(500).json({ error: '외부 매출 삭제 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/point-stats - 누적 적립 포인트 통계
router.get('/point-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 추적 시작일: 2026년 1월 1일
    const trackingStartDate = new Date('2026-01-01T00:00:00+09:00');

    // 누적 적립 포인트 (2026.01.01부터, EARN 타입만)
    const result = await prisma.pointLedger.aggregate({
      where: {
        type: 'EARN',
        createdAt: {
          gte: trackingStartDate,
        },
      },
      _sum: {
        delta: true,
      },
    });

    // 이번 달 적립 포인트
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyResult = await prisma.pointLedger.aggregate({
      where: {
        type: 'EARN',
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        delta: true,
      },
    });

    res.json({
      totalEarnedPoints: result._sum.delta || 0,
      monthlyEarnedPoints: monthlyResult._sum.delta || 0,
    });
  } catch (error) {
    console.error('Admin point stats error:', error);
    res.status(500).json({ error: '포인트 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/visit-source-stats - 전체 고객 방문경로 통계
router.get('/visit-source-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 모든 고객의 visitSource 조회
    const customers = await prisma.customer.findMany({
      select: {
        visitSource: true,
        storeId: true,
      },
    });

    // visitSource별 카운트 집계
    const visitSourceMap = new Map<string, number>();
    let noSourceCount = 0;

    customers.forEach((c) => {
      if (c.visitSource) {
        visitSourceMap.set(c.visitSource, (visitSourceMap.get(c.visitSource) || 0) + 1);
      } else {
        noSourceCount++;
      }
    });

    // 모든 매장의 VisitSourceSetting에서 라벨 조회
    const visitSourceSettings = await prisma.visitSourceSetting.findMany({
      select: { options: true },
    });

    // 모든 옵션을 합쳐서 라벨 맵 생성
    const labelMap = new Map<string, string>();
    visitSourceSettings.forEach((setting) => {
      const optionsArray = (setting.options as Array<{ id: string; label: string }>) || [];
      optionsArray.forEach((opt) => {
        if (!labelMap.has(opt.id)) {
          labelMap.set(opt.id, opt.label);
        }
      });
    });

    // 결과 배열 생성
    const totalWithSource = customers.length - noSourceCount;
    const distribution = Array.from(visitSourceMap.entries())
      .map(([source, count]) => ({
        source,
        label: labelMap.get(source) || source,
        count,
        percentage: totalWithSource > 0 ? Math.round((count / totalWithSource) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalCustomers: customers.length,
      totalWithSource,
      noSourceCount,
      distribution,
    });
  } catch (error) {
    console.error('Admin visit source stats error:', error);
    res.status(500).json({ error: '방문경로 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/demographic-stats - 전체 고객 성별/연령대 통계
router.get('/demographic-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const customers = await prisma.customer.findMany({
      select: {
        gender: true,
        ageGroup: true,
      },
    });

    const total = customers.length;

    // 성별 집계
    const genderMap: Record<string, number> = { MALE: 0, FEMALE: 0, UNKNOWN: 0 };
    customers.forEach((c) => {
      if (c.gender === 'MALE' || c.gender === 'FEMALE') {
        genderMap[c.gender]++;
      } else {
        genderMap['UNKNOWN']++;
      }
    });

    const genderDistribution = [
      { key: 'MALE', label: '남성', count: genderMap['MALE'], percentage: total > 0 ? Math.round((genderMap['MALE'] / total) * 1000) / 10 : 0 },
      { key: 'FEMALE', label: '여성', count: genderMap['FEMALE'], percentage: total > 0 ? Math.round((genderMap['FEMALE'] / total) * 1000) / 10 : 0 },
      { key: 'UNKNOWN', label: '미입력', count: genderMap['UNKNOWN'], percentage: total > 0 ? Math.round((genderMap['UNKNOWN'] / total) * 1000) / 10 : 0 },
    ];

    // 연령대 집계
    const ageGroupMap: Record<string, number> = {
      TWENTIES: 0, THIRTIES: 0, FORTIES: 0, FIFTIES: 0, SIXTY_PLUS: 0, UNKNOWN: 0,
    };
    customers.forEach((c) => {
      if (c.ageGroup && ageGroupMap[c.ageGroup] !== undefined) {
        ageGroupMap[c.ageGroup]++;
      } else {
        ageGroupMap['UNKNOWN']++;
      }
    });

    const ageGroupDistribution = [
      { key: 'TWENTIES', label: '20대', count: ageGroupMap['TWENTIES'], percentage: total > 0 ? Math.round((ageGroupMap['TWENTIES'] / total) * 1000) / 10 : 0 },
      { key: 'THIRTIES', label: '30대', count: ageGroupMap['THIRTIES'], percentage: total > 0 ? Math.round((ageGroupMap['THIRTIES'] / total) * 1000) / 10 : 0 },
      { key: 'FORTIES', label: '40대', count: ageGroupMap['FORTIES'], percentage: total > 0 ? Math.round((ageGroupMap['FORTIES'] / total) * 1000) / 10 : 0 },
      { key: 'FIFTIES', label: '50대', count: ageGroupMap['FIFTIES'], percentage: total > 0 ? Math.round((ageGroupMap['FIFTIES'] / total) * 1000) / 10 : 0 },
      { key: 'SIXTY_PLUS', label: '60대 이상', count: ageGroupMap['SIXTY_PLUS'], percentage: total > 0 ? Math.round((ageGroupMap['SIXTY_PLUS'] / total) * 1000) / 10 : 0 },
      { key: 'UNKNOWN', label: '미입력', count: ageGroupMap['UNKNOWN'], percentage: total > 0 ? Math.round((ageGroupMap['UNKNOWN'] / total) * 1000) / 10 : 0 },
    ];

    res.json({
      totalCustomers: total,
      genderDistribution,
      ageGroupDistribution,
    });
  } catch (error) {
    console.error('Admin demographic stats error:', error);
    res.status(500).json({ error: '성별/연령대 통계 조회 중 오류가 발생했습니다.' });
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

현재 충전금이 부족하여 손님께 네이버 리뷰 안내와 포인트 적립 완료 알림톡이 전달되지 않고 있어요.

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

// POST /api/admin/alimtalk/customer-count-bulk - 누적 고객 알림 일괄 발송
router.post('/alimtalk/customer-count-bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { minCustomers = 0, maxCustomers, excludeStoreIds = [] } = req.body;
    const templateId = 'KA01TP260318032138795sPQKm0yXShn';

    // 매장 조회 (전화번호가 있는 매장만, 고객수 포함)
    const stores = await prisma.store.findMany({
      where: {
        phone: { not: null },
        id: { notIn: excludeStoreIds },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        _count: { select: { customers: true } },
      },
    });

    // 고객수 필터링
    const filtered = stores.filter((s) => {
      const count = s._count.customers;
      if (count < minCustomers) return false;
      if (maxCustomers !== undefined && maxCustomers !== null && count > maxCustomers) return false;
      return true;
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const store of filtered) {
      const customerCount = store._count.customers;
      const idempotencyKey = `admin_customer_count_bulk:${store.id}:${Date.now()}`;

      try {
        const result = await enqueueAlimTalk({
          storeId: store.id,
          phone: store.phone!,
          messageType: 'CUSTOMER_COUNT',
          templateId,
          variables: {
            '#{고객수}': customerCount.toLocaleString(),
          },
          idempotencyKey,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          if (result.error) errors.push(`${store.name}: ${result.error}`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${store.name}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      totalStores: filtered.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Customer count bulk notification error:', error);
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
    const { name, logoUrl, ownerName, ownerEmail, ownerPhone, ownerPassword } = req.body;

    // 1. 프랜차이즈 기본 정보 업데이트
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

    if (Object.keys(updateData).length > 0) {
      await prisma.franchise.update({
        where: { id: franchiseId },
        data: updateData,
      });
    }

    // 2. OWNER 유저 정보 업데이트
    const hasOwnerUpdate = ownerName !== undefined || ownerEmail !== undefined || ownerPhone !== undefined || ownerPassword;
    if (hasOwnerUpdate) {
      const owner = await prisma.franchiseUser.findFirst({
        where: { franchiseId, role: 'OWNER' },
      });

      if (!owner) {
        return res.status(404).json({ error: '프랜차이즈 OWNER를 찾을 수 없습니다.' });
      }

      const ownerUpdateData: any = {};
      if (ownerName !== undefined) ownerUpdateData.name = ownerName;
      if (ownerPhone !== undefined) ownerUpdateData.phone = ownerPhone;

      if (ownerEmail !== undefined && ownerEmail !== owner.email) {
        const existing = await prisma.franchiseUser.findUnique({ where: { email: ownerEmail } });
        if (existing) {
          return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
        }
        ownerUpdateData.email = ownerEmail;
      }

      if (ownerPassword) {
        ownerUpdateData.passwordHash = await bcrypt.hash(ownerPassword, 10);
      }

      if (Object.keys(ownerUpdateData).length > 0) {
        await prisma.franchiseUser.update({
          where: { id: owner.id },
          data: ownerUpdateData,
        });
      }
    }

    // 3. 업데이트된 프랜차이즈 정보 응답
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      include: {
        users: {
          select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
        },
        _count: { select: { stores: true, users: true } },
        wallet: { select: { balance: true } },
      },
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

// GET /api/admin/external-customer-stats - 신규고객(ExternalCustomer) 수집 통계
router.get('/external-customer-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { period = 'daily' } = req.query;

    const now = new Date();
    // 시작일: 2026년 1월 18일 고정
    const fixedStartDate = new Date('2026-01-18T00:00:00');
    let startDate: Date;

    switch (period) {
      case 'weekly':
        // 1월 18일 이후 주별
        startDate = fixedStartDate;
        break;
      case 'monthly':
        // 1월 18일 이후 월별
        startDate = fixedStartDate;
        break;
      case 'daily':
      default:
        // 1월 18일 이후 일별
        startDate = fixedStartDate;
        break;
    }

    // 전체 ExternalCustomer 수
    const total = await prisma.externalCustomer.count({
      where: { consentMarketing: true },
    });

    // 기간 내 ExternalCustomer 조회
    const customers = await prisma.externalCustomer.findMany({
      where: {
        createdAt: { gte: startDate },
        consentMarketing: true,
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 날짜별/주별/월별 그룹핑
    const groupedData: Record<string, number> = {};

    customers.forEach((customer) => {
      const date = new Date(customer.createdAt);
      let key: string;

      if (period === 'weekly') {
        // 주 시작일 (월요일) 기준
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        key = weekStart.toISOString().split('T')[0];
      } else if (period === 'monthly') {
        // 월별 (YYYY-MM)
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // 일별 (YYYY-MM-DD)
        key = date.toISOString().split('T')[0];
      }

      groupedData[key] = (groupedData[key] || 0) + 1;
    });

    // 데이터 배열로 변환 및 정렬
    const data = Object.entries(groupedData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 기간 내 총 수집 수
    const periodTotal = customers.length;

    // 일평균 계산
    const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const averagePerDay = daysDiff > 0 ? Math.round((periodTotal / daysDiff) * 10) / 10 : 0;

    res.json({
      period,
      data,
      summary: {
        total,
        periodTotal,
        averagePerDay,
      },
    });
  } catch (error) {
    console.error('Admin external customer stats error:', error);
    res.status(500).json({ error: '신규고객 통계 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 프랜차이즈 충전금 관리
// ============================================

// POST /api/admin/franchises/:franchiseId/wallet/topup - 프랜차이즈 충전금 충전
router.post('/franchises/:franchiseId/wallet/topup', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;
    const { amount, reason, adminPassword } = req.body;

    // 비밀번호 검증
    if (!adminPassword) {
      return res.status(400).json({ error: '관리자 비밀번호를 입력해주세요.' });
    }

    if (!ADMIN_PASSWORD_HASH) {
      return res.status(500).json({ error: '서버 설정 오류입니다.' });
    }

    const isValidPassword = await bcrypt.compare(adminPassword, ADMIN_PASSWORD_HASH);
    if (!isValidPassword) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 충전 금액을 입력해주세요.' });
    }

    // 프랜차이즈 확인
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
    });

    if (!franchise) {
      return res.status(404).json({ error: '프랜차이즈를 찾을 수 없습니다.' });
    }

    // 지갑이 없으면 생성, 있으면 업데이트
    const wallet = await prisma.franchiseWallet.upsert({
      where: { franchiseId },
      create: {
        franchiseId,
        balance: amount,
      },
      update: {
        balance: { increment: amount },
      },
    });

    // 프랜차이즈 트랜잭션 기록
    await prisma.franchiseTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'TOPUP',
        description: reason || '관리자 충전',
        meta: {
          source: 'admin',
        },
      },
    });

    res.json({
      success: true,
      message: `${franchise.name} 프랜차이즈에 ${amount.toLocaleString()}원이 충전되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin franchise wallet topup error:', error);
    res.status(500).json({ error: '충전 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/franchises/:franchiseId/wallet/deduct - 프랜차이즈 충전금 차감
router.post('/franchises/:franchiseId/wallet/deduct', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;
    const { amount, reason, adminPassword } = req.body;

    // 비밀번호 검증
    if (!adminPassword) {
      return res.status(400).json({ error: '관리자 비밀번호를 입력해주세요.' });
    }

    if (!ADMIN_PASSWORD_HASH) {
      return res.status(500).json({ error: '서버 설정 오류입니다.' });
    }

    const isValidPassword = await bcrypt.compare(adminPassword, ADMIN_PASSWORD_HASH);
    if (!isValidPassword) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 차감 금액을 입력해주세요.' });
    }

    // 프랜차이즈 확인
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
    });

    if (!franchise) {
      return res.status(404).json({ error: '프랜차이즈를 찾을 수 없습니다.' });
    }

    // 현재 지갑 잔액 확인
    const currentWallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
    });

    if (!currentWallet) {
      return res.status(400).json({ error: '지갑이 존재하지 않습니다.' });
    }

    if (currentWallet.balance < amount) {
      return res.status(400).json({ error: '잔액이 부족합니다.' });
    }

    // 잔액 차감
    const wallet = await prisma.franchiseWallet.update({
      where: { franchiseId },
      data: {
        balance: { decrement: amount },
      },
    });

    // 프랜차이즈 트랜잭션 기록 (차감)
    await prisma.franchiseTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -amount,
        type: 'DEDUCT',
        description: reason || '관리자 차감',
        meta: {
          source: 'admin',
        },
      },
    });

    res.json({
      success: true,
      message: `${franchise.name} 프랜차이즈에서 ${amount.toLocaleString()}원이 차감되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin franchise wallet deduct error:', error);
    res.status(500).json({ error: '차감 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/franchises/:franchiseId/wallet - 프랜차이즈 지갑 정보 조회
router.get('/franchises/:franchiseId/wallet', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { franchiseId } = req.params;

    const wallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!wallet) {
      return res.json({
        balance: 0,
        transactions: [],
      });
    }

    res.json({
      balance: wallet.balance,
      transactions: wallet.transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin franchise wallet get error:', error);
    res.status(500).json({ error: '지갑 정보 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 결제내역 관리
// ============================================

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

// POST /api/admin/enable-all-visit-source - 모든 매장 방문 경로 활성화
router.post('/enable-all-visit-source', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 기본 방문 경로 옵션
    const DEFAULT_OPTIONS = [
      { id: 'revisit', label: '단순 재방문', order: 1, enabled: true },
      { id: 'friend', label: '지인 추천', order: 2, enabled: true },
      { id: 'naver', label: '네이버', order: 3, enabled: true },
      { id: 'youtube', label: '유튜브', order: 4, enabled: true },
      { id: 'daangn', label: '당근', order: 5, enabled: true },
      { id: 'instagram', label: '인스타그램', order: 6, enabled: true },
      { id: 'sms', label: '문자', order: 7, enabled: true },
      { id: 'kakao', label: '카카오톡', order: 8, enabled: true },
      { id: 'passby', label: '지나가다 방문', order: 9, enabled: true },
    ];

    // 모든 매장 조회
    const stores = await prisma.store.findMany({
      select: { id: true },
    });

    // 각 매장에 대해 방문 경로 설정 upsert (활성화)
    const results = await Promise.all(
      stores.map(store =>
        prisma.visitSourceSetting.upsert({
          where: { storeId: store.id },
          create: {
            storeId: store.id,
            enabled: true,
            options: DEFAULT_OPTIONS,
          },
          update: {
            enabled: true,
          },
        })
      )
    );

    res.json({
      success: true,
      message: `${results.length}개 매장의 방문 경로가 활성화되었습니다.`,
      count: results.length,
    });
  } catch (error) {
    console.error('Enable all visit source error:', error);
    res.status(500).json({ error: '방문 경로 활성화 중 오류가 발생했습니다.' });
  }
});

// ==================== 스토어 상품 관리 API ====================

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

// POST /api/admin/stores/bulk - 매장 대량 등록
router.post('/stores/bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { stores: storeRows, defaultPassword, franchiseId, enrollmentMode } = req.body;

    if (!Array.isArray(storeRows) || storeRows.length === 0) {
      return res.status(400).json({ error: '등록할 매장 데이터가 없습니다.' });
    }

    if (storeRows.length > 500) {
      return res.status(400).json({ error: '한 번에 최대 500개까지 등록 가능합니다.' });
    }

    const password = defaultPassword || 'taghere1234';
    const passwordHash = await bcrypt.hash(password, 10);

    // 이메일 중복 체크를 위해 기존 이메일 조회
    const existingEmails = new Set(
      (await prisma.staffUser.findMany({ select: { email: true } })).map((u: any) => u.email)
    );

    const created: Array<{ row: number; storeName: string; email: string }> = [];
    const errors: Array<{ row: number; storeName: string; reason: string }> = [];
    const crmOnResults: Array<{ storeName: string; success: boolean; error?: string }> = [];
    const emailsInBatch = new Set<string>();

    for (let i = 0; i < storeRows.length; i++) {
      const row = storeRows[i];
      const rowNum = i + 2; // 엑셀 기준 (헤더=1행)
      const storeName = row.storeName?.trim();
      const ownerName = row.ownerName?.trim() || '';
      const phone = row.phone?.trim() || '';
      const email = row.email?.trim()?.toLowerCase();
      const businessRegNumber = row.businessRegNumber?.trim() || null;
      const address = row.address?.trim() || '';
      const category = row.category?.trim() || null;

      // 필수 필드 검증
      if (!storeName) {
        errors.push({ row: rowNum, storeName: storeName || '-', reason: '상호명이 없습니다.' });
        continue;
      }

      if (!email) {
        errors.push({ row: rowNum, storeName, reason: '이메일이 없습니다.' });
        continue;
      }

      // 이메일 형식 검증
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, storeName, reason: '이메일 형식이 올바르지 않습니다.' });
        continue;
      }

      // 이메일 중복 체크 (DB + 배치 내)
      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, storeName, reason: `이미 사용 중인 이메일입니다. (${email})` });
        continue;
      }
      if (emailsInBatch.has(email)) {
        errors.push({ row: rowNum, storeName, reason: `파일 내 중복 이메일입니다. (${email})` });
        continue;
      }

      try {
        const baseSlug = generateSlug(storeName);
        const slug = await getUniqueSlug(baseSlug);
        const validEnrollmentMode = enrollmentMode && ['POINTS', 'STAMP', 'MEMBERSHIP'].includes(enrollmentMode)
          ? enrollmentMode
          : undefined;

        await prisma.$transaction(async (tx) => {
          const store = await tx.store.create({
            data: {
              name: storeName,
              slug,
              ownerName: ownerName || null,
              phone: phone || null,
              businessRegNumber,
              address: address || null,
              category: category || null,
              pointRatePercent: 5,
              franchiseId: franchiseId || null,
              ...(validEnrollmentMode && { enrollmentMode: validEnrollmentMode }),
            },
          });

          await tx.wallet.create({
            data: { storeId: store.id, balance: 500 },
          });

          await tx.waitingSetting.create({
            data: { storeId: store.id, operationStatus: 'ACCEPTING' },
          });

          await tx.waitingType.create({
            data: {
              storeId: store.id,
              name: '홀',
              avgWaitTimePerTeam: 5,
              sortOrder: 0,
              isActive: true,
            },
          });

          await tx.staffUser.create({
            data: {
              storeId: store.id,
              email,
              passwordHash,
              name: ownerName || storeName,
              role: 'OWNER',
            },
          });

          // 방문경로 설정 기본 활성화
          await tx.visitSourceSetting.create({
            data: {
              storeId: store.id,
              enabled: true,
              options: [
                { id: 'revisit', label: '단순 재방문', order: 1, enabled: true },
                { id: 'friend', label: '지인 추천', order: 2, enabled: true },
                { id: 'naver', label: '네이버', order: 3, enabled: true },
                { id: 'youtube', label: '유튜브', order: 4, enabled: true },
                { id: 'daangn', label: '당근', order: 5, enabled: true },
                { id: 'instagram', label: '인스타그램', order: 6, enabled: true },
                { id: 'sms', label: '문자', order: 7, enabled: true },
                { id: 'kakao', label: '카카오톡', order: 8, enabled: true },
                { id: 'passby', label: '지나가다 방문', order: 9, enabled: true },
              ],
            },
          });
        });

        emailsInBatch.add(email);
        existingEmails.add(email);
        created.push({ row: rowNum, storeName, email });

        // 태그히어 서버에 CRM ON 알림 (리다이렉트 URL 등록)
        try {
          await notifyCrmOn({
            version: 'v1',
            userId: email,
            storeName,
            slug,
            isStampMode: false,
            enrollmentMode: validEnrollmentMode || 'POINTS',
          });
          crmOnResults.push({ storeName, success: true });
        } catch (crmErr: any) {
          console.error(`[Admin Bulk] notifyCrmOn failed for ${storeName}:`, crmErr);
          crmOnResults.push({ storeName, success: false, error: crmErr.message || 'CRM ON 실패' });
        }
      } catch (err: any) {
        errors.push({ row: rowNum, storeName, reason: err.message || '생성 중 오류' });
      }
    }

    const crmOnSuccess = crmOnResults.filter(r => r.success).length;
    const crmOnFailed = crmOnResults.filter(r => !r.success);

    res.json({
      total: storeRows.length,
      created: created.length,
      errors,
      defaultPassword: password,
      crmOn: {
        success: crmOnSuccess,
        failed: crmOnFailed.length,
        failures: crmOnFailed,
      },
    });
  } catch (error) {
    console.error('Admin bulk store registration error:', error);
    res.status(500).json({ error: '매장 대량 등록 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/backfill-coupon-usage - 과거 직원확인 내역 재집계
router.post('/backfill-coupon-usage', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // couponCode가 있는 AutomationLog 중 couponUsed=false인 것들 조회
    const pendingLogs = await prisma.automationLog.findMany({
      where: {
        couponCode: { not: null },
        couponUsed: false,
      },
      select: {
        id: true,
        couponCode: true,
      },
    });

    if (pendingLogs.length === 0) {
      return res.json({ message: '재집계할 내역이 없습니다.', updated: 0, total: 0 });
    }

    let updated = 0;

    for (const log of pendingLogs) {
      // RetargetCoupon에서 실제 사용된 쿠폰인지 확인
      const coupon = await (prisma as any).retargetCoupon.findUnique({
        where: { code: log.couponCode },
        select: { usedAt: true },
      });

      if (coupon?.usedAt) {
        await prisma.automationLog.update({
          where: { id: log.id },
          data: {
            couponUsed: true,
            couponUsedAt: coupon.usedAt,
          },
        });
        updated++;
      }
    }

    res.json({
      message: `재집계 완료: ${updated}건 업데이트`,
      updated,
      total: pendingLogs.length,
    });
  } catch (error) {
    console.error('Backfill coupon usage error:', error);
    res.status(500).json({ error: '재집계 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/customers/export - 전체 고객 데이터 추출 (스트리밍)
router.post('/customers/export', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { password } = req.body;

    if (password !== '!Computer5117') {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    // 전체 건수 조회
    const total = await prisma.customer.count();

    // 배치 처리로 메모리 절약
    const BATCH_SIZE = 5000;
    const allData: any[] = [];

    for (let skip = 0; skip < total; skip += BATCH_SIZE) {
      const batch = await prisma.customer.findMany({
        include: {
          store: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH_SIZE,
      });

      for (const c of batch) {
        allData.push({
          storeName: c.store.name,
          name: c.name,
          phone: c.phone,
          gender: c.gender,
          ageGroup: c.ageGroup,
          birthday: c.birthday,
          birthYear: c.birthYear,
          visitCount: c.visitCount,
          totalPoints: c.totalPoints,
          totalStamps: c.totalStamps,
          lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
          consentMarketing: c.consentMarketing,
          visitSource: c.visitSource,
          createdAt: c.createdAt.toISOString(),
        });
      }
    }

    res.json({ customers: allData, total: allData.length });
  } catch (error) {
    console.error('Admin customer export error:', error);
    res.status(500).json({ error: '고객 데이터 추출 중 오류가 발생했습니다.' });
  }
});

// ===== 자동 마케팅 Admin 엔드포인트 =====

// GET /api/admin/automation-stats — 전체 요약 통계
router.get('/automation-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalStores, activeStoreIds, totalRulesEnabled, logsThisMonth, ruleTypeCounts] = await Promise.all([
      prisma.store.count(),
      prisma.automationRule.findMany({
        where: { enabled: true },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
      prisma.automationRule.count({ where: { enabled: true } }),
      prisma.automationLog.findMany({
        where: { sentAt: { gte: startOfMonth } },
        select: { couponUsed: true },
      }),
      prisma.automationRule.groupBy({
        by: ['type'],
        where: { enabled: true },
        _count: { _all: true },
      }),
    ]);

    const totalSentThisMonth = logsThisMonth.length;
    const totalCouponUsed = logsThisMonth.filter(l => l.couponUsed).length;
    const usageRate = totalSentThisMonth > 0 ? Math.round((totalCouponUsed / totalSentThisMonth) * 100) : 0;

    const ruleTypeBreakdown: Record<string, number> = {};
    ruleTypeCounts.forEach(r => {
      ruleTypeBreakdown[r.type] = r._count._all;
    });

    res.json({
      totalStores,
      activeStores: activeStoreIds.length,
      totalRulesEnabled,
      totalSentThisMonth,
      totalCouponUsed,
      usageRate,
      ruleTypeBreakdown,
    });
  } catch (error) {
    console.error('Admin automation stats error:', error);
    res.status(500).json({ error: '자동 마케팅 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/automation-stores — 매장별 자동 마케팅 현황
router.get('/automation-stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        ownerName: true,
        automationRules: {
          select: { type: true, enabled: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const storeIds = stores.map(s => s.id);

    // 이번 달 로그를 매장별로 집계
    const logStats = await prisma.automationLog.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIds },
        sentAt: { gte: startOfMonth },
      },
      _count: { _all: true },
    });

    const couponStats = await prisma.automationLog.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIds },
        sentAt: { gte: startOfMonth },
        couponUsed: true,
      },
      _count: { _all: true },
    });

    const lastSentMap = await prisma.automationLog.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds } },
      _max: { sentAt: true },
    });

    const logMap: Record<string, number> = {};
    logStats.forEach(l => { logMap[l.storeId] = l._count._all; });

    const couponMap: Record<string, number> = {};
    couponStats.forEach(c => { couponMap[c.storeId] = c._count._all; });

    const lastSentAtMap: Record<string, Date | null> = {};
    lastSentMap.forEach(l => { lastSentAtMap[l.storeId] = l._max.sentAt; });

    const result = stores.map(store => {
      const enabledRules = store.automationRules.filter(r => r.enabled).map(r => r.type);
      const totalSent = logMap[store.id] || 0;
      const couponUsed = couponMap[store.id] || 0;
      return {
        storeId: store.id,
        storeName: store.name,
        ownerName: store.ownerName,
        enabledRules,
        totalSent,
        couponUsed,
        usageRate: totalSent > 0 ? Math.round((couponUsed / totalSent) * 100) : 0,
        lastSentAt: lastSentAtMap[store.id] || null,
      };
    });

    // 활성 매장 우선 정렬
    result.sort((a, b) => {
      if (a.enabledRules.length !== b.enabledRules.length) return b.enabledRules.length - a.enabledRules.length;
      return b.totalSent - a.totalSent;
    });

    res.json({ stores: result });
  } catch (error) {
    console.error('Admin automation stores error:', error);
    res.status(500).json({ error: '매장별 자동 마케팅 현황 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/automation-trend — 일별 추세 데이터
router.get('/automation-trend', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [logs, activations] = await Promise.all([
      prisma.automationLog.findMany({
        where: { sentAt: { gte: startDate } },
        select: { sentAt: true, couponUsed: true },
      }),
      prisma.automationRule.findMany({
        where: { enabled: true, updatedAt: { gte: startDate } },
        select: { updatedAt: true },
      }),
    ]);

    // 일별 집계
    const dayMap: Record<string, { sent: number; couponUsed: number; newActivations: number }> = {};

    // 날짜 배열 초기화
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { sent: 0, couponUsed: 0, newActivations: 0 };
    }

    logs.forEach(log => {
      const key = log.sentAt.toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].sent++;
        if (log.couponUsed) dayMap[key].couponUsed++;
      }
    });

    activations.forEach(rule => {
      const key = rule.updatedAt.toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].newActivations++;
      }
    });

    const trend = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    res.json({ trend });
  } catch (error) {
    console.error('Admin automation trend error:', error);
    res.status(500).json({ error: '자동 마케팅 추세 조회 중 오류가 발생했습니다.' });
  }
});

// ===== 매장 enrollmentMode 관리 =====

// GET /api/admin/stores/enrollment-stats - 등록 모드별 매장 현황
router.get('/stores/enrollment-stats', adminAuthMiddleware, async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        enrollmentMode: true,
        crmEnabled: true,
        _count: { select: { customers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: stores.length,
      byMode: {
        POINTS: stores.filter(s => s.enrollmentMode === 'POINTS').length,
        STAMP: stores.filter(s => s.enrollmentMode === 'STAMP').length,
        MEMBERSHIP: stores.filter(s => s.enrollmentMode === 'MEMBERSHIP').length,
      },
      withoutSlug: stores.filter(s => !s.slug).length,
      crmDisabled: stores.filter(s => !s.crmEnabled).length,
    };

    res.json({
      stats,
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        enrollmentMode: s.enrollmentMode,
        crmEnabled: s.crmEnabled,
        customerCount: s._count.customers,
      })),
    });
  } catch (error) {
    console.error('Admin enrollment stats error:', error);
    res.status(500).json({ error: '등록 모드 통계 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/stores/:storeId/enrollment-mode - 개별 매장 등록 모드 변경
router.put('/stores/:storeId/enrollment-mode', adminAuthMiddleware, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { mode } = req.body;

    if (!['POINTS', 'STAMP', 'MEMBERSHIP'].includes(mode)) {
      return res.status(400).json({ error: 'mode는 POINTS, STAMP, MEMBERSHIP 중 하나여야 합니다.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug 없으면 자동 생성
    let slug = store.slug;
    if (!slug) {
      const baseSlug = generateSlug(store.name);
      slug = await getUniqueSlug(baseSlug);
    }

    await prisma.store.update({
      where: { id: storeId },
      data: {
        enrollmentMode: mode,
        crmEnabled: true,
        slug,
      },
    });

    res.json({ success: true, storeId, mode, slug });
  } catch (error) {
    console.error('Admin enrollment mode update error:', error);
    res.status(500).json({ error: '등록 모드 변경 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/batch-membership-enable - 일괄 멤버십 모드 활성화
router.post('/stores/batch-membership-enable', adminAuthMiddleware, async (req, res) => {
  try {
    const { storeIds, dryRun = false } = req.body;

    // storeIds가 없으면 모든 POINTS 모드 매장 대상
    let targetStores;
    if (storeIds && Array.isArray(storeIds) && storeIds.length > 0) {
      targetStores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true, slug: true, enrollmentMode: true, crmEnabled: true },
      });
    } else {
      targetStores = await prisma.store.findMany({
        where: { enrollmentMode: { not: 'MEMBERSHIP' } },
        select: { id: true, name: true, slug: true, enrollmentMode: true, crmEnabled: true },
      });
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        total: targetStores.length,
        stores: targetStores.map(s => ({
          id: s.id,
          name: s.name,
          currentMode: s.enrollmentMode,
          hasSlug: !!s.slug,
        })),
      });
    }

    let enabled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const store of targetStores) {
      try {
        let slug = store.slug;
        if (!slug) {
          const baseSlug = generateSlug(store.name);
          slug = await getUniqueSlug(baseSlug);
        }

        await prisma.store.update({
          where: { id: store.id },
          data: {
            enrollmentMode: 'MEMBERSHIP',
            crmEnabled: true,
            slug,
          },
        });
        enabled++;
      } catch (err: any) {
        errors.push(`${store.name} (${store.id}): ${err.message}`);
        skipped++;
      }
    }

    res.json({
      dryRun: false,
      total: targetStores.length,
      enabled,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('Admin batch membership enable error:', error);
    res.status(500).json({ error: '일괄 멤버십 활성화 중 오류가 발생했습니다.' });
  }
});

// ==================== 테이블 링크 설정 (어드민) ====================

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com';

// GET /api/admin/table-link-settings/:storeId
router.get('/table-link-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, slug: true, name: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug가 없는 매장은 자동 생성
    let storeSlug = store.slug;
    if (!storeSlug) {
      const baseSlug = generateSlug(store.name);
      storeSlug = await getUniqueSlug(baseSlug);
      await prisma.store.update({
        where: { id: storeId },
        data: { slug: storeSlug },
      });
    }

    let setting = await prisma.tableLinkSetting.findUnique({
      where: { storeId },
    });

    if (!setting) {
      setting = await prisma.tableLinkSetting.create({
        data: {
          storeId,
          enabled: false,
          tables: [],
        },
      });
    }

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
      customerPageUrl: `${PUBLIC_APP_URL}/taghere-table-link/${storeSlug}`,
      storeName: store.name,
      storeSlug,
    });
  } catch (error) {
    console.error('Admin get table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/table-link-settings/:storeId
router.put('/table-link-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { enabled, tables, customerTitle, customerSubtitle } = req.body;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    if (tables && Array.isArray(tables)) {
      if (tables.length > 100) {
        return res.status(400).json({ error: '테이블은 최대 100개까지 등록할 수 있습니다.' });
      }

      const numbers = tables.map((t: TableEntry) => t.tableNumber);
      const unique = new Set(numbers);
      if (unique.size !== numbers.length) {
        return res.status(400).json({ error: '중복된 테이블 번호가 있습니다.' });
      }

      for (const t of tables as TableEntry[]) {
        if (!t.tableNumber || !t.url) {
          return res.status(400).json({ error: '테이블 번호와 URL은 필수입니다.' });
        }
        try {
          new URL(t.url);
        } catch {
          return res.status(400).json({ error: `잘못된 URL 형식입니다: ${t.url}` });
        }
      }
    }

    const setting = await prisma.tableLinkSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        tables: (tables ?? []) as any,
        customerTitle: customerTitle ?? null,
        customerSubtitle: customerSubtitle ?? null,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(tables !== undefined && { tables: tables as any }),
        ...(customerTitle !== undefined && { customerTitle }),
        ...(customerSubtitle !== undefined && { customerSubtitle }),
      },
    });

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
    });
  } catch (error) {
    console.error('Admin update table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/table-link-settings/:storeId/bulk-add
router.post('/table-link-settings/:storeId/bulk-add', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { startNumber, endNumber, urlTemplate } = req.body;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    if (!startNumber || !endNumber || !urlTemplate) {
      return res.status(400).json({ error: '시작 번호, 끝 번호, URL 템플릿이 필요합니다.' });
    }

    const start = parseInt(startNumber);
    const end = parseInt(endNumber);

    if (isNaN(start) || isNaN(end) || start < 1 || end > 100 || start > end) {
      return res.status(400).json({ error: '유효한 범위를 입력해주세요. (1~100)' });
    }

    let setting = await prisma.tableLinkSetting.findUnique({
      where: { storeId },
    });

    const existingTables = (setting?.tables as unknown as TableEntry[]) || [];
    const existingNumbers = new Set(existingTables.map(t => t.tableNumber));

    const newTables: TableEntry[] = [];
    for (let i = start; i <= end; i++) {
      const num = String(i);
      if (!existingNumbers.has(num)) {
        newTables.push({
          tableNumber: num,
          url: urlTemplate.replace(/\{number\}/g, num),
        });
      }
    }

    const mergedTables = [...existingTables, ...newTables];

    if (mergedTables.length > 100) {
      return res.status(400).json({ error: '테이블은 최대 100개까지 등록할 수 있습니다.' });
    }

    const updated = await prisma.tableLinkSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: false,
        tables: mergedTables as any,
      },
      update: {
        tables: mergedTables as any,
      },
    });

    res.json({
      tables: (updated.tables as unknown as TableEntry[]) || [],
      addedCount: newTables.length,
      skippedCount: (end - start + 1) - newTables.length,
    });
  } catch (error) {
    console.error('Admin bulk add tables error:', error);
    res.status(500).json({ error: '일괄 추가 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 기업광고 알림톡 설정 (다중 쿠폰)
// ============================================

// GET /api/admin/corporate-ads - 전체 쿠폰 리스트 조회
router.get('/corporate-ads', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const corporateAds = await prisma.corporateAd.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(corporateAds);
  } catch (error) {
    console.error('Corporate ads list error:', error);
    res.status(500).json({ error: '쿠폰 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/corporate-ads - 새 쿠폰 추가
router.post('/corporate-ads', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const {
      brandName = '',
      imageUrl = '',
      displayOrder,
      templateId = 'KA01TP250930075547299ikOWJ6bArTY',
      couponName = '',
      couponContent = '',
      couponAmount = '',
      amountValue = 0,
      expiryDate = '',
      registrationMethod = '',
      landingLink = '',
      couponLink = '',
      templateVariables,
      couponCodeVariable = '',
      enabled = true,
    } = req.body;

    // displayOrder 미지정 시 마지막 순서로
    let order = displayOrder;
    if (typeof order !== 'number') {
      const last = await prisma.corporateAd.findFirst({
        orderBy: { displayOrder: 'desc' },
      });
      order = last ? last.displayOrder + 1 : 0;
    }

    const created = await prisma.corporateAd.create({
      data: {
        brandName,
        imageUrl,
        displayOrder: order,
        templateId,
        couponName,
        couponContent,
        couponAmount,
        amountValue,
        expiryDate,
        registrationMethod,
        landingLink,
        couponLink,
        templateVariables: templateVariables ?? undefined,
        enabled,
      },
    });

    res.json(created);
  } catch (error) {
    console.error('Corporate ad create error:', error);
    res.status(500).json({ error: '쿠폰 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/corporate-ads/reorder - 표시 순서 일괄 변경
// 주의: 반드시 PUT /:id 라우트보다 먼저 등록되어야 함
router.put('/corporate-ads/reorder', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { orders } = req.body as { orders: { id: string; displayOrder: number }[] };
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders 배열이 필요합니다.' });
    }

    await prisma.$transaction(
      orders.map((o) =>
        prisma.corporateAd.update({
          where: { id: o.id },
          data: { displayOrder: o.displayOrder },
        }),
      ),
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Corporate ad reorder error:', error);
    res.status(500).json({ error: '순서 변경 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/corporate-ads/:id - 쿠폰 수정
router.put('/corporate-ads/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      brandName,
      imageUrl,
      displayOrder,
      templateId,
      couponName,
      couponContent,
      couponAmount,
      amountValue,
      expiryDate,
      registrationMethod,
      landingLink,
      couponLink,
      templateVariables,
      couponCodeVariable,
      enabled,
    } = req.body;

    const updated = await prisma.corporateAd.update({
      where: { id },
      data: {
        ...(brandName !== undefined && { brandName }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(templateId !== undefined && { templateId }),
        ...(couponName !== undefined && { couponName }),
        ...(couponContent !== undefined && { couponContent }),
        ...(couponAmount !== undefined && { couponAmount }),
        ...(amountValue !== undefined && { amountValue }),
        ...(expiryDate !== undefined && { expiryDate }),
        ...(registrationMethod !== undefined && { registrationMethod }),
        ...(landingLink !== undefined && { landingLink }),
        ...(couponLink !== undefined && { couponLink }),
        ...(templateVariables !== undefined && { templateVariables }),
        ...(couponCodeVariable !== undefined && { couponCodeVariable }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Corporate ad update error:', error);
    res.status(500).json({ error: '쿠폰 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/corporate-ads/:id - 쿠폰 삭제
router.delete('/corporate-ads/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.corporateAd.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Corporate ad delete error:', error);
    res.status(500).json({ error: '쿠폰 삭제 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 쿠폰 코드 풀 (난수 코드)
// ============================================

// multer: 텍스트 파일 업로드 (메모리 스토리지, 30MB 제한 ≈ 50만 개 + 여유)
const couponCodeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.txt' && ext !== '.csv') {
      cb(new Error('.txt 또는 .csv 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/admin/corporate-ads/:id/codes/upload - 코드 대량 업로드
router.post(
  '/corporate-ads/:id/codes/upload',
  adminAuthMiddleware,
  couponCodeUpload.single('file'),
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const corporateAd = await prisma.corporateAd.findUnique({ where: { id } });
      if (!corporateAd) return res.status(404).json({ error: '쿠폰을 찾을 수 없습니다.' });

      if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

      const text = req.file.buffer.toString('utf-8');
      const codes = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (codes.length === 0) {
        return res.status(400).json({ error: '유효한 코드가 없습니다.' });
      }

      // 중복 제거 (파일 내부 중복)
      const uniqueCodes = Array.from(new Set(codes));

      const CHUNK = 10000;
      let totalInserted = 0;

      for (let i = 0; i < uniqueCodes.length; i += CHUNK) {
        const batch = uniqueCodes.slice(i, i + CHUNK);
        const result = await prisma.couponCode.createMany({
          data: batch.map((code) => ({ corporateAdId: id, code })),
          skipDuplicates: true, // DB 이미 존재하는 코드 스킵
        });
        totalInserted += result.count;
      }

      res.json({
        success: true,
        receivedLines: codes.length,
        uniqueInFile: uniqueCodes.length,
        inserted: totalInserted,
        skipped: uniqueCodes.length - totalInserted,
      });
    } catch (error: any) {
      console.error('Corporate ad codes upload error:', error);
      res.status(500).json({ error: error?.message || '코드 업로드 중 오류가 발생했습니다.' });
    }
  },
);

// GET /api/admin/corporate-ads/:id/codes/stats - 통계
router.get(
  '/corporate-ads/:id/codes/stats',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [total, used] = await Promise.all([
        prisma.couponCode.count({ where: { corporateAdId: id } }),
        prisma.couponCode.count({ where: { corporateAdId: id, usedAt: { not: null } } }),
      ]);
      res.json({ total, used, available: total - used });
    } catch (error) {
      console.error('Corporate ad codes stats error:', error);
      res.status(500).json({ error: '코드 통계 조회 중 오류가 발생했습니다.' });
    }
  },
);

// GET /api/admin/corporate-ads/:id/codes - 코드 리스트 (페이지네이션 + 필터)
router.get(
  '/corporate-ads/:id/codes',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const page = Math.max(1, parseInt((req.query.page as string) || '1') || 1);
      const limit = Math.min(500, parseInt((req.query.limit as string) || '100') || 100);
      const filter = (req.query.filter as string) || 'all';

      const where: any = { corporateAdId: id };
      if (filter === 'used') where.usedAt = { not: null };
      else if (filter === 'available') where.usedAt = null;

      const [codes, total] = await Promise.all([
        prisma.couponCode.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            code: true,
            usedAt: true,
            usedByCustomerId: true,
            createdAt: true,
          },
        }),
        prisma.couponCode.count({ where }),
      ]);

      res.json({ codes, total, page, limit });
    } catch (error) {
      console.error('Corporate ad codes list error:', error);
      res.status(500).json({ error: '코드 목록 조회 중 오류가 발생했습니다.' });
    }
  },
);

// DELETE /api/admin/corporate-ads/:id/codes/:codeId - 개별 코드 삭제 (미사용만 가능)
router.delete(
  '/corporate-ads/:id/codes/:codeId',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id, codeId } = req.params;
      const code = await prisma.couponCode.findFirst({
        where: { id: codeId, corporateAdId: id },
      });
      if (!code) return res.status(404).json({ error: '코드를 찾을 수 없습니다.' });
      if (code.usedAt) {
        return res.status(400).json({ error: '이미 사용된 코드는 삭제할 수 없습니다.' });
      }
      await prisma.couponCode.delete({ where: { id: codeId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Corporate ad code delete error:', error);
      res.status(500).json({ error: '코드 삭제 중 오류가 발생했습니다.' });
    }
  },
);

// POST /api/admin/corporate-ads/:id/codes/shuffle - 미사용 코드 발급 순서 무작위로 섞기
router.post(
  '/corporate-ads/:id/codes/shuffle',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      // PostgreSQL: random() 함수로 미사용 코드들의 createdAt을 무작위 시간으로 재할당
      // 50만 개도 단일 쿼리로 빠르게 처리됨
      const result = await prisma.$executeRaw`
        UPDATE "coupon_codes"
        SET "createdAt" = NOW() - (random() * interval '365 days')
        WHERE "corporateAdId" = ${id} AND "usedAt" IS NULL
      `;

      res.json({ success: true, shuffled: Number(result) });
    } catch (error) {
      console.error('Corporate ad codes shuffle error:', error);
      res.status(500).json({ error: '코드 섞기 중 오류가 발생했습니다.' });
    }
  },
);

// DELETE /api/admin/corporate-ads/:id/codes - 미사용 코드 전체 삭제
router.delete(
  '/corporate-ads/:id/codes',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await prisma.couponCode.deleteMany({
        where: { corporateAdId: id, usedAt: null },
      });
      res.json({ success: true, deleted: result.count });
    } catch (error) {
      console.error('Corporate ad codes delete-all error:', error);
      res.status(500).json({ error: '코드 일괄 삭제 중 오류가 발생했습니다.' });
    }
  },
);

// 호환용 (deprecated): 기존 단일 쿠폰 엔드포인트 - 첫 번째 enabled 쿠폰 반환
router.get('/corporate-ad', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const corporateAd = await prisma.corporateAd.findFirst({
      where: { enabled: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (!corporateAd) {
      return res.json({
        templateId: 'KA01TP250930075547299ikOWJ6bArTY',
        brandName: '',
        imageUrl: '',
        couponName: '',
        couponContent: '',
        couponAmount: '',
        amountValue: 0,
        expiryDate: '',
        registrationMethod: '',
        landingLink: '',
        couponLink: '',
        enabled: true,
      });
    }
    res.json(corporateAd);
  } catch (error) {
    console.error('Corporate ad get error:', error);
    res.status(500).json({ error: '기업광고 설정 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 기업광고 알림톡 통계
// ============================================

// ============================================
// 매장 주소 일괄 업데이트 + 고객 지역 백필
// ============================================

// POST /api/admin/stores/bulk-address
// 엑셀에서 파싱된 { items: [{ id, address }] } 배열을 받아 매장 주소 일괄 업데이트
router.post('/stores/bulk-address', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { items } = req.body as { items?: Array<{ id: string; address: string }> };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '업데이트할 항목이 없습니다.' });
    }
    if (items.length > 2000) {
      return res.status(400).json({ error: '한 번에 최대 2,000개까지 처리 가능합니다.' });
    }

    const failed: Array<{ id: string; name: string | null; address: string; reason: string }> = [];
    let updated = 0;

    for (const item of items) {
      const id = (item?.id || '').trim();
      const address = (item?.address || '').trim();
      if (!id || !address) continue;

      const store = await prisma.store.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!store) {
        failed.push({ id, name: null, address, reason: '매장 없음' });
        continue;
      }

      const parsed = parseKoreanAddress(address);
      if (!parsed.sido) {
        failed.push({ id, name: store.name, address, reason: '시도 파싱 실패' });
        continue;
      }

      await prisma.store.update({
        where: { id },
        data: {
          address,
          addressSido: parsed.sido,
          addressSigungu: parsed.sigungu,
          addressDetail: parsed.detail,
        } as any,
      });
      updated++;
    }

    res.json({ updated, failed, total: items.length });
  } catch (error) {
    console.error('Bulk address update error:', error);
    res.status(500).json({ error: '주소 일괄 업데이트 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/customers/populate-regions
// 과거 가입 고객의 regionSido/regionSigungu를 매장 주소 기반으로 백필
router.post(
  '/customers/populate-regions',
  adminAuthMiddleware,
  async (_req: AdminRequest, res: Response) => {
    try {
      const totalMissingBefore = await prisma.customer.count({
        where: { regionSido: null },
      });

      const BATCH = 1000;
      const CHUNK = 50;
      let updated = 0;

      while (true) {
        const customers = await prisma.customer.findMany({
          where: {
            regionSido: null,
            store: {
              addressSido: { not: null },
              addressSigungu: { not: null },
            },
          },
          include: {
            store: {
              select: { addressSido: true, addressSigungu: true },
            },
          },
          take: BATCH,
        });

        if (customers.length === 0) break;

        for (let i = 0; i < customers.length; i += CHUNK) {
          const chunk = customers.slice(i, i + CHUNK);
          await prisma.$transaction(
            chunk.map((c) =>
              prisma.customer.update({
                where: { id: c.id },
                data: {
                  regionSido: sidoToShort(c.store.addressSido),
                  regionSigungu: c.store.addressSigungu,
                },
              }),
            ),
          );
        }
        updated += customers.length;
      }

      const skippedNoStoreAddress = totalMissingBefore - updated;

      res.json({ updated, skippedNoStoreAddress, totalMissingBefore });
    } catch (error) {
      console.error('Populate customer regions error:', error);
      res.status(500).json({ error: '고객 지역 백필 중 오류가 발생했습니다.' });
    }
  },
);

// GET /api/admin/corporate-ad-stats - 기업광고 알림톡 발송 및 멤버십 가입 통계
router.get('/corporate-ad-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = days === 'all' ? 365 : parseInt(days as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // 기업광고 알림톡 발송 내역 (CORPORATE_AD 타입)
    const alimTalkMessages = await prisma.alimTalkOutbox.findMany({
      where: {
        messageType: 'CORPORATE_AD',
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 멤버십 가입 고객 (enrollmentMode가 MEMBERSHIP인 매장의 방문만 집계)
    const membershipVisits = await prisma.visitOrOrder.findMany({
      where: {
        visitedAt: { gte: startDate },
        store: {
          enrollmentMode: 'MEMBERSHIP',
        },
      },
      select: {
        visitedAt: true,
        customerId: true,
      },
      orderBy: { visitedAt: 'asc' },
    });

    // 일별 집계
    const alimTalkByDate = new Map<string, { sent: number; failed: number; total: number }>();
    const membershipByDate = new Map<string, Set<string>>();

    alimTalkMessages.forEach((msg) => {
      const dateStr = msg.createdAt.toISOString().split('T')[0];
      const entry = alimTalkByDate.get(dateStr) || { sent: 0, failed: 0, total: 0 };
      entry.total++;
      if (msg.status === 'SENT') entry.sent++;
      else if (msg.status === 'FAILED') entry.failed++;
      alimTalkByDate.set(dateStr, entry);
    });

    membershipVisits.forEach((visit) => {
      const dateStr = visit.visitedAt.toISOString().split('T')[0];
      const customers = membershipByDate.get(dateStr) || new Set();
      customers.add(visit.customerId);
      membershipByDate.set(dateStr, customers);
    });

    // 기간 내 모든 날짜 생성
    const dailyData: {
      date: string;
      alimTalkSent: number;
      alimTalkFailed: number;
      alimTalkTotal: number;
      membershipCount: number;
    }[] = [];

    const currentDate = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const alimTalk = alimTalkByDate.get(dateStr) || { sent: 0, failed: 0, total: 0 };
      const membershipCustomers = membershipByDate.get(dateStr);

      dailyData.push({
        date: dateStr,
        alimTalkSent: alimTalk.sent,
        alimTalkFailed: alimTalk.failed,
        alimTalkTotal: alimTalk.total,
        membershipCount: membershipCustomers ? membershipCustomers.size : 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalAlimTalk = alimTalkMessages.length;
    const totalSent = alimTalkMessages.filter((m) => m.status === 'SENT').length;
    const totalFailed = alimTalkMessages.filter((m) => m.status === 'FAILED').length;
    const uniqueMembershipCustomers = new Set(membershipVisits.map((v) => v.customerId));

    res.json({
      trend: dailyData,
      summary: {
        totalAlimTalk,
        totalSent,
        totalFailed,
        totalMembership: uniqueMembershipCustomers.size,
      },
    });
  } catch (error) {
    console.error('Corporate ad stats error:', error);
    res.status(500).json({ error: '기업광고 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/corporate-ad-analytics - 기업광고 쿠폰 성과 분석
// AlimTalkOutbox (status=SENT) 기준으로 모든 브랜드 공통 추적
// - 난수 코드 없는 브랜드(예: 세븐일레븐)도 알림톡 발송 기록으로 집계
// - idempotencyKey 파싱: "corporate_ad:{storeId}:{customerId}:{couponId}"
router.get('/corporate-ad-analytics', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const isAll = days === 'all';
    const daysNum = isAll ? 365 : parseInt(days as string) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // ─── 1. 기간 내 기업광고 알림톡 발송 내역 ───
    // SENT/FAILED 모두 조회 (실패율 계산용), 발행량은 SENT만 카운트
    const alimTalkRows = await prisma.alimTalkOutbox.findMany({
      where: {
        messageType: 'CORPORATE_AD',
        createdAt: { gte: startDate },
      },
      select: {
        idempotencyKey: true,
        status: true,
        sentAt: true,
        createdAt: true,
        customerId: true,
      },
    });

    // idempotencyKey에서 couponId 추출
    const extractCouponId = (key: string | null | undefined): string | null => {
      if (!key) return null;
      const parts = key.split(':');
      if (parts.length !== 4 || parts[0] !== 'corporate_ad') return null;
      return parts[3];
    };

    const sentRows = alimTalkRows.filter((r) => r.status === 'SENT');

    // ─── 2. 고객 인구통계 정보 일괄 조회 (SENT만) ───
    const customerIds = Array.from(
      new Set(sentRows.map((r) => r.customerId).filter((id): id is string => !!id)),
    );
    const customers =
      customerIds.length > 0
        ? await prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: {
              id: true,
              gender: true,
              ageGroup: true,
              regionSido: true,
              regionSigungu: true,
            },
          })
        : [];
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    // ─── 3. 브랜드 정보 + 잔여 코드 수 ───
    const corporateAds = await prisma.corporateAd.findMany({
      select: {
        id: true,
        brandName: true,
        imageUrl: true,
        couponCodeVariable: true,
      },
    });

    const remainingByBrand = await prisma.couponCode.groupBy({
      by: ['corporateAdId'],
      where: { usedAt: null },
      _count: { _all: true },
    });
    const remainingMap = new Map(remainingByBrand.map((r) => [r.corporateAdId, r._count._all]));

    // ─── 4. 집계 ───
    const issuedByDate = new Map<string, number>();
    const issuedByBrand = new Map<string, number>();
    const issuedByHour = new Map<number, number>();
    const genderCount = new Map<string, number>();
    const ageGroupCount = new Map<string, number>();
    const regionCount = new Map<string, number>();

    // 브랜드별 일자별 집계 (스택형 차트용): Map<brandId, Map<date, count>>
    const issuedByBrandDate = new Map<string, Map<string, number>>();

    for (const row of sentRows) {
      // 시간 기준: sentAt 우선, 없으면 createdAt
      const timestamp = row.sentAt ?? row.createdAt;
      const dateStr = timestamp.toISOString().split('T')[0];
      const hour = timestamp.getHours();

      issuedByDate.set(dateStr, (issuedByDate.get(dateStr) || 0) + 1);
      issuedByHour.set(hour, (issuedByHour.get(hour) || 0) + 1);

      const couponId = extractCouponId(row.idempotencyKey);
      if (couponId) {
        issuedByBrand.set(couponId, (issuedByBrand.get(couponId) || 0) + 1);

        let brandDates = issuedByBrandDate.get(couponId);
        if (!brandDates) {
          brandDates = new Map();
          issuedByBrandDate.set(couponId, brandDates);
        }
        brandDates.set(dateStr, (brandDates.get(dateStr) || 0) + 1);
      }

      // 인구통계
      if (row.customerId) {
        const cust = customerMap.get(row.customerId);
        if (cust) {
          const g = cust.gender || 'UNKNOWN';
          genderCount.set(g, (genderCount.get(g) || 0) + 1);
          const a = cust.ageGroup || 'UNKNOWN';
          ageGroupCount.set(a, (ageGroupCount.get(a) || 0) + 1);
          const region =
            cust.regionSido && cust.regionSigungu
              ? `${cust.regionSido} ${cust.regionSigungu}`
              : cust.regionSido || cust.regionSigungu || 'UNKNOWN';
          regionCount.set(region, (regionCount.get(region) || 0) + 1);
        } else {
          genderCount.set('UNKNOWN', (genderCount.get('UNKNOWN') || 0) + 1);
          ageGroupCount.set('UNKNOWN', (ageGroupCount.get('UNKNOWN') || 0) + 1);
          regionCount.set('UNKNOWN', (regionCount.get('UNKNOWN') || 0) + 1);
        }
      } else {
        genderCount.set('UNKNOWN', (genderCount.get('UNKNOWN') || 0) + 1);
        ageGroupCount.set('UNKNOWN', (ageGroupCount.get('UNKNOWN') || 0) + 1);
        regionCount.set('UNKNOWN', (regionCount.get('UNKNOWN') || 0) + 1);
      }
    }

    // ─── 5. 일자별 트렌드 (전체 + 브랜드별) ───
    const dateList: string[] = [];
    const cursor = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    while (cursor <= today) {
      dateList.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    const dailyTrend = dateList.map((date) => ({
      date,
      issued: issuedByDate.get(date) || 0,
    }));

    // 브랜드별 일자별 시리즈 (발행량 > 0인 브랜드만 포함)
    const dailyTrendByBrand = corporateAds
      .filter((b) => (issuedByBrand.get(b.id) || 0) > 0)
      .map((b) => ({
        brandId: b.id,
        brandName: b.brandName,
        imageUrl: b.imageUrl,
        series: dateList.map((date) => issuedByBrandDate.get(b.id)?.get(date) || 0),
      }));

    // ─── 6. 브랜드별 (발행량 + 잔여, 난수코드 사용 여부) ───
    const byBrand = corporateAds
      .map((b) => ({
        brandId: b.id,
        brandName: b.brandName,
        imageUrl: b.imageUrl,
        issued: issuedByBrand.get(b.id) || 0,
        remainingCodes: remainingMap.get(b.id) || 0,
        usesCodePool: !!(b.couponCodeVariable && b.couponCodeVariable.trim()),
      }))
      .sort((a, b) => b.issued - a.issued);

    // ─── 7. 시간대별 ───
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: issuedByHour.get(h) || 0,
    }));

    // ─── 8. 인구통계 ───
    const byGender = Array.from(genderCount.entries())
      .map(([gender, count]) => ({ gender, count }))
      .sort((a, b) => b.count - a.count);
    const byAgeGroup = Array.from(ageGroupCount.entries())
      .map(([ageGroup, count]) => ({ ageGroup, count }))
      .sort((a, b) => b.count - a.count);
    const byRegion = Array.from(regionCount.entries())
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ─── 9. 요약 ───
    const totalIssued = sentRows.length;
    const totalFailed = alimTalkRows.filter((r) => r.status === 'FAILED').length;
    const successRate =
      totalIssued + totalFailed > 0
        ? Math.round((totalIssued / (totalIssued + totalFailed)) * 1000) / 10
        : 0;

    res.json({
      summary: {
        totalIssued,
        totalFailed,
        successRate,
      },
      dailyTrend,
      dailyTrendByBrand,
      byBrand,
      byHour,
      demographics: {
        byGender,
        byAgeGroup,
        byRegion,
      },
    });
  } catch (error) {
    console.error('Corporate ad analytics error:', error);
    res.status(500).json({ error: '기업광고 분석 데이터 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
