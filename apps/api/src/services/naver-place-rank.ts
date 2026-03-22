/**
 * 네이버 플레이스 키워드 순위 조회 서비스
 * 네이버 검색 결과 페이지에서 플레이스 순위를 추출합니다.
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

/**
 * URL에서 네이버 플레이스 ID를 추출합니다.
 */
function extractPlaceId(url: string): string | null {
  const placeMatch = url.match(/place\/(\d+)/);
  if (placeMatch) return placeMatch[1];

  const restaurantMatch = url.match(/restaurant\/(\d+)/);
  if (restaurantMatch) return restaurantMatch[1];

  const entryMatch = url.match(/entry\/place\/(\d+)/);
  if (entryMatch) return entryMatch[1];

  return null;
}

/**
 * 네이버 플레이스 URL과 키워드로 검색 순위를 조회합니다.
 * 네이버 검색 결과 페이지(search.naver.com)의 플레이스 섹션에서 순위를 추출합니다.
 *
 * @param naverPlaceUrl 네이버 플레이스 URL (naver.me 단축 URL 또는 map.naver.com URL)
 * @param keyword 검색 키워드
 * @returns rank (1-based), totalResults (검색된 플레이스 수)
 */
export async function getPlaceRankByKeyword(
  naverPlaceUrl: string,
  keyword: string
): Promise<{ rank: number | null; totalResults: number }> {
  try {
    if (!naverPlaceUrl || !keyword) {
      return { rank: null, totalResults: 0 };
    }

    // 1. naver.me 단축 URL인 경우 리다이렉트 따라가기
    let placeId: string | null = null;

    if (naverPlaceUrl.includes('naver.me')) {
      const response = await fetch(naverPlaceUrl, { redirect: 'follow' });
      const finalUrl = response.url;
      placeId = extractPlaceId(finalUrl);
    } else {
      placeId = extractPlaceId(naverPlaceUrl);
    }

    if (!placeId) {
      console.error('[NaverPlaceRank] Could not extract place ID from URL:', naverPlaceUrl);
      return { rank: null, totalResults: 0 };
    }

    console.log(`[NaverPlaceRank] Checking rank for placeId=${placeId}, keyword="${keyword}"`);

    // 2. 네이버 검색 결과 페이지에서 플레이스 ID 목록 추출
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
    const response = await fetch(searchUrl, { headers: HEADERS });

    if (!response.ok) {
      console.error('[NaverPlaceRank] Search page failed:', response.status);
      return { rank: null, totalResults: 0 };
    }

    const html = await response.text();

    // 3. HTML에서 place/숫자 패턴을 순서대로 추출 (중복 제거)
    const placeIdMatches = html.match(/place\/(\d+)/g) || [];
    const seen = new Set<string>();
    const orderedPlaceIds: string[] = [];

    for (const match of placeIdMatches) {
      const id = match.replace('place/', '');
      if (!seen.has(id)) {
        seen.add(id);
        orderedPlaceIds.push(id);
      }
    }

    const totalResults = orderedPlaceIds.length;

    // 4. 대상 placeId의 위치 찾기
    const index = orderedPlaceIds.indexOf(placeId);

    if (index === -1) {
      console.log(`[NaverPlaceRank] Not found: placeId=${placeId}, keyword="${keyword}" (searched ${totalResults} results)`);
      return { rank: null, totalResults };
    }

    const rank = index + 1;
    console.log(`[NaverPlaceRank] Found! placeId=${placeId} → ${rank}위 (out of ${totalResults})`);
    return { rank, totalResults };
  } catch (error) {
    console.error('[NaverPlaceRank] Error checking rank:', error);
    return { rank: null, totalResults: 0 };
  }
}
