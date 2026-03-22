/**
 * 네이버 플레이스 키워드 순위 조회 서비스
 *
 * 두 가지 소스를 결합하여 최대한 정확한 순위를 반환:
 * 1. 네이버 검색 HTML 파싱 (search.naver.com) → ~20위까지, placeId 기반
 * 2. 네이버 지역검색 Open API → 상위 5개, 좌표 기반 보조 매칭
 */

const HTML_HEADERS = {
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
 * URL에서 좌표(lng, lat)를 추출합니다.
 */
function extractCoords(url: string): { lng: string; lat: string } | null {
  const lngMatch = url.match(/lng=([\d.]+)/);
  const latMatch = url.match(/lat=([\d.]+)/);
  if (lngMatch && latMatch) {
    return { lng: lngMatch[1], lat: latMatch[1] };
  }
  return null;
}

/**
 * 네이버 검색 HTML에서 플레이스 순위를 조회합니다.
 */
async function getRankFromSearchHTML(placeId: string, keyword: string): Promise<{ rank: number | null; totalResults: number }> {
  try {
    // nexearch(통합검색)과 place(플레이스탭) 둘 다 조회하여 결합
    const [nexearchRes, placeRes] = await Promise.all([
      fetch(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, { headers: HTML_HEADERS }),
      fetch(`https://search.naver.com/search.naver?where=place&query=${encodeURIComponent(keyword)}`, { headers: HTML_HEADERS }),
    ]);

    const htmlParts: string[] = [];
    if (nexearchRes.ok) htmlParts.push(await nexearchRes.text());
    if (placeRes.ok) htmlParts.push(await placeRes.text());

    const combinedHtml = htmlParts.join('\n');
    const placeIdMatches = combinedHtml.match(/place\/(\d+)/g) || [];
    const seen = new Set<string>();
    const orderedPlaceIds: string[] = [];

    for (const match of placeIdMatches) {
      const id = match.replace('place/', '');
      if (!seen.has(id)) {
        seen.add(id);
        orderedPlaceIds.push(id);
      }
    }

    const index = orderedPlaceIds.indexOf(placeId);
    if (index !== -1) {
      return { rank: index + 1, totalResults: orderedPlaceIds.length };
    }

    return { rank: null, totalResults: orderedPlaceIds.length };
  } catch (error) {
    console.error('[NaverPlaceRank] HTML search error:', error);
    return { rank: null, totalResults: 0 };
  }
}

/**
 * 네이버 지역검색 Open API로 순위를 조회합니다.
 * 좌표 기반 매칭 (최대 5개 결과).
 */
async function getRankFromLocalAPI(
  coords: { lng: string; lat: string },
  keyword: string
): Promise<{ rank: number | null; totalResults: number }> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { rank: null, totalResults: 0 };
  }

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(keyword)}&display=5&start=1`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );

    if (!res.ok) return { rank: null, totalResults: 0 };

    const data = await res.json() as {
      total: number;
      items: Array<{ title: string; mapx: string; mapy: string }>;
    };

    // 좌표 매칭: placeUrl에서 추출한 좌표와 API 결과 비교
    // API mapx/mapy는 lng/lat * 10^7 형태
    const targetMapx = Math.round(parseFloat(coords.lng) * 10000000);
    const targetMapy = Math.round(parseFloat(coords.lat) * 10000000);

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const dx = Math.abs(parseInt(item.mapx) - targetMapx);
      const dy = Math.abs(parseInt(item.mapy) - targetMapy);
      // 100 단위 이내 = 약 10m 이내
      if (dx < 100 && dy < 100) {
        return { rank: i + 1, totalResults: data.total };
      }
    }

    return { rank: null, totalResults: data.total };
  } catch (error) {
    console.error('[NaverPlaceRank] Local API error:', error);
    return { rank: null, totalResults: 0 };
  }
}

/**
 * 네이버 플레이스 URL과 키워드로 검색 순위를 조회합니다.
 *
 * @param naverPlaceUrl 네이버 플레이스 URL (naver.me 단축 URL 또는 map.naver.com URL)
 * @param keyword 검색 키워드
 * @returns rank (1-based), totalResults
 */
export async function getPlaceRankByKeyword(
  naverPlaceUrl: string,
  keyword: string
): Promise<{ rank: number | null; totalResults: number }> {
  try {
    if (!naverPlaceUrl || !keyword) {
      return { rank: null, totalResults: 0 };
    }

    // 1. URL 리졸브 → placeId + 좌표 추출
    let resolvedUrl = naverPlaceUrl;

    if (naverPlaceUrl.includes('naver.me')) {
      const response = await fetch(naverPlaceUrl, { redirect: 'follow' });
      resolvedUrl = response.url;
    }

    const placeId = extractPlaceId(resolvedUrl);
    const coords = extractCoords(resolvedUrl);

    if (!placeId) {
      console.error('[NaverPlaceRank] Could not extract place ID from URL:', naverPlaceUrl);
      return { rank: null, totalResults: 0 };
    }

    console.log(`[NaverPlaceRank] placeId=${placeId}, coords=${JSON.stringify(coords)}, keyword="${keyword}"`);

    // 2. 두 소스 병렬 조회
    const [htmlResult, apiResult] = await Promise.all([
      getRankFromSearchHTML(placeId, keyword),
      coords ? getRankFromLocalAPI(coords, keyword) : Promise.resolve({ rank: null, totalResults: 0 }),
    ]);

    // 3. HTML 결과 우선 (placeId 직접 매칭이므로 더 정확)
    if (htmlResult.rank !== null) {
      console.log(`[NaverPlaceRank] HTML match: ${htmlResult.rank}위`);
      return htmlResult;
    }

    // 4. API 좌표 매칭 폴백
    if (apiResult.rank !== null) {
      console.log(`[NaverPlaceRank] API coord match: ${apiResult.rank}위`);
      return apiResult;
    }

    // 5. 둘 다 없으면 순위권 밖
    const totalResults = Math.max(htmlResult.totalResults, apiResult.totalResults);
    console.log(`[NaverPlaceRank] Not found in top results: placeId=${placeId}, keyword="${keyword}"`);
    return { rank: null, totalResults };
  } catch (error) {
    console.error('[NaverPlaceRank] Error:', error);
    return { rank: null, totalResults: 0 };
  }
}
