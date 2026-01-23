import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 태그히어 서버 연동 설정
const TAGHERE_CRM_BASE_URL = process.env.TAGHERE_CRM_BASE_URL || 'https://taghere-crm-web-dev.onrender.com';
const TAGHERE_WEBHOOK_URL = process.env.TAGHERE_WEBHOOK_URL || 'https://api.d.tag-here.com/webhook/crm';
const TAGHERE_WEBHOOK_TOKEN = process.env.TAGHERE_WEBHOOK_TOKEN || process.env.TAGHERE_DEV_API_TOKEN || '';

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
      alimtalkEnabled,
    } = req.body;

    // 기존 설정 조회 (enabled 변경 감지용)
    const existingSetting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });
    const wasEnabled = existingSetting?.enabled ?? false;

    const setting = await prisma.stampSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        reward5Description: reward5Description || null,
        reward10Description: reward10Description || null,
        alimtalkEnabled: alimtalkEnabled ?? true,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(reward5Description !== undefined && { reward5Description: reward5Description || null }),
        ...(reward10Description !== undefined && { reward10Description: reward10Description || null }),
        ...(alimtalkEnabled !== undefined && { alimtalkEnabled }),
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
      alimtalkEnabled: setting.alimtalkEnabled,
    });
  } catch (error) {
    console.error('Update stamp settings error:', error);
    res.status(500).json({ error: '스탬프 설정 수정 중 오류가 발생했습니다.' });
  }
});

export default router;
