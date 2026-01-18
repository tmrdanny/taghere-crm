/**
 * 한국 주소 파싱 유틸리티
 * 주소 문자열을 시/도, 시/군/구, 상세주소로 분리합니다.
 */

export interface ParsedAddress {
  sido: string | null;
  sigungu: string | null;
  detail: string | null;
}

/**
 * 한국 주소를 파싱하여 시/도, 시/군/구, 상세주소로 분리
 * @param address 전체 주소 문자열
 * @returns 파싱된 주소 객체
 */
export function parseKoreanAddress(address: string): ParsedAddress {
  if (!address || typeof address !== 'string') {
    return { sido: null, sigungu: null, detail: null };
  }

  // 공백 정규화
  const normalized = address.trim().replace(/\s+/g, ' ');

  // 시/도 패턴 (17개)
  const sidoPattern = /(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)/;

  // 시/군/구 패턴
  const sigunguPattern = /([가-힣]+시|[가-힣]+군|[가-힣]+구)/;

  // 시/도 추출
  const sidoMatch = normalized.match(sidoPattern);
  const sido = sidoMatch ? sidoMatch[0] : null;

  let sigungu: string | null = null;
  let detail: string | null = null;

  if (sido) {
    // 시/도 이후 문자열
    const sidoIndex = normalized.indexOf(sido);
    const afterSido = normalized.substring(sidoIndex + sido.length).trim();

    // 시/군/구 추출
    const sigunguMatch = afterSido.match(sigunguPattern);

    if (sigunguMatch) {
      sigungu = sigunguMatch[0];

      // 상세 주소
      const sigunguIndex = afterSido.indexOf(sigungu);
      detail = afterSido.substring(sigunguIndex + sigungu.length).trim() || null;
    } else {
      // 시/군/구가 없는 경우 (예: 세종특별자치시)
      detail = afterSido || null;
    }
  } else {
    // 시/도를 찾을 수 없는 경우 전체를 상세주소로
    detail = normalized;
  }

  return { sido, sigungu, detail };
}

/**
 * 주소 유효성 검증
 * @param address 파싱된 주소 객체
 * @returns 유효 여부
 */
export function isValidParsedAddress(address: ParsedAddress): boolean {
  // 최소한 시/도는 있어야 유효한 주소로 간주
  return address.sido !== null;
}

/**
 * 주소 포맷팅 (파싱된 주소를 다시 문자열로)
 * @param address 파싱된 주소 객체
 * @returns 포맷팅된 주소 문자열
 */
export function formatAddress(address: ParsedAddress): string {
  const parts: string[] = [];

  if (address.sido) parts.push(address.sido);
  if (address.sigungu) parts.push(address.sigungu);
  if (address.detail) parts.push(address.detail);

  return parts.join(' ');
}
