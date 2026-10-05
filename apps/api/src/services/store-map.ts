// 고객 마이페이지 — 태그히어 CRM 매장 지도 데이터
//
// 노출 조건: CRM 켬 + 지도 숨김 아님 + 좌표 있음 + 최근 60일 안에 활동이 하나라도 있음
//  - crmEnabled 는 기본값이 켜짐이고 자동 등록 때 따로 정하지 않아, 이 값만 보면 거의 모든 매장이 나온다
//  - 활동 = 신규 고객 가입 / 포인트 적립 / 스탬프 적립(통합 스탬프 포함) / 주문·방문 기록
//    (멤버십 모드 매장은 적립 장부를 남기지 않으므로 적립만 보면 전부 빠진다)
// 매장 전화번호는 사장님 개인 휴대폰일 수 있어 내보내지 않고, slug 는 적립 페이지 주소라 내보내지 않는다.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';
import { toSafeHttpsUrl } from '../utils/safe-url.js';

const ACTIVE_WITHIN_DAYS = 60;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface MapStore {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  enrollmentMode: string;
  pointRatePercent: number;
  naverPlaceUrl: string | null;
  stampRewards: { tier: number; description: string }[];
}

let cache: { at: number; stores: MapStore[] } | null = null;

export function clearStoreMapCache() {
  cache = null;
}

export async function getMapStores(): Promise<MapStore[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.stores;
  }

  const candidates = await prisma.store.findMany({
    where: {
      crmEnabled: true,
      hiddenFromMap: false,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      category: true,
      address: true,
      latitude: true,
      longitude: true,
      enrollmentMode: true,
      pointRatePercent: true,
      naverPlaceUrl: true,
      stampSetting: true,
    },
  });

  let activeIds = new Set<string>();
  if (candidates.length > 0) {
    const since = new Date(Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000);
    const ids = candidates.map((s) => s.id);
    // 후보 매장마다 "있는지 여부"만 확인 — 각 테이블의 (storeId[, type], 시각) 인덱스를 탄다
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM stores s
      WHERE s.id IN (${Prisma.join(ids)})
        AND (
          EXISTS (SELECT 1 FROM customers c WHERE c."storeId" = s.id AND c."createdAt" >= ${since})
          OR EXISTS (SELECT 1 FROM point_ledger p WHERE p."storeId" = s.id AND p.type = 'EARN' AND p."createdAt" >= ${since})
          OR EXISTS (SELECT 1 FROM visits_orders v WHERE v."storeId" = s.id AND v."visitedAt" >= ${since})
          OR EXISTS (SELECT 1 FROM stamp_ledger t WHERE t."storeId" = s.id AND t.type = 'EARN' AND t."createdAt" >= ${since})
          OR EXISTS (SELECT 1 FROM franchise_stamp_ledger f WHERE f."storeId" = s.id AND f.type = 'EARN' AND f."createdAt" >= ${since})
        )
    `;
    activeIds = new Set(rows.map((r) => r.id));
  }

  const stores: MapStore[] = candidates
    .filter((s) => activeIds.has(s.id))
    .map((s) => {
      const setting = s.stampSetting;
      const rewards: RewardEntry[] = setting?.enabled
        ? setting.rewards
          ? (setting.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(setting as unknown as Record<string, any>)
        : [];
      return {
        id: s.id,
        name: s.name,
        category: s.category,
        address: s.address,
        latitude: s.latitude!,
        longitude: s.longitude!,
        enrollmentMode: s.enrollmentMode,
        pointRatePercent: s.pointRatePercent,
        naverPlaceUrl: toSafeHttpsUrl(s.naverPlaceUrl),
        stampRewards: [...rewards]
          .sort((a, b) => a.tier - b.tier)
          .map((r) => ({ tier: r.tier, description: r.description })),
      };
    });

  cache = { at: Date.now(), stores };
  return stores;
}
