/**
 * 네이버 플레이스 부스터 - 지역 유틸
 *
 * - parseStoreRegion: 매장 주소 → (시도 줄임명, 시군구)
 * - expandRegions: 대상 지역 구성(매장 시군구 + 인접 구). 발송 시 시군구→인접→시/도 순으로 채움(selectRecipients)
 * - sidoAliases: 줄임/풀네임 시도명을 함께 매칭(서울/서울특별시 동일 취급)
 *
 * 시도명은 ExternalCustomer와 동일한 줄임 형식(서울/경기 ...)으로 정규화한다.
 * (normalize-customer-region-sido.ts의 매핑과 일치)
 */

import { SIGUNGU_ADJACENCY } from '../data/sigungu-adjacency.js';

export const SIDO_FULL_TO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  경기도: '경기',
  인천광역시: '인천',
  부산광역시: '부산',
  대구광역시: '대구',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

/**
 * 대상 지역(우선순위 계단식). 발송 대상은 sigungu(1순위) → adjacent(2순위) → 동일 시/도 나머지(3순위)
 * 순으로 perBatchCount를 채운다. sido는 줄임명(서울/경기 …)으로 저장하되, 조회 시 sidoAliases로
 * 풀네임(서울특별시 등)도 함께 매칭한다.
 */
export interface TargetRegion {
  sido: string;
  sigungu: string;
  adjacent: string[];
}

/** 줄임 시/도명 → 동일 시/도의 모든 표기(줄임+풀네임). DB에 '서울'/'서울특별시'가 혼재해도 같이 매칭. */
const SHORT_TO_SIDO_ALIASES: Record<string, string[]> = (() => {
  const map: Record<string, Set<string>> = {};
  for (const [full, short] of Object.entries(SIDO_FULL_TO_SHORT)) {
    if (!map[short]) map[short] = new Set([short]);
    map[short].add(full);
  }
  const out: Record<string, string[]> = {};
  for (const [short, set] of Object.entries(map)) out[short] = Array.from(set);
  return out;
})();

export function sidoAliases(sido: string): string[] {
  return SHORT_TO_SIDO_ALIASES[sido] ?? [sido];
}

/** 매장 주소에서 (시도 줄임명, 시군구) 추출. 파싱 불가 시 null */
export function parseStoreRegion(
  address?: string | null
): { sido: string; sigungu: string } | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/);
  if (tokens.length < 2) return null;

  const sido = SIDO_FULL_TO_SHORT[tokens[0]] || tokens[0];
  const sigungu = tokens[1];

  // 시군구는 구/시/군으로 끝나야 함 (도로명/지번 토큰 오인 방지)
  if (!sido || !/(구|시|군)$/.test(sigungu)) return null;
  return { sido, sigungu };
}

/**
 * 매장 시군구 + 인접 구를 대상 지역으로 구성.
 * 1순위=매장 시군구, 2순위=인접 구(데이터 없으면 빈 배열). 3순위(시/도 나머지)는 발송 시 자동 폴백.
 */
export function expandRegions(sido: string, sigungu: string): TargetRegion {
  const adjacent = SIGUNGU_ADJACENCY[`${sido} ${sigungu}`] ?? [];
  return { sido, sigungu, adjacent: Array.from(new Set(adjacent.filter((s) => s !== sigungu))) };
}
