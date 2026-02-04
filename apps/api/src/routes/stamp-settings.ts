import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { validateRewardOptions } from '../utils/random-reward.js';

const router = Router();

// 태그히어 서버 연동 설정
const TAGHERE_CRM_BASE_URL = process.env.TAGHERE_CRM_BASE_URL || 'https://taghere-crm-web-dev.onrender.com';
const TAGHERE_API_BASE = process.env.TAGHERE_API_URL || 'https://api.d.tag-here.com';
const TAGHERE_WEBHOOK_URL = process.env.TAGHERE_WEBHOOK_URL || `${TAGHERE_API_BASE}/webhook/crm`;
const TAGHERE_WEBHOOK_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || process.env.TAGHERE_WEBHOOK_TOKEN || process.env.TAGHERE_DEV_API_TOKEN || '';

// 태그히어 서버에 CRM 활성화 알림 (스탬프/포인트 모드)
async function notifyTaghereCrmOn(userId: string, slug: string, isStampMode: boolean): Promise<void> {
  if (!TAGHERE_WEBHOOK_TOKEN) {
    console.log('[TagHere CRM] TAGHERE_WEBHOOK_TOKEN not configured, skipping notification');
    return;
  }

  const path = isStampMode ? 'taghere-enroll-stamp' : 'taghere-enroll';
  const redirectUrl = `${TAGHERE_CRM_BASE_URL}/${path}/${slug}?ordersheetId={ordersheetId}`;

  try {
    const response = await fetch(`${TAGHERE_WEBHOOK_URL}/on`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAGHERE_WEBHOOK_TOKEN}`,
      },
      body: JSON.stringify({ userId, redirectUrl }),
    });

    if (!response.ok) {
      console.error('[TagHere CRM] on failed:', response.status, await response.text());
    } else {
      console.log(`[TagHere CRM] on success - userId: ${userId}, isStampMode: ${isStampMode}, redirectUrl: ${redirectUrl}`);
    }
  } catch (error) {
    console.error('[TagHere CRM] on error:', error);
  }
}

// 인증 미들웨어 적용
router.use(authMiddleware);

// GET /api/stamp-settings - 스탬프 설정 조회
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let setting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });

    // 설정이 없으면 기본값으로 생성 (enabled: false)
    if (!setting) {
      setting = await prisma.stampSetting.create({
        data: {
          storeId,
          enabled: false,
          alimtalkEnabled: true,
        },
      });
    }

    res.json({
      enabled: setting.enabled,
      reward5Description: setting.reward5Description,
      reward10Description: setting.reward10Description,
      reward15Description: setting.reward15Description,
      reward20Description: setting.reward20Description,
      reward25Description: setting.reward25Description,
      reward30Description: setting.reward30Description,
      reward5Options: setting.reward5Options,
      reward10Options: setting.reward10Options,
      reward15Options: setting.reward15Options,
      reward20Options: setting.reward20Options,
      reward25Options: setting.reward25Options,
      reward30Options: setting.reward30Options,
      alimtalkEnabled: setting.alimtalkEnabled,
    });
  } catch (error) {
    console.error('Get stamp settings error:', error);
    res.status(500).json({ error: '스탬프 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/stamp-settings - 스탬프 설정 수정
router.put('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      enabled,
      reward5Description,
      reward10Description,
      reward15Description,
      reward20Description,
      reward25Description,
      reward30Description,
      reward5Options,
      reward10Options,
      reward15Options,
      reward20Options,
      reward25Options,
      reward30Options,
      alimtalkEnabled,
    } = req.body;

    // 랜덤 보상 옵션 유효성 검증
    const TIERS = [5, 10, 15, 20, 25, 30] as const;
    const optionsMap: Record<number, any> = {
      5: reward5Options, 10: reward10Options, 15: reward15Options,
      20: reward20Options, 25: reward25Options, 30: reward30Options,
    };
    for (const tier of TIERS) {
      const opts = optionsMap[tier];
      if (opts !== undefined && opts !== null && Array.isArray(opts) && opts.length > 0) {
        const validation = validateRewardOptions(opts);
        if (!validation.valid) {
          return res.status(400).json({ error: `${tier}개 보상: ${validation.error}` });
        }
      }
    }

    // 옵션에서 대표 설명 추출 (기존 rewardNDescription 호환)
    const deriveDescription = (options: any[] | null | undefined, fallbackDesc: string | undefined): string | null => {
      if (options && Array.isArray(options) && options.length > 0) {
        return options[0].description;
      }
      if (fallbackDesc !== undefined) return fallbackDesc || null;
      return undefined as any; // undefined면 업데이트 안함
    };

    // 각 tier별 description과 options 결정
    const buildTierData = (tier: number) => {
      const opts = optionsMap[tier];
      const descKey = `reward${tier}Description`;
      const optsKey = `reward${tier}Options`;
      const descValue = req.body[descKey];

      const result: Record<string, any> = {};

      if (opts !== undefined) {
        // 옵션이 명시적으로 전달된 경우
        const cleanOpts = (opts && Array.isArray(opts) && opts.length > 0) ? opts : null;
        result[optsKey] = cleanOpts;
        // 옵션에서 대표 설명 자동 생성
        result[descKey] = cleanOpts ? cleanOpts[0].description : (descValue !== undefined ? (descValue || null) : null);
      } else if (descValue !== undefined) {
        // 기존 방식: description만 전달된 경우
        result[descKey] = descValue || null;
      }

      return result;
    };

    // 기존 설정 조회 (enabled 변경 감지용)
    const existingSetting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });
    const wasEnabled = existingSetting?.enabled ?? false;

    // 각 tier 데이터 빌드
    const tierData: Record<string, any> = {};
    for (const tier of TIERS) {
      Object.assign(tierData, buildTierData(tier));
    }

    const setting = await prisma.stampSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        reward5Description: reward5Description || null,
        reward10Description: reward10Description || null,
        reward15Description: reward15Description || null,
        reward20Description: reward20Description || null,
        reward25Description: reward25Description || null,
        reward30Description: reward30Description || null,
        ...(reward5Options !== undefined && { reward5Options: reward5Options || null }),
        ...(reward10Options !== undefined && { reward10Options: reward10Options || null }),
        ...(reward15Options !== undefined && { reward15Options: reward15Options || null }),
        ...(reward20Options !== undefined && { reward20Options: reward20Options || null }),
        ...(reward25Options !== undefined && { reward25Options: reward25Options || null }),
        ...(reward30Options !== undefined && { reward30Options: reward30Options || null }),
        alimtalkEnabled: alimtalkEnabled ?? true,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(alimtalkEnabled !== undefined && { alimtalkEnabled }),
        ...tierData,
      },
    });

    // 스탬프 enabled 변경 시 태그히어 서버에 알림
    if (enabled !== undefined && enabled !== wasEnabled) {
      // 매장 정보 조회 (slug, owner email from StaffUser)
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: {
          slug: true,
          staffUsers: {
            where: { role: 'OWNER' },
            select: { email: true },
            take: 1,
          },
        },
      });

      const ownerEmail = store?.staffUsers?.[0]?.email;

      if (ownerEmail && store?.slug) {
        if (enabled) {
          // 스탬프 ON → 스탬프 적립 URL로 전환
          await notifyTaghereCrmOn(ownerEmail, store.slug, true);
          console.log(`[Stamp Settings] Stamp enabled for store ${storeId}, notified TagHere with stamp URL`);
        } else {
          // 스탬프 OFF → 포인트 적립 URL로 자동 전환
          await notifyTaghereCrmOn(ownerEmail, store.slug, false);
          console.log(`[Stamp Settings] Stamp disabled for store ${storeId}, notified TagHere with point URL`);
        }
      } else {
        console.log(`[Stamp Settings] Store ${storeId} missing owner email or slug, skipped TagHere notification`);
      }
    }

    res.json({
      enabled: setting.enabled,
      reward5Description: setting.reward5Description,
      reward10Description: setting.reward10Description,
      reward15Description: setting.reward15Description,
      reward20Description: setting.reward20Description,
      reward25Description: setting.reward25Description,
      reward30Description: setting.reward30Description,
      reward5Options: setting.reward5Options,
      reward10Options: setting.reward10Options,
      reward15Options: setting.reward15Options,
      reward20Options: setting.reward20Options,
      reward25Options: setting.reward25Options,
      reward30Options: setting.reward30Options,
      alimtalkEnabled: setting.alimtalkEnabled,
    });
  } catch (error) {
    console.error('Update stamp settings error:', error);
    res.status(500).json({ error: '스탬프 설정 수정 중 오류가 발생했습니다.' });
  }
});

export default router;
