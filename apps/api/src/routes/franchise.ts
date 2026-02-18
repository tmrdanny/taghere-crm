import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { maskName, maskPhone } from '../utils/masking.js';
import {
  RewardEntry,
  buildRewardsFromLegacy,
  buildLegacyFromRewards,
  checkMilestoneAndDraw,
  validateRewards,
} from '../utils/random-reward.js';

const router = Router();

// 토스페이먼츠 시크릿 키
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';

// 금액에 따른 보너스율 계산
const getBonusRate = (amount: number): number => {
  if (amount >= 1000000) return 7;
  if (amount >= 500000) return 5;
  if (amount >= 200000) return 4;
  if (amount >= 100000) return 3;
  return 0;
};

// 보너스 포함 충전 금액 계산
const getChargeAmountWithBonus = (amount: number): number => {
  const bonusRate = getBonusRate(amount);
  return Math.floor(amount * (1 + bonusRate / 100));
};

// 모든 라우트에 인증 미들웨어 적용
router.use(franchiseAuthMiddleware);

// ============================================
// 가맹점 관련
// ============================================

// GET /api/franchise/stores - 가맹점 목록
router.get('/stores', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        ownerName: true,
        phone: true,
        address: true,
        franchiseStampEnabled: true,
        createdAt: true,
        _count: {
          select: {
            customers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        slug: store.slug,
        category: store.category,
        ownerName: store.ownerName,
        phone: store.phone,
        address: store.address,
        franchiseStampEnabled: store.franchiseStampEnabled,
        customerCount: store._count.customers,
        createdAt: store.createdAt,
      })),
      total: stores.length,
    });
  } catch (error) {
    console.error('Get franchise stores error:', error);
    res.status(500).json({ error: '가맹점 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/stores/:id - 가맹점 상세
router.get('/stores/:id', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { id } = req.params;

    const store = await prisma.store.findFirst({
      where: {
        id,
        franchiseId,
      },
      include: {
        _count: {
          select: {
            customers: true,
            visitsOrOrders: true,
          },
        },
        wallet: {
          select: { balance: true },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });
    }

    // 통계 데이터
    const [recentOrders, totalPoints, revisitCustomers, avgVisitsResult] = await Promise.all([
      prisma.visitOrOrder.count({
        where: {
          storeId: id,
          visitedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 최근 30일
          },
        },
      }),
      prisma.pointLedger.aggregate({
        where: {
          storeId: id,
          type: 'EARN',
        },
        _sum: { delta: true },
      }),
      // 재방문 고객 수 (방문 2회 이상)
      prisma.customer.count({
        where: {
          storeId: id,
          visitCount: { gte: 2 },
        },
      }),
      // 평균 방문 횟수
      prisma.customer.aggregate({
        where: { storeId: id },
        _avg: { visitCount: true },
      }),
    ]);

    // 재방문율 계산
    const totalCustomers = store._count.customers;
    const revisitRate = totalCustomers > 0
      ? (revisitCustomers / totalCustomers) * 100
      : 0;

    // 평균 방문 횟수
    const averageVisits = avgVisitsResult._avg.visitCount || 0;

    res.json({
      id: store.id,
      name: store.name,
      slug: store.slug,
      category: store.category,
      ownerName: store.ownerName,
      phone: store.phone,
      address: store.address,
      createdAt: store.createdAt,
      stats: {
        customerCount: totalCustomers,
        totalOrders: store._count.visitsOrOrders,
        recentOrders,
        totalPointsEarned: totalPoints._sum.delta || 0,
        walletBalance: store.wallet?.balance || 0,
        revisitRate,
        averageVisits,
      },
    });
  } catch (error) {
    console.error('Get franchise store detail error:', error);
    res.status(500).json({ error: '가맹점 상세 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/stores/connect - 기존 CRM 계정과 가맹점 연동
router.post('/stores/connect', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    // 기존 CRM 사용자 찾기
    const staffUser = await prisma.staffUser.findUnique({
      where: { email },
      include: { store: true },
    });

    if (!staffUser) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 비밀번호 확인
    const isValidPassword = await bcrypt.compare(password, staffUser.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 이미 다른 프랜차이즈에 연동되어 있는지 확인
    if (staffUser.store.franchiseId && staffUser.store.franchiseId !== franchiseId) {
      return res.status(400).json({ error: '이미 다른 프랜차이즈에 연동된 매장입니다.' });
    }

    // 이미 해당 프랜차이즈에 연동되어 있는 경우
    if (staffUser.store.franchiseId === franchiseId) {
      return res.status(400).json({ error: '이미 연동된 매장입니다.' });
    }

    // 가맹점 연동
    const updatedStore = await prisma.store.update({
      where: { id: staffUser.storeId },
      data: { franchiseId },
    });

    res.json({
      message: '가맹점 연동이 완료되었습니다.',
      store: {
        id: updatedStore.id,
        name: updatedStore.name,
        slug: updatedStore.slug,
        category: updatedStore.category,
        ownerName: updatedStore.ownerName,
        address: updatedStore.address,
      },
    });
  } catch (error) {
    console.error('Connect store error:', error);
    res.status(500).json({ error: '가맹점 연동 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 고객 관련 (통합)
// ============================================

// GET /api/franchise/customers - 통합 고객 목록 (마스킹 적용)
router.get('/customers', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { page = '1', limit = '50', search, storeId, gender, visitCount, lastVisit, startDate, endDate, dateType } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100); // 최대 100개로 제한
    const skip = (pageNum - 1) * limitNum;

    console.log('[Franchise Customers] Query params:', { page, limit, storeId, gender, visitCount, lastVisit });

    // 프랜차이즈 소속 매장 ID 목록
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });

    const storeIds = stores.map((s) => s.id);

    if (storeIds.length === 0) {
      return res.json({ customers: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 });
    }

    // 검색 조건 - 특정 가맹점 필터가 있으면 해당 매장만, 없으면 전체 매장
    const whereCondition: any = {};

    // 특정 가맹점 필터
    if (storeId && storeId !== 'all' && storeIds.includes(storeId as string)) {
      whereCondition.storeId = storeId as string;
      console.log('[Franchise Customers] Filtering by specific storeId:', storeId);
    } else {
      whereCondition.storeId = { in: storeIds };
      console.log('[Franchise Customers] Filtering by all stores:', storeIds.length, 'stores');
    }

    if (search) {
      whereCondition.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
      ];
    }

    // 성별 필터
    if (gender && gender !== 'all') {
      whereCondition.gender = gender;
    }

    // 방문 횟수 필터
    if (visitCount && visitCount !== 'all') {
      const count = parseInt(visitCount as string, 10);
      whereCondition.visitCount = { gte: count };
    }

    // 최근 방문 필터
    if (lastVisit && lastVisit !== 'all') {
      const days = parseInt(lastVisit as string, 10);
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      whereCondition.lastVisitAt = { gte: daysAgo };
    }

    // 날짜 범위 필터
    if (startDate || endDate) {
      const dateField = dateType === 'created' ? 'createdAt' : 'lastVisitAt';
      whereCondition[dateField] = {};

      if (startDate) {
        whereCondition[dateField].gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        whereCondition[dateField].lte = end;
      }
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          ageGroup: true,
          birthYear: true,
          birthday: true,
          visitCount: true,
          totalPoints: true,
          totalStamps: true,
          lastVisitAt: true,
          createdAt: true,
          storeId: true,
          kakaoId: true,
          naverId: true,
          visitSource: true,
          store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.customer.count({ where: whereCondition }),
    ]);

    // Get last table label for each customer from 3 sources:
    // 1. VisitOrOrder.items.tableNumber
    // 2. PointLedger.tableLabel
    // 3. StampLedger.tableLabel
    // Use the most recent value across all sources
    const customerIds = customers.map((c) => c.id);

    // 1. VisitOrOrder에서 조회
    const lastVisitOrders = await prisma.visitOrOrder.findMany({
      where: {
        customerId: { in: customerIds },
      },
      orderBy: { visitedAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        items: true,
        visitedAt: true,
      },
    });

    // 2. PointLedger에서 tableLabel 조회
    const pointTableLabels = await prisma.pointLedger.findMany({
      where: {
        customerId: { in: customerIds },
        tableLabel: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        tableLabel: true,
        createdAt: true,
      },
    });

    // 3. StampLedger에서 tableLabel 조회
    const stampTableLabels = await prisma.stampLedger.findMany({
      where: {
        customerId: { in: customerIds },
        tableLabel: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        tableLabel: true,
        createdAt: true,
      },
    });

    // 4. 병합 (가장 최근 값 사용)
    const tableLabelsMap = new Map<string, string>();
    const timestampMap = new Map<string, Date>();

    // VisitOrOrder에서 먼저 처리
    for (const visit of lastVisitOrders) {
      const items = visit.items as { tableNumber?: string } | null;
      if (items?.tableNumber) {
        tableLabelsMap.set(visit.customerId, items.tableNumber);
        timestampMap.set(visit.customerId, visit.visitedAt);
      }
    }

    // PointLedger 처리 (더 최근 값이면 덮어쓰기)
    for (const entry of pointTableLabels) {
      if (entry.tableLabel) {
        const existing = timestampMap.get(entry.customerId);
        if (!existing || entry.createdAt > existing) {
          tableLabelsMap.set(entry.customerId, entry.tableLabel);
          timestampMap.set(entry.customerId, entry.createdAt);
        }
      }
    }

    // StampLedger 처리 (더 최근 값이면 덮어쓰기)
    for (const entry of stampTableLabels) {
      if (entry.tableLabel) {
        const existing = timestampMap.get(entry.customerId);
        if (!existing || entry.createdAt > existing) {
          tableLabelsMap.set(entry.customerId, entry.tableLabel);
          timestampMap.set(entry.customerId, entry.createdAt);
        }
      }
    }

    // birthYear로부터 ageGroup 계산하는 헬퍼 함수
    const calculateAgeGroup = (birthYear: number | null): string | null => {
      if (!birthYear) return null;
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;

      if (age >= 20 && age < 30) return 'TWENTIES';
      if (age >= 30 && age < 40) return 'THIRTIES';
      if (age >= 40 && age < 50) return 'FORTIES';
      if (age >= 50 && age < 60) return 'FIFTIES';
      if (age >= 60) return 'SIXTY_PLUS';
      return null;
    };

    // 마스킹 적용 및 ageGroup 계산
    const maskedCustomers = customers.map((customer) => {
      // ageGroup이 없으면 birthYear로부터 계산
      const ageGroup = customer.ageGroup || calculateAgeGroup(customer.birthYear);

      // 직접 등록 고객 (kakaoId, naverId 모두 null)은 이름 마스킹 해제
      const isManuallyRegistered = !customer.kakaoId && !customer.naverId;

      return {
        id: customer.id,
        name: isManuallyRegistered ? (customer.name || '') : maskName(customer.name || ''),
        phone: maskPhone(customer.phone || ''),
        gender: customer.gender,
        ageGroup,
        birthYear: customer.birthYear,
        birthday: customer.birthday,
        visitCount: customer.visitCount,
        totalPoints: customer.totalPoints,
        totalStamps: customer.totalStamps,
        lastVisitAt: customer.lastVisitAt,
        createdAt: customer.createdAt,
        store: customer.store,
        visitSource: customer.visitSource || null,
        lastTableLabel: tableLabelsMap.get(customer.id) || null,
      };
    });

    res.json({
      customers: maskedCustomers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Get franchise customers error:', error);
    res.status(500).json({ error: '고객 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/visit-source-settings - 프랜차이즈 소속 매장들의 방문 경로 설정 통합 조회
router.get('/visit-source-settings', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    // 프랜차이즈 소속 매장 ID 목록
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });

    const storeIds = stores.map((s) => s.id);

    if (storeIds.length === 0) {
      return res.json({ options: [] });
    }

    // 모든 매장의 방문 경로 설정 조회
    const visitSourceSettings = await prisma.visitSourceSetting.findMany({
      where: { storeId: { in: storeIds } },
      select: { options: true },
    });

    // 모든 옵션을 병합하고 중복 제거 (id 기준)
    const allOptions: Array<{ id: string; label: string }> = [];
    const seenIds = new Set<string>();

    for (const setting of visitSourceSettings) {
      const options = setting.options as Array<{ id: string; label: string }> | null;
      if (options && Array.isArray(options)) {
        for (const opt of options) {
          if (!seenIds.has(opt.id)) {
            seenIds.add(opt.id);
            allOptions.push(opt);
          }
        }
      }
    }

    res.json({ options: allOptions });
  } catch (error) {
    console.error('Get franchise visit source settings error:', error);
    res.status(500).json({ error: '방문 경로 설정 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/customers/count - 세그먼트별 고객 수
router.get('/customers/count', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    // 프랜차이즈 소속 매장 ID 목록
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });

    const storeIds = stores.map((s) => s.id);

    if (storeIds.length === 0) {
      return res.json({
        total: 0,
        segments: {
          all: 0,
          new: 0,
          regular: 0,
          vip: 0,
          dormant: 0,
        },
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [total, newCustomers, regular, vip, dormant] = await Promise.all([
      // 전체 고객
      prisma.customer.count({
        where: { storeId: { in: storeIds } },
      }),
      // 신규 고객 (30일 이내 가입)
      prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // 단골 고객 (방문 5회 이상)
      prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          visitCount: { gte: 5 },
        },
      }),
      // VIP 고객 (방문 10회 이상)
      prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          visitCount: { gte: 10 },
        },
      }),
      // 휴면 고객 (90일 이상 미방문)
      prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          lastVisitAt: { lt: ninetyDaysAgo },
        },
      }),
    ]);

    res.json({
      total,
      segments: {
        all: total,
        new: newCustomers,
        regular,
        vip,
        dormant,
      },
    });
  } catch (error) {
    console.error('Get customer count error:', error);
    res.status(500).json({ error: '고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 분석
// ============================================

// GET /api/franchise/analytics/overview - 개요 통계
router.get('/analytics/overview', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    // 프랜차이즈 소속 매장 ID 목록
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });

    const storeIds = stores.map((s) => s.id);

    if (storeIds.length === 0) {
      return res.json({
        totalStores: 0,
        totalCustomers: 0,
        totalCampaigns: 0,
        totalOrders: 0,
        recentOrders: 0,
        totalPointsEarned: 0,
        averageCustomersPerStore: 0,
      });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      totalCampaigns,
      totalOrders,
      recentOrders,
      totalPointsResult,
    ] = await Promise.all([
      prisma.customer.count({
        where: { storeId: { in: storeIds } },
      }),
      prisma.smsCampaign.count({
        where: { storeId: { in: storeIds } },
      }),
      prisma.visitOrOrder.count({
        where: { storeId: { in: storeIds } },
      }),
      prisma.visitOrOrder.count({
        where: {
          storeId: { in: storeIds },
          visitedAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.pointLedger.aggregate({
        where: {
          storeId: { in: storeIds },
          type: 'EARN',
        },
        _sum: { delta: true },
      }),
    ]);

    // 지갑 잔액 조회
    const wallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
      select: { balance: true },
    });

    res.json({
      totalStores: stores.length,
      totalCustomers,
      totalCampaigns,
      totalOrders,
      recentOrders,
      totalPointsEarned: totalPointsResult._sum.delta || 0,
      averageCustomersPerStore: stores.length > 0 ? Math.round(totalCustomers / stores.length) : 0,
      walletBalance: wallet?.balance || 0,
    });
  } catch (error) {
    console.error('Get analytics overview error:', error);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 지갑
// ============================================

// GET /api/franchise/wallet - 잔액 조회
router.get('/wallet', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const wallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
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
    console.error('Get franchise wallet error:', error);
    res.status(500).json({ error: '지갑 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/payments/confirm - 토스페이먼츠 결제 승인
router.post('/payments/confirm', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { paymentKey, orderId, amount } = req.body;

    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });
    }

    // 프랜차이즈 지갑 확인
    const wallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
    });

    if (!wallet) {
      return res.status(400).json({ error: '지갑을 찾을 수 없습니다.' });
    }

    // 이미 처리된 결제인지 확인
    const existingTransaction = await prisma.franchiseTransaction.findFirst({
      where: {
        walletId: wallet.id,
        meta: {
          string_contains: `"paymentKey":"${paymentKey}"`,
        },
      },
    });

    if (existingTransaction) {
      return res.json({
        success: true,
        amount: existingTransaction.amount,
        newBalance: wallet.balance,
        paymentKey,
        orderId,
        alreadyProcessed: true,
      });
    }

    // 토스페이먼츠 결제 승인 API 호출
    const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');

    const confirmResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    const confirmData = await confirmResponse.json() as {
      status?: string;
      code?: string;
      message?: string;
      totalAmount?: number;
      method?: string;
      card?: {
        company?: string;
        number?: string;
      };
    };

    // 결제 승인 실패 처리
    if (!confirmResponse.ok) {
      console.error('TossPayments confirm error:', confirmData);
      return res.status(400).json({
        error: confirmData.message || '결제 승인에 실패했습니다.',
        code: confirmData.code,
      });
    }

    // 결제 성공 - 지갑에 충전금 추가 (보너스 포함)
    const chargeAmount = getChargeAmountWithBonus(amount);
    const bonusRate = getBonusRate(amount);
    const bonusAmount = chargeAmount - amount;

    // 트랜잭션으로 지갑 업데이트 및 트랜잭션 기록
    const updatedWallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseWallet.update({
        where: { franchiseId },
        data: {
          balance: { increment: chargeAmount },
        },
      });

      await tx.franchiseTransaction.create({
        data: {
          walletId: wallet.id,
          amount: chargeAmount,
          type: 'TOPUP',
          description: `충전 ${amount.toLocaleString()}원 + 보너스 ${bonusAmount.toLocaleString()}원`,
          meta: {
            source: 'tosspayments',
            paymentKey,
            orderId,
            paidAmount: amount,
            chargedAmount: chargeAmount,
            bonusRate,
            bonusAmount,
            method: confirmData.method,
            card: confirmData.card,
          },
        },
      });

      return updated;
    });

    res.json({
      success: true,
      amount: chargeAmount,
      newBalance: updatedWallet.balance,
      paymentKey,
      orderId,
    });
  } catch (error) {
    console.error('Franchise payment confirm error:', error);
    res.status(500).json({ error: '결제 처리 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/customers/:customerId - 고객 상세 조회 (읽기 전용)
router.get('/customers/:customerId', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const { customerId } = req.params;
    const franchiseId = req.franchiseUser!.franchiseId;

    // 프랜차이즈 소속 매장 확인
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });
    const storeIds = stores.map(s => s.id);

    if (storeIds.length === 0) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 고객이 프랜차이즈 소속 매장의 고객인지 확인
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        storeId: { in: storeIds },
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
        visitsOrOrders: {
          orderBy: {
            visitedAt: 'desc',
          },
          take: 50,
        },
        feedbacks: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        pointLedger: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // visitsOrOrders의 items 정규화
    const normalizedVisitsOrOrders = (customer.visitsOrOrders || []).map((visit) => {
      let normalizedItems: any[] = [];
      let tableNumber: string | null = null;

      // items 필드의 구조에 따라 처리
      const itemsData = visit.items as any;
      if (itemsData) {
        if (Array.isArray(itemsData)) {
          // 기존 형식: 배열 직접
          normalizedItems = itemsData.map((item: any) => ({
            id: item.id || undefined,
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        } else if (typeof itemsData === 'object') {
          // 새로운 형식: { items: [], tableNumber: string }
          tableNumber = itemsData.tableNumber || null;
          const rawItems = itemsData.items || [];
          normalizedItems = rawItems.map((item: any) => ({
            id: item.id || undefined,
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        }
      }

      return {
        id: visit.id,
        visitedAt: visit.visitedAt,
        totalAmount: visit.totalAmount,
        tableNumber,
        orderItems: normalizedItems,
      };
    });

    // 총 주문금액 계산
    const totalOrderAmount = normalizedVisitsOrOrders.reduce((sum, order) => {
      return sum + (order.totalAmount || 0);
    }, 0);

    // birthYear로부터 ageGroup 계산하는 헬퍼 함수
    const calculateAgeGroup = (birthYear: number | null): string | null => {
      if (!birthYear) return null;
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;

      if (age >= 20 && age < 30) return 'TWENTIES';
      if (age >= 30 && age < 40) return 'THIRTIES';
      if (age >= 40 && age < 50) return 'FORTIES';
      if (age >= 50 && age < 60) return 'FIFTIES';
      if (age >= 60) return 'SIXTY_PLUS';
      return null;
    };

    // ageGroup 계산 (없으면 birthYear로부터 계산)
    const ageGroup = customer.ageGroup || calculateAgeGroup(customer.birthYear);

    // 직접 등록 고객 (kakaoId, naverId 모두 null)은 이름 마스킹 해제
    const isManuallyRegistered = !customer.kakaoId && !customer.naverId;

    // 민감 정보 마스킹
    const maskedCustomer = {
      id: customer.id,
      name: isManuallyRegistered ? customer.name : maskName(customer.name),
      phone: maskPhone(customer.phone),
      totalPoints: customer.totalPoints,
      gender: customer.gender,
      ageGroup,
      birthday: customer.birthday,
      birthYear: customer.birthYear,
      visitCount: customer.visitCount,
      lastVisitAt: customer.lastVisitAt,
      createdAt: customer.createdAt,
      totalOrderAmount,
      store: customer.store,
      visitsOrOrders: normalizedVisitsOrOrders,
      feedbacks: customer.feedbacks || [],
      pointLedger: customer.pointLedger || [],
    };

    res.json({ customer: maskedCustomer });
  } catch (error: any) {
    console.error('Failed to fetch customer detail:', error);
    res.status(500).json({ error: '고객 조회에 실패했습니다.' });
  }
});

// ============================================
// 인사이트 관련
// ============================================

// GET /api/franchise/insights - 프랜차이즈 인사이트 데이터
router.get('/insights', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { period = '30days', startDate: startDateParam, endDate: endDateParam } = req.query;

    console.log('[Franchise Insights] franchiseId:', franchiseId, 'period:', period, 'startDate:', startDateParam, 'endDate:', endDateParam);

    // 1. 프랜차이즈의 모든 가맹점 조회
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true, name: true }
    });
    const storeIds = stores.map(s => s.id);

    console.log('[Franchise Insights] Found stores:', storeIds.length);

    if (storeIds.length === 0) {
      return res.json({
        ageDistribution: [],
        genderDistribution: { male: 0, female: 0, total: 0 },
        retention: { day7: 0, day30: 0 },
        monthlyTrend: [],
        topStores: [],
        visitSourceDistribution: []
      });
    }

    // 2. 기간 계산 (startDate/endDate 파라미터가 있으면 우선 사용)
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && typeof startDateParam === 'string') {
      // startDate 파라미터가 있으면 직접 사용
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);

      if (endDateParam && typeof endDateParam === 'string') {
        endDate = new Date(endDateParam);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      // 기존 period 로직
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
        case 'all':
        default:
          startDate = new Date(0); // 전체 기간
          break;
      }
    }

    // 3. 연령대별 고객 분포
    const allCustomers = await prisma.customer.findMany({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: startDate, lte: endDate }
      },
      select: { ageGroup: true, birthYear: true, gender: true, id: true }
    });

    const totalCustomers = allCustomers.length;
    console.log('[Franchise Insights] Total customers:', totalCustomers);

    // birthYear로부터 ageGroup 계산하는 헬퍼 함수
    const calculateAgeGroup = (birthYear: number | null): string | null => {
      if (!birthYear) return null;
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;

      if (age >= 20 && age < 30) return 'TWENTIES';
      if (age >= 30 && age < 40) return 'THIRTIES';
      if (age >= 40 && age < 50) return 'FORTIES';
      if (age >= 50 && age < 60) return 'FIFTIES';
      if (age >= 60) return 'SIXTY_PLUS';
      return null;
    };

    // 연령대 집계 (ageGroup이 없으면 birthYear로부터 계산)
    const ageMap = new Map<string, number>();
    let customersWithoutAgeGroup = 0;
    allCustomers.forEach(c => {
      const ageGroup = c.ageGroup || calculateAgeGroup(c.birthYear);
      if (ageGroup) {
        ageMap.set(ageGroup, (ageMap.get(ageGroup) || 0) + 1);
      } else {
        customersWithoutAgeGroup++;
      }
    });
    console.log('[Franchise Insights] Customers without ageGroup:', customersWithoutAgeGroup, '/', totalCustomers);

    const ageDistribution = Array.from(ageMap.entries()).map(([ageGroup, count]) => {
      let ageLabel = '';
      switch (ageGroup) {
        case 'TWENTIES': ageLabel = '20대'; break;
        case 'THIRTIES': ageLabel = '30대'; break;
        case 'FORTIES': ageLabel = '40대'; break;
        case 'FIFTIES': ageLabel = '50대'; break;
        case 'SIXTY_PLUS': ageLabel = '60대 이상'; break;
      }
      return {
        age: ageLabel,
        count,
        percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0
      };
    }).filter(item => item.age !== '') // 빈 라벨 제외
      .sort((a, b) => {
        const order = { '20대': 1, '30대': 2, '40대': 3, '50대': 4, '60대 이상': 5 };
        return (order[a.age as keyof typeof order] || 999) - (order[b.age as keyof typeof order] || 999);
      });

    console.log('[Franchise Insights] Age distribution length:', ageDistribution.length);

    // 4. 성별 분포
    let maleCount = 0;
    let femaleCount = 0;
    allCustomers.forEach(c => {
      if (c.gender === 'MALE') maleCount++;
      else if (c.gender === 'FEMALE') femaleCount++;
    });

    const genderDistribution = {
      male: maleCount,
      female: femaleCount,
      total: maleCount + femaleCount
    };

    // 5. 재방문율 계산
    // 재방문율 정의: 전체 고객 중 2회 이상 방문한 고객의 비율
    // 7일 재방문율: 최근 7일 내 방문한 고객 중 해당 기간에 2회 이상 방문한 고객 비율
    // 30일 재방문율: 최근 30일 내 방문한 고객 중 해당 기간에 2회 이상 방문한 고객 비율

    const date7DaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 7일 재방문율: 최근 7일 내 방문 기록이 있는 고유 고객 수와 그 중 2회 이상 방문한 고객 수
    const visits7Days = await prisma.visitOrOrder.groupBy({
      by: ['customerId'],
      where: {
        storeId: { in: storeIds },
        visitedAt: { gte: date7DaysAgo }
      },
      _count: { id: true }
    });

    const totalCustomers7Days = visits7Days.length; // 최근 7일 내 방문한 고유 고객 수
    const revisitCustomers7Days = visits7Days.filter(v => v._count.id >= 2).length; // 2회 이상 방문한 고객 수

    const retention7Days = totalCustomers7Days > 0
      ? Math.round((revisitCustomers7Days / totalCustomers7Days) * 100)
      : 0;

    // 30일 재방문율: 최근 30일 내 방문 기록이 있는 고유 고객 수와 그 중 2회 이상 방문한 고객 수
    const visits30Days = await prisma.visitOrOrder.groupBy({
      by: ['customerId'],
      where: {
        storeId: { in: storeIds },
        visitedAt: { gte: date30DaysAgo }
      },
      _count: { id: true }
    });

    const totalCustomers30Days = visits30Days.length; // 최근 30일 내 방문한 고유 고객 수
    const revisitCustomers30Days = visits30Days.filter(v => v._count.id >= 2).length; // 2회 이상 방문한 고객 수

    const retention30Days = totalCustomers30Days > 0
      ? Math.round((revisitCustomers30Days / totalCustomers30Days) * 100)
      : 0;

    console.log('[Franchise Insights] Retention - 7days:', retention7Days, '% (', revisitCustomers7Days, '/', totalCustomers7Days, '), 30days:', retention30Days, '% (', revisitCustomers30Days, '/', totalCustomers30Days, ')');

    // 6. 월별 고객 추이 (최근 6개월)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const customerCount = await prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          createdAt: {
            gte: monthStart,
            lte: monthEnd
          }
        }
      });

      const monthName = `${monthStart.getMonth() + 1}월`;
      monthlyTrend.push({
        month: monthName,
        customers: customerCount
      });
    }

    // 7. 가맹점별 고객 수 Top 5
    const storeStats = await Promise.all(
      stores.map(async (store) => {
        const customerCount = await prisma.customer.count({
          where: {
            storeId: store.id,
            createdAt: { gte: startDate }
          }
        });

        return {
          name: store.name,
          customers: customerCount
        };
      })
    );

    const topStores = storeStats
      .sort((a, b) => b.customers - a.customers)
      .slice(0, 5);

    // 8. 방문경로별 통계
    const visitSourceLabels: Record<string, string> = {
      revisit: '단순 재방문',
      friend: '지인 추천',
      naver: '네이버',
      youtube: '유튜브',
      daangn: '당근',
      instagram: '인스타그램',
      sms: '문자',
      kakao: '카카오톡',
      passby: '지나가다'
    };

    // visitSource가 있는 고객만 집계
    const visitSourceMap = new Map<string, number>();
    let totalWithVisitSource = 0;

    allCustomers.forEach(c => {
      const customer = c as any;
      if (customer.visitSource) {
        totalWithVisitSource++;
        visitSourceMap.set(customer.visitSource, (visitSourceMap.get(customer.visitSource) || 0) + 1);
      }
    });

    // visitSource 필드를 가져오기 위해 다시 쿼리 (allCustomers에는 visitSource가 없음)
    const customersWithVisitSource = await prisma.customer.findMany({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: startDate, lte: endDate },
        visitSource: { not: null }
      },
      select: { visitSource: true }
    });

    visitSourceMap.clear();
    totalWithVisitSource = customersWithVisitSource.length;

    customersWithVisitSource.forEach(c => {
      if (c.visitSource) {
        visitSourceMap.set(c.visitSource, (visitSourceMap.get(c.visitSource) || 0) + 1);
      }
    });

    const visitSourceDistribution = Array.from(visitSourceMap.entries())
      .map(([source, count]) => ({
        source,
        label: visitSourceLabels[source] || source,
        count,
        percentage: totalWithVisitSource > 0 ? Math.round((count / totalWithVisitSource) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    console.log('[Franchise Insights] Monthly trend length:', monthlyTrend.length);
    console.log('[Franchise Insights] Top stores:', topStores.length);
    console.log('[Franchise Insights] Visit source distribution:', visitSourceDistribution.length);

    // 응답 반환
    res.json({
      ageDistribution,
      genderDistribution,
      retention: {
        day7: retention7Days,
        day30: retention30Days
      },
      monthlyTrend,
      topStores,
      visitSourceDistribution
    });

  } catch (error) {
    console.error('Franchise insights error:', error);
    res.status(500).json({ error: '인사이트 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 고객 피드백 관련
// ============================================

// GET /api/franchise/feedbacks - 프랜차이즈 고객 피드백 조회
router.get('/feedbacks', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const {
      limit = '20',
      offset = '0',
      storeId,      // 매장 필터 (선택)
      rating,       // 별점 필터 (선택)
      hasText       // 텍스트 유무 (선택)
    } = req.query;

    // 1. 프랜차이즈 소속 매장 ID 목록 조회
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true, name: true }
    });
    const storeIds = stores.map(s => s.id);

    if (storeIds.length === 0) {
      return res.json({ feedbacks: [], total: 0, hasMore: false, stores: [] });
    }

    // 2. 필터 조건 구성
    const where: any = {
      customer: {
        storeId: storeId ? (storeId as string) : { in: storeIds }
      }
    };

    if (rating) {
      where.rating = parseInt(rating as string);
    }

    if (hasText === 'true') {
      where.text = { not: null };
      where.NOT = { text: '' };
    }

    // 3. 총 개수 조회
    const total = await prisma.customerFeedback.count({ where });

    // 4. 피드백 조회
    const feedbacks = await prisma.customerFeedback.findMany({
      where,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            store: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    // 5. 응답 (개인정보 마스킹)
    res.json({
      feedbacks: feedbacks.map(f => ({
        id: f.id,
        rating: f.rating,
        text: f.text,
        createdAt: f.createdAt.toISOString(),
        customerName: maskName(f.customer.name),
        customerPhone: f.customer.phone ? maskPhone(f.customer.phone) : null,
        storeName: f.customer.store.name,
        storeId: f.customer.store.id
      })),
      total,
      hasMore: feedbacks.length === parseInt(limit as string),
      stores: stores.map(s => ({ id: s.id, name: s.name }))
    });
  } catch (error) {
    console.error('Failed to fetch franchise feedbacks:', error);
    res.status(500).json({ error: '피드백 조회에 실패했습니다.' });
  }
});

// POST /api/franchise/stores/:storeId/transfer - 가맹점으로 충전금 이체
router.post('/stores/:storeId/transfer', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;
    const { amount, memo } = req.body;

    // 1. 이체 금액 검증
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: '이체 금액이 올바르지 않습니다.' });
    }

    // 2. 가맹점이 해당 프랜차이즈 소속인지 확인
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        franchiseId,
      },
      include: {
        wallet: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });
    }

    // 3. 프랜차이즈 지갑 확인 및 잔액 검증
    const franchiseWallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId },
    });

    if (!franchiseWallet) {
      return res.status(400).json({ error: '프랜차이즈 지갑이 없습니다.' });
    }

    if (franchiseWallet.balance < amount) {
      return res.status(400).json({ error: '잔액이 부족합니다.' });
    }

    // 4. 트랜잭션으로 이체 처리
    const result = await prisma.$transaction(async (tx) => {
      // 4-1. 프랜차이즈 지갑에서 차감
      const updatedFranchiseWallet = await tx.franchiseWallet.update({
        where: { franchiseId },
        data: {
          balance: { decrement: amount },
        },
      });

      // 4-2. 프랜차이즈 트랜잭션 기록 (DEDUCT - 차감)
      await tx.franchiseTransaction.create({
        data: {
          walletId: franchiseWallet.id,
          amount: -amount,
          type: 'DEDUCT',
          description: `${store.name}으로 충전금 이체${memo ? ` (${memo})` : ''}`,
          meta: {
            targetStoreId: storeId,
            targetStoreName: store.name,
            memo: memo || null,
          },
        },
      });

      // 4-3. 가맹점 지갑 생성 또는 업데이트
      let storeWallet = store.wallet;
      if (!storeWallet) {
        storeWallet = await tx.wallet.create({
          data: {
            storeId,
            balance: amount,
          },
        });
      } else {
        storeWallet = await tx.wallet.update({
          where: { storeId },
          data: {
            balance: { increment: amount },
          },
        });
      }

      // 4-4. 가맹점 결제 트랜잭션 기록 (TOPUP)
      await tx.paymentTransaction.create({
        data: {
          storeId,
          amount,
          type: 'TOPUP',
          status: 'SUCCESS',
          meta: {
            source: 'franchise_transfer',
            franchiseId,
            memo: memo || null,
            description: `프랜차이즈 본사로부터 충전금 이체${memo ? ` (${memo})` : ''}`,
          },
        },
      });

      return {
        franchiseNewBalance: updatedFranchiseWallet.balance,
        storeNewBalance: storeWallet.balance,
      };
    });

    res.json({
      success: true,
      transferAmount: amount,
      franchiseNewBalance: result.franchiseNewBalance,
      storeNewBalance: result.storeNewBalance,
    });
  } catch (error) {
    console.error('Transfer to store error:', error);
    res.status(500).json({ error: '충전금 이체 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/feedbacks/summary - 프랜차이즈 피드백 통계
router.get('/feedbacks/summary', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true }
    });
    const storeIds = stores.map(s => s.id);

    if (storeIds.length === 0) {
      return res.json({ totalCount: 0, averageRating: 0 });
    }

    const feedbacks = await prisma.customerFeedback.findMany({
      where: {
        customer: {
          storeId: { in: storeIds }
        }
      },
      select: { rating: true }
    });

    const totalCount = feedbacks.length;
    const averageRating = totalCount > 0
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalCount
      : 0;

    res.json({
      totalCount,
      averageRating: Math.round(averageRating * 10) / 10 // 소수점 1자리
    });
  } catch (error) {
    console.error('Failed to fetch feedback summary:', error);
    res.status(500).json({ error: '피드백 통계 조회에 실패했습니다.' });
  }
});

// ============================================
// 통합 스탬프/포인트 시스템
// ============================================

// PUT /api/franchise/stores/:storeId/stamp-toggle - 매장별 통합 스탬프 ON/OFF 토글
router.put('/stores/:storeId/stamp-toggle', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    // 매장이 해당 프랜차이즈 소속인지 확인
    const store = await prisma.store.findFirst({
      where: { id: storeId, franchiseId },
    });

    if (!store) {
      return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });
    }

    // 토글
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { franchiseStampEnabled: !store.franchiseStampEnabled },
    });

    // ON 시: FranchiseStampSetting이 없으면 자동 생성
    if (updated.franchiseStampEnabled) {
      await prisma.franchiseStampSetting.upsert({
        where: { franchiseId },
        update: {},
        create: { franchiseId },
      });
    }

    res.json({
      storeId,
      franchiseStampEnabled: updated.franchiseStampEnabled,
    });
  } catch (error) {
    console.error('Toggle franchise stamp error:', error);
    res.status(500).json({ error: '통합 스탬프 토글 중 오류가 발생했습니다.' });
  }
});

// PUT /api/franchise/stores/stamp-toggle-all - 전체 매장 일괄 ON/OFF 토글
router.put('/stores/stamp-toggle-all', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled 값이 필요합니다.' });
    }

    const result = await prisma.store.updateMany({
      where: { franchiseId },
      data: { franchiseStampEnabled: enabled },
    });

    // ON 시: FranchiseStampSetting이 없으면 자동 생성
    if (enabled) {
      await prisma.franchiseStampSetting.upsert({
        where: { franchiseId },
        update: {},
        create: { franchiseId },
      });
    }

    res.json({
      updatedCount: result.count,
      franchiseStampEnabled: enabled,
    });
  } catch (error) {
    console.error('Toggle all franchise stamp error:', error);
    res.status(500).json({ error: '전체 매장 통합 스탬프 토글 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/stamp-setting - 프랜차이즈 보상 설정 조회
router.get('/stamp-setting', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const setting = await prisma.franchiseStampSetting.findUnique({
      where: { franchiseId },
    });

    if (!setting) {
      return res.json({ setting: null });
    }

    // rewards JSON이 있으면 그대로, 없으면 레거시에서 빌드
    const rewards: RewardEntry[] = setting.rewards
      ? (setting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(setting as any);

    res.json({
      setting: {
        id: setting.id,
        franchiseId: setting.franchiseId,
        enabled: setting.enabled,
        rewards,
        alimtalkEnabled: setting.alimtalkEnabled,
        selfClaimEnabled: setting.selfClaimEnabled,
      },
    });
  } catch (error) {
    console.error('Get franchise stamp setting error:', error);
    res.status(500).json({ error: '보상 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/franchise/stamp-setting - 프랜차이즈 보상 설정 수정
router.put('/stamp-setting', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { rewards, alimtalkEnabled, selfClaimEnabled } = req.body;

    // rewards 유효성 검증
    if (rewards) {
      const validation = validateRewards(rewards);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    // 레거시 컬럼 동기화
    const legacyData = rewards ? buildLegacyFromRewards(rewards) : {};

    const setting = await prisma.franchiseStampSetting.upsert({
      where: { franchiseId },
      update: {
        rewards: rewards ? (rewards as any) : undefined,
        alimtalkEnabled: alimtalkEnabled !== undefined ? alimtalkEnabled : undefined,
        selfClaimEnabled: selfClaimEnabled !== undefined ? selfClaimEnabled : undefined,
        ...legacyData,
      },
      create: {
        franchiseId,
        rewards: rewards ? (rewards as any) : undefined,
        alimtalkEnabled: alimtalkEnabled !== undefined ? alimtalkEnabled : true,
        selfClaimEnabled: selfClaimEnabled !== undefined ? selfClaimEnabled : false,
        ...legacyData,
      },
    });

    const resultRewards: RewardEntry[] = setting.rewards
      ? (setting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(setting as any);

    res.json({
      setting: {
        id: setting.id,
        franchiseId: setting.franchiseId,
        enabled: setting.enabled,
        rewards: resultRewards,
        alimtalkEnabled: setting.alimtalkEnabled,
        selfClaimEnabled: setting.selfClaimEnabled,
      },
    });
  } catch (error) {
    console.error('Update franchise stamp setting error:', error);
    res.status(500).json({ error: '보상 설정 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/stamps/earn - 통합 스탬프 적립
router.post('/stamps/earn', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId, kakaoId, phone, name } = req.body;

    if (!storeId || !kakaoId) {
      return res.status(400).json({ error: 'storeId와 kakaoId가 필요합니다.' });
    }

    // 매장이 해당 프랜차이즈 소속이며 통합 스탬프 ON인지 확인
    const store = await prisma.store.findFirst({
      where: { id: storeId, franchiseId, franchiseStampEnabled: true },
    });

    if (!store) {
      return res.status(400).json({ error: '통합 스탬프가 활성화된 가맹점이 아닙니다.' });
    }

    // 보상 설정 조회
    const stampSetting = await prisma.franchiseStampSetting.findUnique({
      where: { franchiseId },
    });

    if (!stampSetting) {
      return res.status(400).json({ error: '보상 설정이 없습니다.' });
    }

    // FranchiseCustomer upsert
    let franchiseCustomer = await prisma.franchiseCustomer.findUnique({
      where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
    });

    if (!franchiseCustomer) {
      franchiseCustomer = await prisma.franchiseCustomer.create({
        data: { franchiseId, kakaoId, phone, name },
      });
    }

    // 1일 1회 제한 체크
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const alreadyEarned = await prisma.franchiseStampLedger.findFirst({
      where: {
        franchiseCustomerId: franchiseCustomer.id,
        storeId,
        type: 'EARN',
        createdAt: { gte: todayStart },
      },
    });

    if (alreadyEarned) {
      return res.status(400).json({
        error: 'already_earned_today',
        currentStamps: franchiseCustomer.totalStamps,
      });
    }

    // 트랜잭션: 스탬프 +1, 레저 생성
    const previousStamps = franchiseCustomer.totalStamps;
    const newBalance = previousStamps + 1;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseCustomer.update({
        where: { id: franchiseCustomer!.id },
        data: {
          totalStamps: newBalance,
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          phone: phone || undefined,
          name: name || undefined,
        },
      });

      const ledger = await tx.franchiseStampLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId: franchiseCustomer!.id,
          storeId,
          type: 'EARN',
          delta: 1,
          balance: newBalance,
          earnMethod: 'NFC_TAG',
        },
      });

      // 마일스톤 체크
      const milestoneResult = checkMilestoneAndDraw(previousStamps, newBalance, stampSetting as any);
      if (milestoneResult) {
        await tx.franchiseStampLedger.update({
          where: { id: ledger.id },
          data: {
            drawnReward: milestoneResult.reward,
            drawnRewardTier: milestoneResult.tier,
          },
        });
      }

      return { customer: updated, ledger, milestoneResult };
    });

    res.json({
      success: true,
      currentStamps: result.customer.totalStamps,
      drawnReward: result.milestoneResult?.reward || null,
      drawnRewardTier: result.milestoneResult?.tier || null,
    });
  } catch (error) {
    console.error('Franchise stamp earn error:', error);
    res.status(500).json({ error: '통합 스탬프 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/stamps/use - 통합 스탬프 사용
router.post('/stamps/use', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { franchiseCustomerId, tier, storeId } = req.body;

    if (!franchiseCustomerId || !tier || !storeId) {
      return res.status(400).json({ error: 'franchiseCustomerId, tier, storeId가 필요합니다.' });
    }

    const customer = await prisma.franchiseCustomer.findFirst({
      where: { id: franchiseCustomerId, franchiseId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    if (customer.totalStamps < tier) {
      return res.status(400).json({ error: '스탬프가 부족합니다.' });
    }

    const newBalance = customer.totalStamps - tier;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseCustomer.update({
        where: { id: franchiseCustomerId },
        data: { totalStamps: newBalance },
      });

      await tx.franchiseStampLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId,
          storeId,
          type: 'USE',
          delta: -tier,
          balance: newBalance,
          reason: `${tier}개 보상 사용`,
        },
      });

      return updated;
    });

    res.json({
      success: true,
      currentStamps: result.totalStamps,
    });
  } catch (error) {
    console.error('Franchise stamp use error:', error);
    res.status(500).json({ error: '통합 스탬프 사용 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/points/earn - 통합 포인트 적립
router.post('/points/earn', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId, kakaoId, amount, reason, phone, name } = req.body;

    if (!storeId || !kakaoId || !amount) {
      return res.status(400).json({ error: 'storeId, kakaoId, amount가 필요합니다.' });
    }

    // 매장 확인
    const store = await prisma.store.findFirst({
      where: { id: storeId, franchiseId, franchiseStampEnabled: true },
    });

    if (!store) {
      return res.status(400).json({ error: '통합 스탬프가 활성화된 가맹점이 아닙니다.' });
    }

    // FranchiseCustomer upsert
    let customer = await prisma.franchiseCustomer.findUnique({
      where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
    });

    if (!customer) {
      customer = await prisma.franchiseCustomer.create({
        data: { franchiseId, kakaoId, phone, name },
      });
    }

    const newBalance = customer.totalPoints + amount;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseCustomer.update({
        where: { id: customer!.id },
        data: {
          totalPoints: newBalance,
          phone: phone || undefined,
          name: name || undefined,
        },
      });

      await tx.franchisePointLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId: customer!.id,
          storeId,
          delta: amount,
          balance: newBalance,
          type: 'EARN',
          reason: reason || '포인트 적립',
        },
      });

      return updated;
    });

    res.json({
      success: true,
      currentPoints: result.totalPoints,
    });
  } catch (error) {
    console.error('Franchise point earn error:', error);
    res.status(500).json({ error: '통합 포인트 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/points/use - 통합 포인트 사용
router.post('/points/use', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { franchiseCustomerId, amount, storeId, reason } = req.body;

    if (!franchiseCustomerId || !amount || !storeId) {
      return res.status(400).json({ error: 'franchiseCustomerId, amount, storeId가 필요합니다.' });
    }

    const customer = await prisma.franchiseCustomer.findFirst({
      where: { id: franchiseCustomerId, franchiseId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    if (customer.totalPoints < amount) {
      return res.status(400).json({ error: '포인트가 부족합니다.' });
    }

    const newBalance = customer.totalPoints - amount;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseCustomer.update({
        where: { id: franchiseCustomerId },
        data: { totalPoints: newBalance },
      });

      await tx.franchisePointLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId,
          storeId,
          delta: -amount,
          balance: newBalance,
          type: 'USE',
          reason: reason || '포인트 사용',
        },
      });

      return updated;
    });

    res.json({
      success: true,
      currentPoints: result.totalPoints,
    });
  } catch (error) {
    console.error('Franchise point use error:', error);
    res.status(500).json({ error: '통합 포인트 사용 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/franchise-customers - 프랜차이즈 통합 고객 목록
router.get('/franchise-customers', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { page = '1', limit = '50', search } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { franchiseId };

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
        { kakaoId: { contains: search as string } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.franchiseCustomer.findMany({
        where,
        orderBy: { lastVisitAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          stampLedger: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              store: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.franchiseCustomer.count({ where }),
    ]);

    res.json({
      customers: customers.map((c) => ({
        id: c.id,
        kakaoId: c.kakaoId,
        name: c.name ? maskName(c.name) : null,
        phone: c.phone ? maskPhone(c.phone) : null,
        totalStamps: c.totalStamps,
        totalPoints: c.totalPoints,
        visitCount: c.visitCount,
        lastVisitAt: c.lastVisitAt,
        lastStore: c.stampLedger[0]?.store || null,
        createdAt: c.createdAt,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Get franchise customers error:', error);
    res.status(500).json({ error: '통합 고객 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/franchise-customers/:kakaoId - 프랜차이즈 고객 조회 (kakaoId 기준)
router.get('/franchise-customers/:kakaoId', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { kakaoId } = req.params;

    const customer = await prisma.franchiseCustomer.findUnique({
      where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
      include: {
        stampLedger: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            store: { select: { id: true, name: true } },
          },
        },
        pointLedger: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            store: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    res.json({
      customer: {
        id: customer.id,
        kakaoId: customer.kakaoId,
        name: customer.name ? maskName(customer.name) : null,
        phone: customer.phone ? maskPhone(customer.phone) : null,
        totalStamps: customer.totalStamps,
        totalPoints: customer.totalPoints,
        visitCount: customer.visitCount,
        lastVisitAt: customer.lastVisitAt,
        createdAt: customer.createdAt,
        stampLedger: customer.stampLedger,
        pointLedger: customer.pointLedger,
      },
    });
  } catch (error) {
    console.error('Get franchise customer error:', error);
    res.status(500).json({ error: '고객 조회 중 오류가 발생했습니다.' });
  }
});

// ─── 보상 수령 신청 관리 ───

// GET /api/franchise/reward-claims — 보상 신청 목록 조회
router.get('/reward-claims', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { franchiseId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [claims, total] = await Promise.all([
      prisma.rewardClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.rewardClaim.count({ where }),
    ]);

    res.json({
      claims,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Get reward claims error:', error);
    res.status(500).json({ error: '보상 신청 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/reward-claims/pending-count — PENDING 건수
router.get('/reward-claims/pending-count', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const count = await prisma.rewardClaim.count({
      where: { franchiseId, status: 'PENDING' },
    });
    res.json({ count });
  } catch (error) {
    console.error('Get pending reward claims count error:', error);
    res.status(500).json({ error: '건수 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/franchise/reward-claims/:id — 상태 변경
router.put('/reward-claims/:id', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['COMPLETED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status는 COMPLETED 또는 REJECTED만 가능합니다.' });
    }

    const claim = await prisma.rewardClaim.findFirst({
      where: { id, franchiseId },
    });

    if (!claim) {
      return res.status(404).json({ error: '보상 신청을 찾을 수 없습니다.' });
    }

    if (claim.status !== 'PENDING') {
      return res.status(400).json({ error: '이미 처리된 신청입니다.' });
    }

    // REJECTED인 경우 스탬프 복원
    if (status === 'REJECTED') {
      await prisma.$transaction(async (tx) => {
        // 스탬프 복원
        await tx.franchiseCustomer.update({
          where: { id: claim.franchiseCustomerId },
          data: { totalStamps: { increment: claim.tier } },
        });

        // 복원 레저 기록
        const customer = await tx.franchiseCustomer.findUnique({
          where: { id: claim.franchiseCustomerId },
        });

        const firstStore = await tx.store.findFirst({
          where: { franchiseId },
          select: { id: true },
        });

        await tx.franchiseStampLedger.create({
          data: {
            franchiseId,
            franchiseCustomerId: claim.franchiseCustomerId,
            storeId: firstStore!.id,
            type: 'ADMIN_ADD',
            delta: claim.tier,
            balance: customer!.totalStamps,
            reason: `보상 신청 거절 복원 (${claim.rewardDescription})`,
          },
        });

        // 신청 상태 변경
        await tx.rewardClaim.update({
          where: { id },
          data: { status: 'REJECTED', processedAt: new Date() },
        });
      });
    } else {
      // COMPLETED
      await prisma.rewardClaim.update({
        where: { id },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update reward claim error:', error);
    res.status(500).json({ error: '보상 신청 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
