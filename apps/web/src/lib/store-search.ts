/**
 * 매장 검색 공통 유틸 — 관리자 화면의 매장 선택기에서 쓴다.
 *
 * 단순 `name.toLowerCase().includes(keyword)` 로는 아래 케이스가 전부 누락된다:
 *  - macOS/한글 IME 입력은 NFD(자모 분리), DB 값은 NFC 라 문자열이 달라 매칭 실패
 *  - "화로상회" 로 검색했을 때 실제 상호가 "화로 상회" 처럼 띄어쓰기가 다른 경우
 *  - "강남 화로" 처럼 순서가 다른 두 단어로 검색하는 경우
 *  - "ㅎㄹㅅㅎ" 같은 초성 검색
 */

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** NFC 정규화 + 소문자 + 공백/구분기호 제거 */
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-_.·]/g, '');
}

/** 한글 음절을 초성으로 바꾼다. 한글이 아닌 글자는 그대로 둔다. */
export function toChoseong(value: string | null | undefined): string {
  if (!value) return '';
  let out = '';
  for (const char of value.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHOSEONG[Math.floor((code - HANGUL_START) / 588)];
    } else {
      out += char.toLowerCase();
    }
  }
  return out.replace(/[\s\-_.·]/g, '');
}

export interface StoreSearchFields {
  name?: string | null;
  slug?: string | null;
  ownerName?: string | null;
}

/** 매장 하나에 대해 미리 만들어 둘 검색용 문자열 묶음 */
function buildHaystacks(store: StoreSearchFields): string[] {
  return [
    normalizeForSearch(store.name),
    normalizeForSearch(store.slug),
    normalizeForSearch(store.ownerName),
    toChoseong(store.name),
    toChoseong(store.ownerName),
  ].filter(Boolean);
}

/**
 * 검색어가 매장과 매칭되는지 판정.
 * 검색어를 공백으로 쪼개 모든 토큰이 각각 어느 필드든 하나에 포함되면 매칭(AND).
 */
export function matchesStoreKeyword(store: StoreSearchFields, keyword: string): boolean {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystacks = buildHaystacks(store);
  if (haystacks.length === 0) return false;

  return tokens.every((rawToken) => {
    const token = normalizeForSearch(rawToken);
    const choseongToken = toChoseong(rawToken);
    if (!token && !choseongToken) return true;
    return haystacks.some(
      (hay) => (token && hay.includes(token)) || (choseongToken && hay.includes(choseongToken))
    );
  });
}

/** 검색어로 매장 목록을 필터링한다. */
export function filterStoresByKeyword<T extends StoreSearchFields>(
  stores: T[],
  keyword: string
): T[] {
  if (!keyword.trim()) return stores;
  return stores.filter((store) => matchesStoreKeyword(store, keyword));
}
