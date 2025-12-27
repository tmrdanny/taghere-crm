import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const router = Router();

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

export default router;
