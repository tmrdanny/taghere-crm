/**
 * 네이버 플레이스 정보 조회 (매장 정보 확인용)
 *
 * 입력 URL(전체/단축 naver.me) → placeId 추출 → m.place.naver.com 모바일 페이지의
 * window.__APOLLO_STATE__ 에서 상호/주소/업종을 파싱한다.
 *
 * ⚠️ 네이버 비공식 내부 구조에 의존 → 구조 변경 시 파싱 실패할 수 있으므로
 *    호출부는 실패를 사용자 안내로 폴백 처리한다.
 */

import { parseNaverPlaceId } from '../utils/naver-place.js';
import { BoosterError } from './place-booster-service.js';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

export interface NaverPlaceInfo {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
}

/** naver.me 등 단축/리다이렉트 URL을 따라가 최종 URL에서 placeId 추출 */
async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': MOBILE_UA },
    });
    // 최종 도착 URL에서 추출
    const fromFinal = parseNaverPlaceId(res.url);
    if (fromFinal) return fromFinal;
    // 본문(메타 리프레시/링크)에서 추출 시도
    const text = await res.text();
    const m = text.match(/place[/:](\d{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** window.__APOLLO_STATE__ JSON을 중괄호 매칭으로 안전 추출 */
function extractApolloState(html: string): Record<string, any> | null {
  const marker = '__APOLLO_STATE__';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf('{', html.indexOf('=', i));
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function pickPlaceBase(state: Record<string, any>, placeId: string): any | null {
  const exact = state[`PlaceDetailBase:${placeId}`];
  if (exact) return exact;
  const key = Object.keys(state).find((k) => k.startsWith('PlaceDetailBase:'));
  return key ? state[key] : null;
}

/** placeId로 매장 정보 조회 */
async function fetchPlaceInfo(placeId: string): Promise<NaverPlaceInfo | null> {
  const res = await fetch(`https://m.place.naver.com/place/${placeId}/home`, {
    headers: { 'User-Agent': MOBILE_UA },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const state = extractApolloState(html);
  if (!state) return null;
  const base = pickPlaceBase(state, placeId);
  if (!base || !base.name) return null;
  return {
    placeId,
    name: String(base.name),
    category: base.category ? String(base.category) : null,
    address: base.roadAddress ? String(base.roadAddress) : base.address ? String(base.address) : null,
  };
}

/** URL(전체/단축) → 매장 정보. 실패 시 BoosterError. */
export async function lookupNaverPlace(url: string): Promise<NaverPlaceInfo> {
  const trimmed = (url || '').trim();
  if (!trimmed) throw new BoosterError('네이버 플레이스 URL을 입력해 주세요.');

  let placeId = parseNaverPlaceId(trimmed);
  if (!placeId) placeId = await resolveShortLink(trimmed);
  if (!placeId) {
    throw new BoosterError(
      '네이버 플레이스 URL에서 매장 정보를 찾지 못했습니다. 플레이스 상세 페이지 URL을 붙여넣어 주세요.'
    );
  }

  let info: NaverPlaceInfo | null = null;
  try {
    info = await fetchPlaceInfo(placeId);
  } catch {
    info = null;
  }
  if (!info) {
    throw new BoosterError('매장 정보를 가져오지 못했습니다. URL을 다시 확인해 주세요.');
  }
  return info;
}
