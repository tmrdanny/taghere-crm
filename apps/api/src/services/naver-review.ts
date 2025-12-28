import { prisma } from '../lib/prisma.js';

interface NaverReviewCounts {
  visitorReviews: number;
  blogReviews: number;
  totalReviews: number;
}

/**
 * 네이버 플레이스 URL에서 리뷰 수를 스크래핑합니다.
 *
 * @param naverPlaceUrl 네이버 플레이스 공유 URL (예: https://naver.me/xxx 또는 https://map.naver.com/...)
 * @returns 방문자 리뷰 수, 블로그 리뷰 수, 총 리뷰 수
 */
export async function scrapeNaverReviewCounts(naverPlaceUrl: string): Promise<NaverReviewCounts | null> {
  try {
    if (!naverPlaceUrl) {
      return null;
    }

    // 네이버 플레이스 URL에서 place ID 추출
    let placeId: string | null = null;

    // naver.me 단축 URL인 경우 리다이렉트 따라가기
    if (naverPlaceUrl.includes('naver.me')) {
      const response = await fetch(naverPlaceUrl, { redirect: 'follow' });
      const finalUrl = response.url;
      placeId = extractPlaceId(finalUrl);
    } else {
      placeId = extractPlaceId(naverPlaceUrl);
    }

    if (!placeId) {
      console.error('Could not extract place ID from URL:', naverPlaceUrl);
      return null;
    }

    // 네이버 플레이스 API 호출 (비공개 API)
    const apiUrl = `https://map.naver.com/p/api/place/popup/${placeId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://map.naver.com/',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch Naver Place API:', response.status);
      // 대체 방법: HTML 페이지 스크래핑
      return await scrapeFromHtml(placeId);
    }

    const data = await response.json() as {
      reviewCount?: number;
      blogCount?: number;
      review?: {
        visitorReviewCount?: number;
        blogReviewCount?: number;
      };
    };

    // API 응답에서 리뷰 수 추출
    const visitorReviews = data?.reviewCount || data?.review?.visitorReviewCount || 0;
    const blogReviews = data?.blogCount || data?.review?.blogReviewCount || 0;

    return {
      visitorReviews,
      blogReviews,
      totalReviews: visitorReviews + blogReviews,
    };
  } catch (error) {
    console.error('Error scraping Naver review counts:', error);
    return null;
  }
}

/**
 * URL에서 네이버 플레이스 ID를 추출합니다.
 */
function extractPlaceId(url: string): string | null {
  // place/xxxxx 형식
  const placeMatch = url.match(/place\/(\d+)/);
  if (placeMatch) {
    return placeMatch[1];
  }

  // restaurant/xxxxx 형식
  const restaurantMatch = url.match(/restaurant\/(\d+)/);
  if (restaurantMatch) {
    return restaurantMatch[1];
  }

  // entry/place/xxxxx 형식
  const entryMatch = url.match(/entry\/place\/(\d+)/);
  if (entryMatch) {
    return entryMatch[1];
  }

  return null;
}

/**
 * HTML 페이지에서 리뷰 수를 스크래핑합니다 (대체 방법).
 */
async function scrapeFromHtml(placeId: string): Promise<NaverReviewCounts | null> {
  try {
    // 여러 URL 형식 시도
    const urls = [
      `https://m.place.naver.com/restaurant/${placeId}/home`,
      `https://m.place.naver.com/place/${placeId}/home`,
      `https://m.place.naver.com/restaurant/${placeId}/review/visitor`,
    ];

    for (const pageUrl of urls) {
      try {
        console.log('Trying to scrape from:', pageUrl);
        const response = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });

        if (!response.ok) {
          console.log('Response not ok:', response.status);
          continue;
        }

        const html = await response.text();

        // 방문자 리뷰 수 추출 (여러 패턴 시도)
        // 패턴 1: "방문자 리뷰 460"
        // 패턴 2: "방문자리뷰460" 또는 "방문자리뷰 460"
        // 패턴 3: JSON 데이터에서 추출
        let visitorReviews = 0;
        let blogReviews = 0;

        // 패턴 1: 일반 텍스트
        const visitorMatch = html.match(/방문자\s*리뷰\s*(\d+(?:,\d+)*)/);
        if (visitorMatch) {
          visitorReviews = parseInt(visitorMatch[1].replace(/,/g, ''), 10);
        }

        const blogMatch = html.match(/블로그\s*리뷰\s*(\d+(?:,\d+)*)/);
        if (blogMatch) {
          blogReviews = parseInt(blogMatch[1].replace(/,/g, ''), 10);
        }

        // 패턴 2: JSON 데이터에서 추출 (window.__APOLLO_STATE__ 등)
        if (visitorReviews === 0 && blogReviews === 0) {
          const jsonMatch = html.match(/"visitorReviewCount"\s*:\s*(\d+)/);
          if (jsonMatch) {
            visitorReviews = parseInt(jsonMatch[1], 10);
          }
          const blogJsonMatch = html.match(/"blogReviewCount"\s*:\s*(\d+)/);
          if (blogJsonMatch) {
            blogReviews = parseInt(blogJsonMatch[1], 10);
          }
        }

        // 패턴 3: reviewCount 형태
        if (visitorReviews === 0 && blogReviews === 0) {
          const reviewCountMatch = html.match(/"reviewCount"\s*:\s*(\d+)/);
          if (reviewCountMatch) {
            visitorReviews = parseInt(reviewCountMatch[1], 10);
          }
        }

        if (visitorReviews > 0 || blogReviews > 0) {
          console.log('Found reviews:', { visitorReviews, blogReviews });
          return {
            visitorReviews,
            blogReviews,
            totalReviews: visitorReviews + blogReviews,
          };
        }
      } catch (urlError) {
        console.error('Error with URL:', pageUrl, urlError);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Error scraping from HTML:', error);
    return null;
  }
}

/**
 * 오늘 날짜를 KST(한국 표준시) 기준 자정으로 생성합니다.
 */
function getTodayDateKST(): Date {
  const now = new Date();
  // KST는 UTC+9
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간 in milliseconds
  const kstTime = new Date(now.getTime() + kstOffset);
  // KST 기준 오늘 날짜의 UTC 자정으로 설정 (DB 저장용)
  return new Date(Date.UTC(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), kstTime.getUTCDate(), 0, 0, 0, 0));
}

/**
 * 매장의 네이버 리뷰 통계를 가져오고 저장합니다.
 */
export async function fetchAndSaveNaverReviewStats(storeId: string): Promise<NaverReviewCounts | null> {
  try {
    // 매장 정보에서 네이버 플레이스 URL 가져오기
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { naverPlaceUrl: true, slug: true },
    });

    if (!store?.naverPlaceUrl) {
      console.log('No Naver Place URL configured for store:', storeId);
      return null;
    }

    // 데모 계정인 경우 스크래핑 건너뛰고 DB 데이터 반환
    if (store.slug === 'taghere-dining' || store.naverPlaceUrl.includes('demo')) {
      console.log('Demo account detected, returning existing DB data');
      const today = getTodayDateKST();
      const existingStats = await prisma.naverReviewStats.findUnique({
        where: {
          storeId_date: {
            storeId,
            date: today,
          },
        },
      });

      if (existingStats) {
        return {
          visitorReviews: existingStats.visitorReviews,
          blogReviews: existingStats.blogReviews,
          totalReviews: existingStats.totalReviews,
        };
      }

      // 오늘 데이터가 없으면 가장 최근 데이터 반환
      const latestStats = await prisma.naverReviewStats.findFirst({
        where: { storeId },
        orderBy: { date: 'desc' },
      });

      if (latestStats) {
        return {
          visitorReviews: latestStats.visitorReviews,
          blogReviews: latestStats.blogReviews,
          totalReviews: latestStats.totalReviews,
        };
      }

      return null;
    }

    console.log('Fetching Naver reviews for URL:', store.naverPlaceUrl);

    // 리뷰 수 스크래핑
    const counts = await scrapeNaverReviewCounts(store.naverPlaceUrl);

    if (!counts) {
      console.log('Could not fetch review counts');
      return null;
    }

    console.log('Fetched review counts:', counts);

    // 오늘 날짜로 통계 저장 (KST 기준)
    const today = getTodayDateKST();

    // 기존 레코드 확인
    const existing = await prisma.naverReviewStats.findUnique({
      where: {
        storeId_date: {
          storeId,
          date: today,
        },
      },
    });

    if (existing) {
      // 업데이트
      await prisma.naverReviewStats.update({
        where: { id: existing.id },
        data: {
          visitorReviews: counts.visitorReviews,
          blogReviews: counts.blogReviews,
          totalReviews: counts.totalReviews,
        },
      });
    } else {
      // 생성
      await prisma.naverReviewStats.create({
        data: {
          storeId,
          date: today,
          visitorReviews: counts.visitorReviews,
          blogReviews: counts.blogReviews,
          totalReviews: counts.totalReviews,
        },
      });
    }

    return counts;
  } catch (error) {
    console.error('Error fetching and saving Naver review stats:', error);
    return null;
  }
}

/**
 * 매장의 네이버 리뷰 통계 차트 데이터를 가져옵니다.
 */
export async function getNaverReviewChartData(storeId: string, days: number = 7) {
  // KST 기준 시작 날짜 계산
  const today = getTodayDateKST();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);

  const stats = await prisma.naverReviewStats.findMany({
    where: {
      storeId,
      date: {
        gte: startDate,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  return stats;
}

/**
 * 오늘 늘어난 리뷰 수를 계산합니다.
 */
export async function getDailyReviewGrowth(storeId: string) {
  const today = getTodayDateKST();

  // 어제 날짜 계산
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // 오늘과 어제의 리뷰 통계 조회
  const [todayStats, yesterdayStats] = await Promise.all([
    prisma.naverReviewStats.findUnique({
      where: {
        storeId_date: {
          storeId,
          date: today,
        },
      },
    }),
    prisma.naverReviewStats.findUnique({
      where: {
        storeId_date: {
          storeId,
          date: yesterday,
        },
      },
    }),
  ]);

  // 오늘 증가량 (오늘 - 어제)
  const dailyGrowth = todayStats && yesterdayStats
    ? todayStats.totalReviews - yesterdayStats.totalReviews
    : 0;

  // 성장률 계산 (어제 대비)
  let growthPercent = 0;
  if (yesterdayStats && yesterdayStats.totalReviews > 0 && dailyGrowth !== 0) {
    growthPercent = Math.round((dailyGrowth / yesterdayStats.totalReviews) * 100);
  }

  return {
    dailyReviews: dailyGrowth,
    reviewGrowth: growthPercent,
    currentTotal: todayStats?.totalReviews || 0,
    visitorReviews: todayStats?.visitorReviews || 0,
    blogReviews: todayStats?.blogReviews || 0,
  };
}
