import { env } from '../../config/env.js';
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { buildRewardsFromLegacy, RewardEntry } from '../../utils/random-reward.js';
import { haversineMeters } from '../../services/geocode.js';

const router = Router();

// ============================================================
// 스탬프 API
// ============================================================

// GET /api/taghere/stamp-info/:slug - 매장 스탬프 정보 조회 (공개 API)
router.get('/stamp-info/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        stampSetting: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        franchise: {
          select: {
            id: true,
            name: true,
            franchiseStampSetting: true,
          },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 프랜차이즈 통합 스탬프 모드
    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );

    if (isFranchiseStampMode) {
      const franchiseStampSetting = store.franchise!.franchiseStampSetting!;
      const rewards: RewardEntry[] = franchiseStampSetting.rewards
        ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(franchiseStampSetting as any);

      const legacyFields: Record<string, any> = {};
      for (const r of rewards) {
        legacyFields[`reward${r.tier}Description`] = r.description;
        legacyFields[`reward${r.tier}IsRandom`] = r.options && Array.isArray(r.options) && r.options.length > 1;
      }

      return res.json({
        storeId: store.id,
        storeName: store.name,
        franchiseName: store.franchise!.name,
        franchiseStampEnabled: true,
        enabled: true,
        // 링크 가드 기본 적용 (프랜차이즈 통합 스탬프 포함) — 클라는 !ordersheetId일 때 토큰 요구
        linkGuardEnabled: true,
        // 위치 기반 적립 확인 (매장별 토글, 기본 OFF) — 좌표가 있어야 실효
        locationGuardEnabled:
          !!store.stampSetting?.locationGuardEnabled && store.latitude != null && store.longitude != null,
        rewards,
        ...legacyFields,
      });
    }

    // 스탬프 설정이 없거나 비활성화된 경우
    if (!store.stampSetting?.enabled) {
      return res.status(400).json({
        error: '스탬프 기능이 비활성화되어 있습니다.',
        enabled: false,
      });
    }

    // rewards JSON 기반으로 보상 정보 반환
    const rewards: RewardEntry[] = store.stampSetting.rewards
      ? (store.stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);

    // 레거시 호환 필드도 함께 반환
    const legacyFields: Record<string, any> = {};
    for (const r of rewards) {
      legacyFields[`reward${r.tier}Description`] = r.description;
      legacyFields[`reward${r.tier}IsRandom`] = r.options && Array.isArray(r.options) && r.options.length > 1;
    }

    // 링크 스캔 토큰 가드 — standalone 링크에 기본 적용 (매번개수입력 매장만 제외).
    // ordersheetId 제외는 클라에서 `&& !ordersheetId`로 최종 판단.
    const linkGuardEnabled = !store.stampSetting.manualStampCountEnabled;

    res.json({
      storeId: store.id,
      storeName: store.name,
      enabled: true,
      manualStampCountEnabled: !!store.stampSetting.manualStampCountEnabled,
      linkGuardEnabled,
      // 위치 기반 적립 확인 (매장별 토글, 기본 OFF) — 좌표가 있어야 실효
      locationGuardEnabled:
        linkGuardEnabled && !!store.stampSetting.locationGuardEnabled && store.latitude != null && store.longitude != null,
      rewards,
      ...legacyFields,
    });
  } catch (error: any) {
    console.error('[TagHere] Stamp info error:', error);
    res.status(500).json({ error: '스탬프 정보 조회 중 오류가 발생했습니다.' });
  }
});

// 스탬프 링크 스캔 토큰 TTL (밀리초) — 스캔→카카오 로그인→적립 왕복 커버
const STAMP_SCAN_TOKEN_TTL_MS = 10 * 60 * 1000;

// GET /api/taghere/stamp-scan-entry/:slug/:secret - 토큰 발급 비밀 입구 (QR shortURL 목적지)
// 스캔 순간에만 새 1회용 토큰을 발급하고 적립 페이지로 302. 페이지/클라이언트는 토큰을 발급할 수 없다.
// secret 불일치·가드 미적용이면 토큰 없이 페이지로 보낸다(페이지에서 "QR 스캔" 안내).
router.get('/stamp-scan-entry/:slug/:secret', async (req, res) => {
  const { slug, secret } = req.params;
  const webUrl = env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com';
  const pageUrl = `${webUrl}/taghere-enroll-stamp/${encodeURIComponent(slug)}`;
  try {
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        franchise: { select: { franchiseStampSetting: { select: { id: true } } } },
        stampSetting: {
          select: { manualStampCountEnabled: true, enabled: true, scanEntrySecret: true },
        },
      },
    });

    if (!store || !store.stampSetting?.scanEntrySecret || store.stampSetting.scanEntrySecret !== secret) {
      // 매장 없음/secret 불일치(회전됨 포함) → 토큰 없이 페이지로 (적립 불가 안내)
      return res.redirect(pageUrl);
    }

    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );

    // 스탬프가 활성(개별 또는 프랜차이즈 통합)이고 매번개수입력이 아니면 토큰 발급
    const guardActive =
      (!!store.stampSetting.enabled || isFranchiseStampMode) &&
      !store.stampSetting.manualStampCountEnabled;

    if (!guardActive) {
      // 매번개수입력 등 가드 제외 매장 → 토큰 불요, 그냥 페이지로
      return res.redirect(pageUrl);
    }

    const expiresAt = new Date(Date.now() + STAMP_SCAN_TOKEN_TTL_MS);
    const created = await prisma.stampScanToken.create({
      data: { storeId: store.id, status: 'PENDING', expiresAt },
      select: { id: true },
    });

    return res.redirect(`${pageUrl}?t=${created.id}`);
  } catch (error: any) {
    console.error('[TagHere] Stamp scan entry error:', error);
    // 오류 시에도 고객이 빈 화면을 보지 않도록 페이지로
    return res.redirect(pageUrl);
  }
});

// POST /api/taghere/stamp-scan-verify-location - 스캔 토큰에 위치 검증 기록 (공개)
// 위치 기반 적립 확인(locationGuardEnabled) 매장에서 적립 전에 호출.
// 서버가 매장 좌표와의 거리를 계산해 토큰에 결과를 기록한다 (좌표는 OAuth state에 싣지 않음 → 위조 불가).
// 판정: 거리 - 오차 <= 반경 이면 통과 (확신할 때만 차단 — 실내 GPS 오차로 정상 손님이 튕기지 않게).
router.post('/stamp-scan-verify-location', async (req, res) => {
  try {
    const { t, lat, lng, accuracy } = req.body || {};
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const accNum = Math.max(0, Number(accuracy) || 0);

    if (!t || typeof t !== 'string' || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ success: false, error: 'missing_params' });
    }

    const token = await prisma.stampScanToken.findUnique({
      where: { id: t },
      select: { id: true, storeId: true, status: true, expiresAt: true },
    });
    if (!token || token.status !== 'PENDING' || token.expiresAt <= new Date()) {
      return res.status(400).json({ success: false, error: 'invalid_token' });
    }

    const store = await prisma.store.findUnique({
      where: { id: token.storeId },
      select: {
        latitude: true,
        longitude: true,
        stampSetting: { select: { locationGuardEnabled: true, locationGuardRadiusM: true } },
      },
    });
    if (!store) return res.status(404).json({ success: false, error: 'store_not_found' });

    // 가드 미적용/좌표 없음 → 검증 불요, 통과 처리
    if (!store.stampSetting?.locationGuardEnabled || store.latitude == null || store.longitude == null) {
      await prisma.stampScanToken.update({
        where: { id: token.id },
        data: { locationVerified: true, locationVerifiedAt: new Date() },
      });
      return res.json({ success: true, verified: true, skipped: true });
    }

    const distanceM = haversineMeters(latNum, lngNum, store.latitude, store.longitude);
    const radiusM = store.stampSetting.locationGuardRadiusM ?? 200;
    // 확신할 때만 차단: 보고된 오차를 감안해도 반경 밖일 때만 거부
    const verified = distanceM - accNum <= radiusM;

    await prisma.stampScanToken.update({
      where: { id: token.id },
      data: {
        locationVerified: verified,
        locationDistanceM: Math.round(distanceM),
        locationAccuracyM: Math.round(accNum),
        locationVerifiedAt: new Date(),
      },
    });

    console.log(
      `[TagHere Location] token=${token.id} distance=${Math.round(distanceM)}m accuracy=${Math.round(accNum)}m radius=${radiusM}m → ${verified ? 'PASS' : 'BLOCK'}`,
    );

    if (!verified) {
      return res.json({ success: false, verified: false, error: 'too_far', distanceM: Math.round(distanceM) });
    }
    return res.json({ success: true, verified: true });
  } catch (error: any) {
    console.error('[TagHere] Location verify error:', error);
    res.status(500).json({ success: false, error: 'verify_failed' });
  }
});

export default router;
