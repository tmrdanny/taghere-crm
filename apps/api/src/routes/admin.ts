import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { sidoToShort } from '../utils/address-parser.js';
import { AdminRequest, adminAuthMiddleware, ADMIN_USERNAME, ADMIN_PASSWORD_HASH } from './admin-shared.js';
import announcementsRouter from './admin-announcements.js';
import tableLinkRouter from './admin-table-link.js';
import statsRouter from './admin-stats.js';
import paymentsRouter from './admin-payments.js';
import alimtalkRouter from './admin-alimtalk.js';
import storeOrdersRouter from './admin-store-orders.js';
import storesRouter from './admin-stores.js';
import bannersRouter from './admin-banners.js';
import storeProductsRouter from './admin-store-products.js';
import franchisesRouter from './admin-franchises.js';
import corporateRouter from './admin-corporate.js';

const router = Router();

// 도메인별 어드민 서브라우터 (admin.ts에서 점진적으로 분리 중)
// 경로는 /api/admin 기준 동일하게 유지된다.
router.use(announcementsRouter);
router.use(tableLinkRouter);
router.use(statsRouter);
router.use(paymentsRouter);
router.use(alimtalkRouter);
router.use(storeOrdersRouter);
router.use(storesRouter);
router.use(bannersRouter);
router.use(storeProductsRouter);
router.use(franchisesRouter);
router.use(corporateRouter);

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

export default router;
