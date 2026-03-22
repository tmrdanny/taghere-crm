/**
 * 네이버 플레이스 키워드 순위 조회 서비스
 */

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
 *
 * @param naverPlaceUrl 네이버 플레이스 URL (naver.me 단축 URL 또는 map.naver.com URL)
 * @param keyword 검색 키워드
 * @returns rank (1-based index, null if not found), totalResults
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

    // 2. 네이버 지도 검색 API 호출
    const searchUrl = `https://map.naver.com/p/api/search/allSearch?query=${encodeURIComponent(keyword)}&type=place`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://map.naver.com/',
      },
    });

    if (!response.ok) {
      console.error('[NaverPlaceRank] Search API failed:', response.status);
      return { rank: null, totalResults: 0 };
    }

    const data = await response.json() as {
      result?: {
        place?: {
          list?: Array<{ id?: string }>;
          totalCount?: number;
        };
      };
    };

    const placeList = data?.result?.place?.list || [];
    const totalResults = data?.result?.place?.totalCount || placeList.length;

    // 3. placeId가 결과 목록에 있는지 찾기
    const index = placeList.findIndex((item) => item.id === placeId);

    if (index === -1) {
      // 50위 밖 (검색 결과에 없음)
      return { rank: null, totalResults };
    }

    return { rank: index + 1, totalResults };
  } catch (error) {
    console.error('[NaverPlaceRank] Error checking rank:', error);
    return { rank: null, totalResults: 0 };
  }
}
