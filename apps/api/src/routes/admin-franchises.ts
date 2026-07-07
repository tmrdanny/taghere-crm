import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { logoUpload } from './admin-uploads.js';
import { AdminRequest, adminAuthMiddleware, ADMIN_PASSWORD_HASH } from './admin-shared.js';

const router = Router();

// GET /api/admin/franchises - 전체 프랜차이즈 목록 조회
router.get('/franchises', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const franchises = await prisma.franchise.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        priceEarnAlimtalk: true,
        priceMarketingAlimtalk: true,
        priceSms: true,
        priceWaitingAlimtalk: true,
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
        priceEarnAlimtalk: true,
        priceMarketingAlimtalk: true,
        priceSms: true,
        priceWaitingAlimtalk: true,
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
    const {
      name, logoUrl, ownerName, ownerEmail, ownerPhone, ownerPassword,
      priceEarnAlimtalk, priceMarketingAlimtalk, priceSms, priceWaitingAlimtalk,
    } = req.body;

    // 단가 필드 정규화: 숫자면 반영, null/'' 이면 기본단가로 리셋(null), 그 외 무시
    const normalizePrice = (v: any): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
    };

    // 1. 프랜차이즈 기본 정보 업데이트
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    const pEarn = normalizePrice(priceEarnAlimtalk);
    const pMkt = normalizePrice(priceMarketingAlimtalk);
    const pSms = normalizePrice(priceSms);
    const pWait = normalizePrice(priceWaitingAlimtalk);
    if (pEarn !== undefined) updateData.priceEarnAlimtalk = pEarn;
    if (pMkt !== undefined) updateData.priceMarketingAlimtalk = pMkt;
    if (pSms !== undefined) updateData.priceSms = pSms;
    if (pWait !== undefined) updateData.priceWaitingAlimtalk = pWait;

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

export default router;
