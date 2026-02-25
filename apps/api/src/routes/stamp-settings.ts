import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { validateRewards, buildRewardsFromLegacy, buildLegacyFromRewards, RewardEntry } from '../utils/random-reward.js';
import { notifyCrmOn } from '../services/taghere-api.js';

const router = Router();

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

    // rewards JSON이 있으면 그대로 반환, 없으면 레거시 컬럼에서 빌드
    const rewards: RewardEntry[] = setting.rewards
      ? (setting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(setting as any);

    res.json({
      enabled: setting.enabled,
      rewards,
      firstStampBonus: setting.firstStampBonus,
      alimtalkEnabled: setting.alimtalkEnabled,
      // 레거시 호환 필드 (기존 클라이언트용)
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
      rewards,
      firstStampBonus,
      alimtalkEnabled,
      // 레거시 필드 (기존 클라이언트 호환)
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
    } = req.body;

    // firstStampBonus만 단독 저장 요청인 경우
    if (firstStampBonus !== undefined && rewards === undefined && enabled === undefined && alimtalkEnabled === undefined) {
      const parsedBonus = Math.max(1, Math.min(10, Number(firstStampBonus) || 1));
      const setting = await prisma.stampSetting.upsert({
        where: { storeId },
        create: { storeId, firstStampBonus: parsedBonus },
        update: { firstStampBonus: parsedBonus },
      });
      return res.json({ firstStampBonus: setting.firstStampBonus });
    }

    // rewards JSON이 전달된 경우 (신규 클라이언트)
    if (rewards !== undefined) {
      if (rewards !== null && Array.isArray(rewards) && rewards.length > 0) {
        const validation = validateRewards(rewards);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      // 레거시 컬럼 동기화 (5/10/15/20/25/30)
      const rewardsArr = (rewards && Array.isArray(rewards)) ? rewards as RewardEntry[] : [];
      const legacyData = buildLegacyFromRewards(rewardsArr);

      // 기존 설정 조회 (enabled 변경 감지용)
      const existingSetting = await prisma.stampSetting.findUnique({
        where: { storeId },
      });
      const wasEnabled = existingSetting?.enabled ?? false;

      const parsedBonus = firstStampBonus !== undefined ? Math.max(1, Math.min(10, Number(firstStampBonus) || 1)) : undefined;

      const setting = await prisma.stampSetting.upsert({
        where: { storeId },
        create: {
          storeId,
          enabled: enabled ?? false,
          rewards: (rewardsArr.length > 0 ? rewardsArr : undefined) as any,
          firstStampBonus: parsedBonus ?? 1,
          alimtalkEnabled: alimtalkEnabled ?? true,
          ...legacyData,
        },
        update: {
          ...(enabled !== undefined && { enabled }),
          ...(alimtalkEnabled !== undefined && { alimtalkEnabled }),
          ...(parsedBonus !== undefined && { firstStampBonus: parsedBonus }),
          rewards: (rewardsArr.length > 0 ? rewardsArr : undefined) as any,
          ...legacyData,
        },
      });

      // 스탬프 enabled 변경 시 태그히어 서버에 알림
      if (enabled !== undefined && enabled !== wasEnabled) {
        await handleEnabledChange(storeId, enabled);
      }

      const responseRewards: RewardEntry[] = setting.rewards
        ? (setting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(setting as any);

      return res.json({
        enabled: setting.enabled,
        rewards: responseRewards,
        firstStampBonus: setting.firstStampBonus,
        alimtalkEnabled: setting.alimtalkEnabled,
      });
    }

    // 레거시 클라이언트 호환: reward5Options 등으로 전달된 경우
    const TIERS = [5, 10, 15, 20, 25, 30] as const;
    const optionsMap: Record<number, any> = {
      5: reward5Options, 10: reward10Options, 15: reward15Options,
      20: reward20Options, 25: reward25Options, 30: reward30Options,
    };

    // 각 tier별 description과 options 결정
    const buildTierData = (tier: number) => {
      const opts = optionsMap[tier];
      const descKey = `reward${tier}Description`;
      const optsKey = `reward${tier}Options`;
      const descValue = req.body[descKey];

      const result: Record<string, any> = {};

      if (opts !== undefined) {
        const cleanOpts = (opts && Array.isArray(opts) && opts.length > 0) ? opts : null;
        result[optsKey] = cleanOpts;
        result[descKey] = cleanOpts ? cleanOpts[0].description : (descValue !== undefined ? (descValue || null) : null);
      } else if (descValue !== undefined) {
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

    // 레거시 저장 후 rewards JSON도 동기화
    const builtRewards = buildRewardsFromLegacy(setting as any);
    if (builtRewards.length > 0) {
      await prisma.stampSetting.update({
        where: { storeId },
        data: { rewards: builtRewards as any },
      });
    }

    // 스탬프 enabled 변경 시 태그히어 서버에 알림
    if (enabled !== undefined && enabled !== wasEnabled) {
      await handleEnabledChange(storeId, enabled);
    }

    res.json({
      enabled: setting.enabled,
      rewards: builtRewards,
      firstStampBonus: setting.firstStampBonus,
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

async function handleEnabledChange(storeId: string, enabled: boolean) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      slug: true,
      name: true,
      taghereVersion: true,
      staffUsers: {
        where: { role: 'OWNER' },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (store?.slug) {
    await notifyCrmOn({
      version: store.taghereVersion,
      userId: store.staffUsers?.[0]?.email,
      storeName: store.name,
      slug: store.slug,
      isStampMode: enabled,
    });
    console.log(`[Stamp Settings] Stamp ${enabled ? 'enabled' : 'disabled'} for store ${storeId}, version: ${store.taghereVersion}`);
  }
}

export default router;
