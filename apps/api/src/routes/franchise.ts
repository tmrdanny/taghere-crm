import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { maskName, maskPhone } from '../utils/masking.js';

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
    const [recentOrders, totalPoints] = await Promise.all([
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
    ]);

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
        customerCount: store._count.customers,
        totalOrders: store._count.visitsOrOrders,
        recentOrders,
        totalPointsEarned: totalPoints._sum.delta || 0,
        walletBalance: store.wallet?.balance || 0,
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
    const { page = '1', limit = '20', search } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // 프랜차이즈 소속 매장 ID 목록
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true },
    });

    const storeIds = stores.map((s) => s.id);

    if (storeIds.length === 0) {
      return res.json({ customers: [], total: 0, page: pageNum, limit: limitNum });
    }

    // 검색 조건
    const whereCondition: any = {
      storeId: { in: storeIds },
    };

    if (search) {
      whereCondition.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
      ];
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
          visitCount: true,
          totalPoints: true,
          lastVisitAt: true,
          createdAt: true,
          storeId: true,
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

    // 마스킹 적용
    const maskedCustomers = customers.map((customer) => ({
      id: customer.id,
      name: maskName(customer.name || ''),
      phone: maskPhone(customer.phone || ''),
      gender: customer.gender,
      ageGroup: customer.ageGroup,
      visitCount: customer.visitCount,
      totalPoints: customer.totalPoints,
      lastVisitAt: customer.lastVisitAt,
      createdAt: customer.createdAt,
      store: customer.store,
    }));

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

    res.json({
      totalStores: stores.length,
      totalCustomers,
      totalCampaigns,
      totalOrders,
      recentOrders,
      totalPointsEarned: totalPointsResult._sum.delta || 0,
      averageCustomersPerStore: stores.length > 0 ? Math.round(totalCustomers / stores.length) : 0,
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

    // 총 주문금액 계산
    const totalOrderAmount = customer.visitsOrOrders.reduce((sum, order) => {
      return sum + (order.totalAmount || 0);
    }, 0);

    // 민감 정보 마스킹
    const maskedCustomer = {
      id: customer.id,
      name: maskName(customer.name),
      phone: maskPhone(customer.phone),
      totalPoints: customer.totalPoints,
      gender: customer.gender,
      birthday: customer.birthday,
      birthYear: customer.birthYear,
      visitCount: customer.visitCount,
      lastVisitAt: customer.lastVisitAt,
      createdAt: customer.createdAt,
      totalOrderAmount,
      store: customer.store,
      visitsOrOrders: customer.visitsOrOrders,
      feedbacks: customer.feedbacks,
      pointLedger: customer.pointLedger,
    };

    res.json({ customer: maskedCustomer });
  } catch (error: any) {
    console.error('Failed to fetch customer detail:', error);
    res.status(500).json({ error: '고객 조회에 실패했습니다.' });
  }
});

export default router;
