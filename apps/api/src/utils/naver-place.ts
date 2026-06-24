/**
 * 네이버 플레이스 부스터 - URL 유틸
 *
 * - parseNaverPlaceId: 매장이 붙여넣은 플레이스 URL에서 placeId 추출
 * - buildNaverMapUrl: 키워드 + placeId로 "키워드 검색 접근" 네이버 지도 URL 조합
 *   (별도 세션에서 실제 동작 검증된 형식)
 * - generateTrackingCode: 추적 링크 코드 발급
 */

import { customAlphabet } from 'nanoid';

const trackingCodeAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const generateCode = customAlphabet(trackingCodeAlphabet, 10);

/**
 * 플레이스 URL에서 placeId 추출. 단축링크(naver.me)/검색URL 등 placeId 미포함 시 null
 * 지원: map.naver.com/.../place/{id}, m.place.naver.com/{category}/{id}, place.naver.com/{category}/{id}
 */
export function parseNaverPlaceId(url: string): string | null {
  if (!url) return null;
  // 1) .../place/{id} (지도 URL)
  const direct = url.match(/\/place\/(\d+)/);
  if (direct) return direct[1];
  // 2) (m.)place.naver.com/{category}/{id} (모바일/PC 플레이스 상세)
  const byHost = url.match(/place\.naver\.com\/[^/?#]+\/(\d{6,})/);
  if (byHost) return byHost[1];
  return null;
}

/**
 * "키워드 검색 접근" URL 조합.
 * 규칙: 경로 /search/{enc}와 searchText={enc} 값이 반드시 동일.
 *       isCorrectAnswer는 붙이지 않음(매장명 정확일치 검색 전용).
 *       c=15.00,0,0,0,dh 고정. timestamp는 YYYYMMDDHHmm(KST, 생략 시 현재시각).
 */
export function buildNaverMapUrl(
  keyword: string,
  placeId: string,
  timestamp?: string
): string {
  const enc = encodeURIComponent(keyword);
  const ts = timestamp || formatKstTimestamp(new Date());
  return (
    `https://map.naver.com/p/search/${enc}/place/${placeId}` +
    `?c=15.00,0,0,0,dh&placePath=/home?entry=bmp&from=map&fromPanelNum=2` +
    `&timestamp=${ts}&locale=ko&svcName=map_pcv5&searchText=${enc}`
  );
}

/** 추적 링크 코드 (10자리 소문자+숫자) */
export function generateTrackingCode(): string {
  return generateCode();
}

/** KST 기준 YYYYMMDDHHmm */
function formatKstTimestamp(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}`;
}
