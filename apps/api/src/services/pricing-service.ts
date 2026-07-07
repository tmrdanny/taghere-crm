import { prisma } from '../lib/prisma.js';

/**
 * 메시지 단가 결정 서비스.
 *
 * 매장이 프랜차이즈 소속이고 해당 프랜차이즈에 단가 오버라이드가 설정되어 있으면
 * 그 값을 사용하고, 없으면 호출부가 넘긴 기본 단가(baseCost)를 그대로 사용한다.
 */

// 프랜차이즈 오버라이드가 없을 때의 기본 단가 (참고용 상수)
export const DEFAULT_PRICES = {
  earnAlimtalk: 20,       // 적립 알림톡 (포인트/스탬프 적립·사용)
  marketingAlimtalk: 50,  // 마케팅 알림톡 (리뷰요청/리타겟/자동화/부스터 등)
  sms: 50,                // 문자 (SMS/LMS)
  waitingAlimtalk: 20,    // 웨이팅 알림톡
} as const;

export type PriceCategory = 'earnAlimtalk' | 'marketingAlimtalk' | 'sms' | 'waitingAlimtalk';

// 카테고리 → 프랜차이즈 오버라이드 컬럼명
const OVERRIDE_FIELD: Record<PriceCategory, string> = {
  earnAlimtalk: 'priceEarnAlimtalk',
  marketingAlimtalk: 'priceMarketingAlimtalk',
  sms: 'priceSms',
  waitingAlimtalk: 'priceWaitingAlimtalk',
};

// 적립(기본) 알림톡으로 취급하는 메시지 타입
const EARN_ALIMTALK_TYPES = new Set(['POINTS_EARNED', 'POINTS_USED', 'STAMP_EARNED']);
// 웨이팅 알림톡으로 취급하는 메시지 타입
const WAITING_ALIMTALK_TYPES = new Set([
  'WAITING_REGISTERED',
  'WAITING_CALLED',
  'WAITING_CANCELLED',
]);

/**
 * 알림톡 메시지 타입 → 단가 카테고리.
 * 적립/웨이팅에 해당하지 않으면 마케팅으로 분류.
 */
export function alimtalkCategory(messageType: string): PriceCategory {
  if (EARN_ALIMTALK_TYPES.has(messageType)) return 'earnAlimtalk';
  if (WAITING_ALIMTALK_TYPES.has(messageType)) return 'waitingAlimtalk';
  return 'marketingAlimtalk';
}

/**
 * 매장의 프랜차이즈 단가 오버라이드 조회 (없으면 null).
 */
async function getFranchiseOverride(
  storeId: string,
  category: PriceCategory,
): Promise<number | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      franchise: {
        select: {
          priceEarnAlimtalk: true,
          priceMarketingAlimtalk: true,
          priceSms: true,
          priceWaitingAlimtalk: true,
        },
      },
    },
  });
  const franchise = store?.franchise;
  if (!franchise) return null;
  const value = (franchise as Record<string, number | null>)[OVERRIDE_FIELD[category]];
  return typeof value === 'number' ? value : null;
}

/**
 * 특정 카테고리의 단가 결정. 프랜차이즈 오버라이드 우선, 없으면 baseCost.
 */
export async function resolvePrice(
  storeId: string,
  category: PriceCategory,
  baseCost: number,
): Promise<number> {
  const override = await getFranchiseOverride(storeId, category);
  return override ?? baseCost;
}

/**
 * 알림톡 단가 결정. 메시지 타입으로 카테고리를 판별한 뒤 오버라이드/기본값 적용.
 */
export async function resolveAlimtalkCost(
  storeId: string,
  messageType: string,
  baseCost: number,
): Promise<number> {
  return resolvePrice(storeId, alimtalkCategory(messageType), baseCost);
}
