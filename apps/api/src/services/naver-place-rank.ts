/**
 * 네이버 플레이스 키워드 순위 조회 서비스
 * 최대 300위까지 페이징 조회 지원
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://map.naver.com/',
};

const PAGE_SIZE = 50; // 네이버 지도 API 한 페이지당 결과 수
const MAX_PAGES = 6;  // 최대 6페이지 = 300위까지 조회

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
 * 최대 300위까지 페이징하여 정확한 순위를 반환합니다.
 *
 * @param naverPlaceUrl 네이버 플레이스 URL (naver.me 단축 URL 또는 map.naver.com URL)
 * @param keyword 검색 키워드
 * @returns rank (1-based index, null if not found in 300위), totalResults
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

    // 2. 페이징하며 최대 300위까지 조회
    let totalResults = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const searchUrl = `https://map.naver.com/p/api/search/allSearch?query=${encodeURIComponent(keyword)}&type=place&page=${page}&displayCount=${PAGE_SIZE}`;

      const response = await fetch(searchUrl, { headers: HEADERS });

      if (!response.ok) {
        console.error(`[NaverPlaceRank] Search API failed (page ${page}):`, response.status);
        break;
      }

      const data = await response.json() as {
        result?: {
          place?: {
            list?: Array<{ id?: string; name?: string }>;
            totalCount?: number;
          };
        };
      };

      const placeList = data?.result?.place?.list || [];
      if (page === 1) {
        totalResults = data?.result?.place?.totalCount || 0;
      }

      // 이 페이지에서 placeId 찾기
      const indexInPage = placeList.findIndex((item) => item.id === placeId);

      if (indexInPage !== -1) {
        const rank = (page - 1) * PAGE_SIZE + indexInPage + 1;
        console.log(`[NaverPlaceRank] Found! placeId=${placeId} → ${rank}위 (page ${page})`);
        return { rank, totalResults };
      }

      // 더 이상 결과가 없으면 중단
      if (placeList.length < PAGE_SIZE) {
        break;
      }

      // 페이지 간 딜레이 (rate limit 방지)
      if (page < MAX_PAGES) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`[NaverPlaceRank] Not found in top 300: placeId=${placeId}, keyword="${keyword}"`);
    return { rank: null, totalResults };
  } catch (error) {
    console.error('[NaverPlaceRank] Error checking rank:', error);
    return { rank: null, totalResults: 0 };
  }
}
