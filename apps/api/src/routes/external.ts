import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware } from '../middleware/webhook-auth.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import { parseKoreanAddress } from '../utils/address-parser.js';

const router = Router();

// POST /api/external/register - 외부 등록 API
router.post('/register', webhookAuthMiddleware, async (req, res) => {
  try {
    const { email, storeName, ownerName, phone, category, businessRegNumber, address, source } = req.body;

    // 필수 필드 검증
    if (!email || !storeName || !ownerName || !phone || !source) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: '필수 필드를 입력해주세요. (email, storeName, ownerName, phone, source)',
      });
    }

    if (source !== 'v1' && source !== 'v2') {
      return res.status(400).json({
        success: false,
        error: 'Invalid source',
        message: 'source는 "v1" 또는 "v2"만 허용됩니다.',
      });
    }

    // 이메일 중복 체크
    const existingUser = await prisma.staffUser.findUnique({
      where: { email },
      include: { store: true },
    });

    if (existingUser) {
      console.log(`[External] Register skipped (exists) - source=${source}, email=${email}, storeId=${existingUser.storeId}`);
      return res.status(200).json({
        result: 'exists',
        storeId: existingUser.storeId,
        staffUserId: existingUser.id,
      });
    }

    // 사업자등록번호 중복 체크 (있는 경우만)
    if (businessRegNumber) {
      const existingStore = await prisma.store.findFirst({
        where: { businessRegNumber },
      });

      if (existingStore) {
        return res.status(400).json({
          success: false,
          error: 'Duplicate businessRegNumber',
          message: '이미 등록된 사업자등록번호입니다.',
        });
      }
    }

    // 비밀번호 해시 (기본 비밀번호)
    const passwordHash = await bcrypt.hash('123456789a', 10);

    // slug 생성
    const baseSlug = generateSlug(storeName);
    const slug = await getUniqueSlug(baseSlug);

    // 주소 자동 정규화
    const parsedAddress = address ? parseKoreanAddress(address) : null;

    // 트랜잭션으로 Store, Wallet, WaitingSetting, WaitingType, StaffUser 동시 생성
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: storeName,
          slug,
          ownerName,
          phone,
          category: category || null,
          businessRegNumber: businessRegNumber || null,
          address: address || null,
          addressSido: parsedAddress?.sido || null,
          addressSigungu: parsedAddress?.sigungu || null,
          addressDetail: parsedAddress?.detail || null,
        },
      });

      await tx.wallet.create({
        data: {
          storeId: store.id,
          balance: 500,
        },
      });

      await tx.waitingSetting.create({
        data: {
          storeId: store.id,
          operationStatus: 'ACCEPTING',
        },
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

      const user = await tx.staffUser.create({
        data: {
          storeId: store.id,
          email,
          passwordHash,
          name: ownerName,
          role: 'OWNER',
        },
      });

      return { storeId: store.id, staffUserId: user.id };
    });

    // notifyCrmOn() 호출하지 않음 — 기존 /api/auth/register와의 핵심 차이점

    console.log(`[External] Register created - source=${source}, email=${email}, storeId=${result.storeId}, staffUserId=${result.staffUserId}`);

    res.status(201).json({
      result: 'created',
      storeId: result.storeId,
      staffUserId: result.staffUserId,
    });
  } catch (error) {
    console.error('[External] Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: '외부 등록 중 오류가 발생했습니다.',
    });
  }
});

export default router;
