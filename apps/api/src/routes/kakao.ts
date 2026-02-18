import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueNaverReviewAlimTalk, enqueuePointsEarnedAlimTalk, enqueueStampEarnedAlimTalk } from '../services/solapi.js';
import { checkMilestoneAndDraw, buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';

const router = Router();

const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
const KAKAO_REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'http://localhost:4000/auth/kakao/callback';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

// GET /auth/kakao/start - 카카오 로그인 시작
router.get('/start', (req, res) => {
  const { storeId, orderId, redirect } = req.query;

  // 카카오 OAuth가 설정되지 않은 경우 개발용 모드로 바로 성공 페이지로 이동
  if (!KAKAO_CLIENT_ID) {
    console.log('Kakao OAuth not configured, using dev mode');
    const successUrl = new URL(`${PUBLIC_APP_URL}/enroll/success`);
    successUrl.searchParams.set('points', '100');
    successUrl.searchParams.set('storeName', '태그히어 (개발모드)');
    successUrl.searchParams.set('devMode', 'true');
    return res.redirect(successUrl.toString());
  }

  // Build state parameter to pass through OAuth flow
  const state = Buffer.from(
    JSON.stringify({
      storeId: storeId || '',
      orderId: orderId || '',
      redirect: redirect || '',
    })
  ).toString('base64');

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code&state=${state}&scope=profile_nickname,account_email,phone_number,gender,birthday,birthyear`;

  res.redirect(kakaoAuthUrl);
});

// GET /auth/kakao/callback - 카카오 로그인 콜백
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('Kakao OAuth error:', error, error_description);
      return res.redirect(`${PUBLIC_APP_URL}/enroll?error=${error}`);
    }

    if (!code) {
      return res.redirect(`${PUBLIC_APP_URL}/enroll?error=no_code`);
    }

    // Parse state
    let stateData = { storeId: '', orderId: '', redirect: '' };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch (e) {
      console.error('Failed to parse state:', e);
    }

    // Exchange code for token
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_CLIENT_ID,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: KAKAO_REDIRECT_URI,
        code: code as string,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      error?: string;
      access_token?: string;
    };

    if (tokenData.error) {
      console.error('Kakao token error:', tokenData);
      return res.redirect(`${PUBLIC_APP_URL}/enroll?error=token_error`);
    }

    // Get user info
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json() as {
      id?: number;
      kakao_account?: {
        phone_number?: string;
        profile?: { nickname?: string };
        gender?: string;
        birthday?: string;      // MMDD 형식
        birthyear?: string;     // YYYY 형식
      };
    };

    if (!userData.id) {
      console.error('Kakao user error:', userData);
      return res.redirect(`${PUBLIC_APP_URL}/enroll?error=user_error`);
    }

    const kakaoId = userData.id.toString();
    const kakaoAccount = userData.kakao_account || {};
    const profile = kakaoAccount.profile || {};

    // Get store
    const storeId = stateData.storeId;
    let store = null;

    const storeSelect = {
      id: true,
      name: true,
      pointsAlimtalkEnabled: true,
      naverPlaceUrl: true,
    };

    if (storeId) {
      store = await prisma.store.findUnique({
        where: { id: storeId },
        select: storeSelect,
      });
    }

    if (!store) {
      // Get first store as fallback (for development)
      store = await prisma.store.findFirst({
        select: storeSelect,
      });
    }

    if (!store) {
      return res.redirect(`${PUBLIC_APP_URL}/enroll?error=store_not_found`);
    }

    // 전화번호 정규화
    const phoneLastDigits = kakaoAccount.phone_number
      ? kakaoAccount.phone_number.replace(/[^0-9]/g, '').slice(-8)
      : null;

    // 고객 찾기: 이 매장에서 kakaoId 또는 phoneLastDigits로 검색 (매장별 고객 관리)
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        kakaoId,
      },
    });

    // kakaoId로 찾지 못한 경우, 이 매장에서 phoneLastDigits로 검색
    if (!customer && phoneLastDigits) {
      customer = await prisma.customer.findFirst({
        where: {
          storeId: store.id,
          phoneLastDigits,
        },
      });
    }

    // 오늘 00시 기준 시간 계산 (KST 기준)
    // UTC+9 = KST, KST 00:00 = UTC 15:00 (전날)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstTodayStart = new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0, 0) - kstOffset
    );

    if (!customer) {
      // 신규 고객 생성
      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          kakaoId,
          name: profile.nickname || null,
          phone: kakaoAccount.phone_number || null,
          phoneLastDigits,
          gender: kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : null,
          birthday: kakaoAccount.birthday
            ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
            : null,
          birthYear: kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null,
          consentMarketing: true,
          consentKakao: true,
          consentAt: new Date(),
          totalPoints: 0,
          visitCount: 0,
        },
      });
    } else {
      // TODO: 테스트 후 중복 체크 다시 활성화
      // // 기존 고객: 이 매장에서 오늘 이미 참여했는지 확인 (PointLedger 기준, KST 00:00 기준)
      // const todayEarnedInStore = await prisma.pointLedger.findFirst({
      //   where: {
      //     storeId: store.id,
      //     customerId: customer.id,
      //     type: 'EARN',
      //     createdAt: { gte: kstTodayStart },
      //   },
      // });

      // if (todayEarnedInStore) {
      //   // 이 매장에서 오늘 이미 참여함 - already_participated 에러로 리다이렉트
      //   const alreadyUrl = new URL(`${PUBLIC_APP_URL}/enroll`);
      //   alreadyUrl.searchParams.set('error', 'already_participated');
      //   alreadyUrl.searchParams.set('storeName', store.name);
      //   if (stateData.storeId) alreadyUrl.searchParams.set('storeId', stateData.storeId);
      //   return res.redirect(alreadyUrl.toString());
      // }

      // 기존 고객 정보 업데이트 (kakaoId, 이름, 성별, 생일 등)
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          kakaoId: customer.kakaoId || kakaoId, // kakaoId가 없으면 연결
          name: profile.nickname || customer.name,
          phone: kakaoAccount.phone_number || customer.phone,
          phoneLastDigits: phoneLastDigits || customer.phoneLastDigits,
          gender: kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : customer.gender,
          // 생일 정보도 없으면 업데이트
          birthday: customer.birthday || (kakaoAccount.birthday
            ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
            : null),
          birthYear: customer.birthYear || (kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null),
        },
      });
    }

    // Calculate points to earn (기본 100포인트)
    const earnPoints = 100;

    // Earn points
    const newBalance = customer.totalPoints + earnPoints;

    // 오늘 날짜의 시작/끝 계산
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 오늘 이미 방문(포인트 적립)한 적이 있는지 확인
    const todayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'EARN',
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const isFirstVisitToday = !todayVisit;

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          // 오늘 첫 방문인 경우에만 visitCount 증가
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          delta: earnPoints,
          balance: newBalance,
          type: 'EARN',
          reason: '카카오 로그인 적립',
          orderId: stateData.orderId || null,
        },
      }),
    ]);

    // Create visit record
    if (stateData.orderId) {
      await prisma.visitOrOrder.upsert({
        where: {
          storeId_orderId: { storeId: store.id, orderId: stateData.orderId },
        },
        create: {
          storeId: store.id,
          customerId: customer.id,
          orderId: stateData.orderId,
          visitedAt: new Date(),
        },
        update: {},
      });
    }

    // 알림톡 발송 (비동기 - 실패해도 응답에 영향 없음)
    const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');

    if (phoneNumber) {
      // 1. 포인트 적립 알림톡
      const pointLedger = await prisma.pointLedger.findFirst({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
      });

      if (pointLedger) {
        enqueuePointsEarnedAlimTalk({
          storeId: store.id,
          customerId: customer.id,
          pointLedgerId: pointLedger.id,
          phone: phoneNumber,
          variables: {
            storeName: store.name,
            points: earnPoints,
            totalPoints: newBalance,
          },
        }).catch((err) => {
          console.error('[Kakao] Points AlimTalk enqueue failed:', err);
        });
      }

      // 2. 네이버 리뷰 요청 알림톡 (reviewAutoSendEnabled가 true인 경우)
      const reviewSetting = await prisma.reviewAutomationSetting.findUnique({
        where: { storeId: store.id },
      });

      console.log('[Kakao] Review setting:', {
        enabled: reviewSetting?.enabled,
        sendFrequency: reviewSetting?.sendFrequency,
        naverReviewUrl: reviewSetting?.naverReviewUrl,
        benefitText: reviewSetting?.benefitText,
      });

      if (reviewSetting?.enabled && reviewSetting?.naverReviewUrl) {
        // sendFrequency가 'first_only'인 경우, 오늘 첫 방문일 때만 발송
        let shouldSendReview = true;
        if (reviewSetting.sendFrequency === 'first_only') {
          shouldSendReview = isFirstVisitToday;
          console.log('[Kakao] first_only mode - isFirstVisitToday:', isFirstVisitToday);
        }

        if (shouldSendReview) {
          console.log('[Kakao] Sending Naver review alimtalk...');
          enqueueNaverReviewAlimTalk({
            storeId: store.id,
            customerId: customer.id,
            phone: phoneNumber,
            variables: {
              storeName: store.name,
              benefitText: reviewSetting.benefitText || '',
            },
          }).catch((err) => {
            console.error('[Kakao] Review AlimTalk enqueue failed:', err);
          });
        } else {
          console.log('[Kakao] Skipping Naver review alimtalk - first_only mode and not first visit today');
        }
      } else {
        console.log('[Kakao] Skipping Naver review alimtalk - not enabled or no URL');
      }
    }

    // Redirect back to enroll page with success data (shows popup)
    const successUrl = new URL(`${PUBLIC_APP_URL}/enroll`);
    successUrl.searchParams.set('points', earnPoints.toString());
    successUrl.searchParams.set('successStoreName', store.name);
    successUrl.searchParams.set('customerId', customer.id);
    if (stateData.storeId) {
      successUrl.searchParams.set('storeId', stateData.storeId);
    }

    if (stateData.redirect) {
      successUrl.searchParams.set('redirect', stateData.redirect);
    }

    res.redirect(successUrl.toString());
  } catch (error) {
    console.error('Kakao callback error:', error);
    res.redirect(`${PUBLIC_APP_URL}/enroll?error=callback_error`);
  }
});

// ============================================================
// TagHere 전용 콜백 (결제 금액 기반 적립률 포인트 적립)
// ============================================================

const TAGHERE_API_URL = process.env.TAGHERE_API_URL || 'https://api.tag-here.com';
const TAGHERE_API_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || '';

// Dev API 설정
const TAGHERE_DEV_API_URL = process.env.TAGHERE_DEV_API_URL || 'https://api.d.tag-here.com';
const TAGHERE_DEV_API_TOKEN = process.env.TAGHERE_DEV_API_TOKEN || '';

// Dev API를 사용할 매장 slug 목록
const DEV_API_STORE_SLUGS = ['zeroclasslab', 'taghere-test'];

interface TaghereOrderData {
  resultPrice?: number | string;
  totalPrice?: number | string;
  tableLabel?: string;
  tableNumber?: string;
  orderItems?: any[];
  items?: any[];
  content?: {
    resultPrice?: number | string;
    totalPrice?: number | string;
    tableLabel?: string;
    tableNumber?: string;
    items?: any[];
  };
}

// TagHere API에서 주문 정보 조회 (slug 기반으로 Dev/Prod API 선택)
async function fetchOrdersheetForCallback(ordersheetId: string, slug?: string): Promise<TaghereOrderData | null> {
  // Dev API를 사용할 매장인지 확인
  const useDevApi = slug && DEV_API_STORE_SLUGS.includes(slug) && TAGHERE_DEV_API_TOKEN;
  const apiUrl = useDevApi ? TAGHERE_DEV_API_URL : TAGHERE_API_URL;
  const apiToken = useDevApi ? TAGHERE_DEV_API_TOKEN : TAGHERE_API_TOKEN;

  console.log(`[TagHere Kakao] Fetching ordersheet - slug: ${slug}, useDevApi: ${useDevApi}, apiUrl: ${apiUrl}`);

  const response = await fetch(
    `${apiUrl}/webhook/crm/ordersheet?ordersheetId=${ordersheetId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('[TagHere] API error:', response.status);
    return null;
  }

  return response.json() as Promise<TaghereOrderData>;
}

// GET /auth/kakao/taghere-start - TagHere 전용 카카오 로그인 시작
router.get('/taghere-start', (req, res) => {
  const { storeId, ordersheetId, slug, origin, isStamp, isMyPage } = req.query;

  // origin 검증: 허용된 도메인만 허용 (보안)
  const allowedOrigins = [
    'http://localhost:3000',
    'https://taghere-crm-web-dev.onrender.com',
    'https://taghere-crm-web-g96p.onrender.com',
  ];
  const validOrigin = typeof origin === 'string' && allowedOrigins.includes(origin) ? origin : PUBLIC_APP_URL;

  if (!KAKAO_CLIENT_ID) {
    console.log('Kakao OAuth not configured, using dev mode');
    const successUrl = new URL(`${validOrigin}/taghere-enroll/success`);
    successUrl.searchParams.set('points', '100');
    successUrl.searchParams.set('storeName', '태그히어 (개발모드)');
    successUrl.searchParams.set('devMode', 'true');
    return res.redirect(successUrl.toString());
  }

  // Build state parameter with ordersheetId and origin
  const state = Buffer.from(
    JSON.stringify({
      storeId: storeId || '',
      ordersheetId: ordersheetId || '',
      slug: slug || '',
      isTaghere: true,
      isStamp: isStamp === 'true',  // 스탬프 적립 여부
      isMyPage: isMyPage === 'true',  // 마이페이지 조회
      origin: validOrigin,  // origin을 state에 포함
    })
  ).toString('base64');

  // TagHere 전용 콜백 URL
  const tagherRedirectUri = KAKAO_REDIRECT_URI.replace('/callback', '/taghere-callback');

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(tagherRedirectUri)}&response_type=code&state=${state}&scope=profile_nickname,account_email,phone_number,gender,birthday,birthyear`;

  res.redirect(kakaoAuthUrl);
});

// 마이페이지 전용 콜백 핸들러 (적립 없이 kakaoId만 추출)
async function handleMyPageCallback(
  req: Request,
  res: Response,
  stateData: { origin: string },
  redirectOrigin: string
) {
  const { code } = req.query;

  try {
    const tagherRedirectUri = KAKAO_REDIRECT_URI.replace('/callback', '/taghere-callback');

    // Exchange code for token
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_CLIENT_ID,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: tagherRedirectUri,
        code: code as string,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      error?: string;
      access_token?: string;
    };

    if (tokenData.error) {
      console.error('[MyPage Callback] Kakao token error:', tokenData);
      return res.redirect(`${redirectOrigin}/taghere-my?error=token_error`);
    }

    // Get user info (kakaoId만 필요)
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json() as {
      id?: number;
    };

    if (!userData.id) {
      console.error('[MyPage Callback] Kakao user error:', userData);
      return res.redirect(`${redirectOrigin}/taghere-my?error=user_error`);
    }

    const kakaoId = userData.id.toString();
    console.log(`[MyPage Callback] kakaoId: ${kakaoId}`);

    // 적립/포인트 부여 없이 바로 마이페이지로 리다이렉트
    return res.redirect(`${redirectOrigin}/taghere-my?kakaoId=${kakaoId}`);
  } catch (error) {
    console.error('[MyPage Callback] Error:', error);
    return res.redirect(`${redirectOrigin}/taghere-my?error=server_error`);
  }
}

// 스탬프 적립 전용 콜백 핸들러
async function handleStampCallback(
  req: Request,
  res: Response,
  stateData: { storeId: string; ordersheetId: string; slug: string; isStamp: boolean; origin: string; isHitejinro?: boolean; returnPath?: string; barcode?: string },
  redirectOrigin: string
) {
  const { code } = req.query;

  // 하이트진로 여부에 따라 리다이렉트 경로 결정
  const stampBasePath = stateData.isHitejinro
    ? `/taghere-enroll-stamp-hitejinro/${stateData.slug || ''}`
    : `/taghere-enroll-stamp/${stateData.slug || ''}`;

  // TagHere 전용 콜백 URL
  const tagherRedirectUri = KAKAO_REDIRECT_URI.replace('/callback', '/taghere-callback');

  // Exchange code for token
  const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KAKAO_CLIENT_ID,
      client_secret: KAKAO_CLIENT_SECRET,
      redirect_uri: tagherRedirectUri,
      code: code as string,
    }),
  });

  const tokenData = await tokenResponse.json() as {
    error?: string;
    access_token?: string;
  };

  if (tokenData.error) {
    console.error('Kakao token error:', tokenData);
    return res.redirect(`${redirectOrigin}${stampBasePath}?error=token_error`);
  }

  // Get user info
  const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const userData = await userResponse.json() as {
    id?: number;
    kakao_account?: {
      phone_number?: string;
      profile?: { nickname?: string };
      gender?: string;
      birthday?: string;
      birthyear?: string;
    };
  };

  if (!userData.id) {
    console.error('Kakao user error:', userData);
    return res.redirect(`${redirectOrigin}${stampBasePath}?error=user_error`);
  }

  const kakaoId = userData.id.toString();
  const kakaoAccount = userData.kakao_account || {};
  const profile = kakaoAccount.profile || {};

  // Get store
  let store = null;
  const storeSelect = {
    id: true,
    name: true,
    stampSetting: true,
    franchiseStampEnabled: true,
    franchiseId: true,
    franchise: {
      select: {
        id: true,
        name: true,
        franchiseStampSetting: true,
      },
    },
    reviewAutomationSetting: {
      select: { benefitText: true },
    },
  };

  if (stateData.storeId) {
    store = await prisma.store.findUnique({
      where: { id: stateData.storeId },
      select: storeSelect,
    });
  }

  if (!store && stateData.slug) {
    store = await prisma.store.findFirst({
      where: { slug: stateData.slug },
      select: storeSelect,
    });
  }

  if (!store) {
    return res.redirect(`${redirectOrigin}${stampBasePath}?error=store_not_found`);
  }

  // 프랜차이즈 통합 스탬프 모드 판별
  const isFranchiseStampMode = !!(
    store.franchiseStampEnabled &&
    store.franchiseId &&
    store.franchise?.franchiseStampSetting
  );

  // 스탬프 기능 활성화 확인 (통합 스탬프 또는 개별 스탬프)
  if (!isFranchiseStampMode && !store.stampSetting?.enabled) {
    return res.redirect(`${redirectOrigin}${stampBasePath}?error=stamp_disabled`);
  }

  // 전화번호 정규화
  const phoneLastDigits = kakaoAccount.phone_number
    ? kakaoAccount.phone_number.replace(/[^0-9]/g, '').slice(-8)
    : null;

  // 고객 찾기
  let customer = await prisma.customer.findFirst({
    where: {
      storeId: store.id,
      kakaoId,
    },
  });

  let isNewCustomer = false;

  if (!customer && phoneLastDigits) {
    customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        phoneLastDigits,
      },
    });
  }

  // 같은 ordersheetId로 이미 적립했는지 확인
  if (stateData.ordersheetId) {
    const existingEarn = await prisma.stampLedger.findFirst({
      where: {
        storeId: store.id,
        ordersheetId: stateData.ordersheetId,
      },
    });

    if (existingEarn) {
      const alreadyUrl = new URL(`${redirectOrigin}${stampBasePath}`);
      alreadyUrl.searchParams.set('error', 'already_participated');
      if (stateData.ordersheetId) alreadyUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
      if (customer) alreadyUrl.searchParams.set('stamps', String(customer.totalStamps || 0));
      alreadyUrl.searchParams.set('storeName', store.name);
      const earlyRewards: RewardEntry[] = store.stampSetting?.rewards
        ? (store.stampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(store.stampSetting as any);
      for (const entry of earlyRewards) {
        if (entry.description) alreadyUrl.searchParams.set(`reward${entry.tier}`, entry.description);
        if (entry.options && Array.isArray(entry.options) && entry.options.length > 1) alreadyUrl.searchParams.set(`reward${entry.tier}Random`, 'true');
      }
      return res.redirect(alreadyUrl.toString());
    }
  }

  // 오늘 이미 적립했는지 확인 (1일 1회 제한)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (customer) {
    const todayEarn = await prisma.stampLedger.findFirst({
      where: {
        storeId: store.id,
        customerId: customer.id,
        type: 'EARN',
        createdAt: { gte: todayStart },
      },
    });

    if (todayEarn) {
      const alreadyUrl = new URL(`${redirectOrigin}${stampBasePath}`);
      alreadyUrl.searchParams.set('error', 'already_participated');
      alreadyUrl.searchParams.set('stamps', String(customer.totalStamps || 0));
      alreadyUrl.searchParams.set('storeName', store.name);
      // rewards JSON 기반으로 보상 정보 전달
      const alreadyRewards: RewardEntry[] = store.stampSetting?.rewards
        ? (store.stampSetting.rewards as unknown as RewardEntry[])
        : store.stampSetting ? buildRewardsFromLegacy(store.stampSetting as any) : [];
      for (const r of alreadyRewards) {
        const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
        alreadyUrl.searchParams.set(`reward${r.tier}`, isRandom ? '랜덤 박스!' : r.description);
        if (isRandom) alreadyUrl.searchParams.set(`reward${r.tier}Random`, 'true');
      }
      return res.redirect(alreadyUrl.toString());
    }
  }

  if (!customer) {
    isNewCustomer = true;

    // 다른 매장에서 같은 kakaoId를 가진 고객 조회
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        kakaoId,
        storeId: { not: store.id },
      },
      select: {
        name: true,
        phone: true,
        phoneLastDigits: true,
        gender: true,
        birthday: true,
        birthYear: true,
      },
    });

    // phoneLastDigits 중복 체크
    let phoneToUse = existingCustomer?.phone ?? kakaoAccount.phone_number ?? null;
    let phoneLastDigitsToUse = existingCustomer?.phoneLastDigits ?? phoneLastDigits;

    if (phoneLastDigitsToUse) {
      const existingPhone = await prisma.customer.findFirst({
        where: {
          storeId: store.id,
          phoneLastDigits: phoneLastDigitsToUse,
        },
      });
      if (existingPhone) {
        phoneToUse = null;
        phoneLastDigitsToUse = null;
      }
    }

    customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        kakaoId,
        name: existingCustomer?.name ?? profile.nickname ?? null,
        phone: phoneToUse,
        phoneLastDigits: phoneLastDigitsToUse,
        gender: existingCustomer?.gender ?? (kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : null),
        birthday: existingCustomer?.birthday ?? (kakaoAccount.birthday
          ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
          : null),
        birthYear: existingCustomer?.birthYear ?? (kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null),
        totalPoints: 0,
        totalStamps: 0,
        visitCount: 0,
        consentMarketing: true,
        consentKakao: true,
        consentAt: new Date(),
      },
    });
  } else {
    // 기존 고객 정보 업데이트
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        kakaoId: customer.kakaoId || kakaoId,
        name: profile.nickname || customer.name,
        phone: kakaoAccount.phone_number || customer.phone,
        phoneLastDigits: phoneLastDigits || customer.phoneLastDigits,
        gender: kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : customer.gender,
        birthday: customer.birthday || (kakaoAccount.birthday
          ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
          : null),
        birthYear: customer.birthYear || (kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null),
      },
    });
  }

  // 주문 정보 조회 (ordersheetId가 있는 경우)
  let orderItems: any[] = [];
  let tableLabel: string | null = null;
  let totalAmount: number | null = null;

  if (stateData.ordersheetId) {
    try {
      const orderData = await fetchOrdersheetForCallback(stateData.ordersheetId, stateData.slug);
      if (orderData) {
        const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
        totalAmount = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;
        tableLabel = orderData.content?.tableLabel || orderData.tableLabel || orderData.content?.tableNumber || orderData.tableNumber || null;
        const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
        orderItems = rawItems.map((item: any) => ({
          name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
          quantity: item.count || item.quantity || item.qty || item.amount || 1,
          price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
          option: item.option || null,
        }));
        console.log(`[Kakao Stamp] Ordersheet fetched - items: ${orderItems.length}, tableLabel: ${tableLabel}, totalAmount: ${totalAmount}`);
      }
    } catch (e) {
      console.error('[Kakao Stamp] Failed to fetch ordersheet:', e);
    }
  }

  // ============================================
  // 프랜차이즈 통합 스탬프 모드
  // ============================================
  if (isFranchiseStampMode) {
    const franchiseId = store.franchiseId!;
    const franchiseStampSetting = store.franchise!.franchiseStampSetting!;
    const franchiseName = store.franchise!.name;

    // FranchiseCustomer upsert
    let franchiseCustomer = await prisma.franchiseCustomer.findUnique({
      where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
    });

    // 1일 1회 제한 체크 (프랜차이즈 통합)
    if (franchiseCustomer) {
      const todayFranchiseEarn = await prisma.franchiseStampLedger.findFirst({
        where: {
          franchiseCustomerId: franchiseCustomer.id,
          storeId: store.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
        },
      });

      if (todayFranchiseEarn) {
        const alreadyUrl = new URL(`${redirectOrigin}${stampBasePath}`);
        alreadyUrl.searchParams.set('error', 'already_participated');
        alreadyUrl.searchParams.set('stamps', String(franchiseCustomer.totalStamps || 0));
        alreadyUrl.searchParams.set('storeName', store.name);
        alreadyUrl.searchParams.set('franchiseName', franchiseName);
        const alreadyRewards: RewardEntry[] = franchiseStampSetting.rewards
          ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(franchiseStampSetting as any);
        for (const r of alreadyRewards) {
          const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
          alreadyUrl.searchParams.set(`reward${r.tier}`, isRandom ? '랜덤 박스!' : r.description);
          if (isRandom) alreadyUrl.searchParams.set(`reward${r.tier}Random`, 'true');
        }
        return res.redirect(alreadyUrl.toString());
      }
    }

    if (!franchiseCustomer) {
      franchiseCustomer = await prisma.franchiseCustomer.create({
        data: {
          franchiseId,
          kakaoId,
          phone: customer?.phone || kakaoAccount.phone_number || null,
          name: customer?.name || profile.nickname || null,
        },
      });
    }

    // 매장 Customer 방문수만 업데이트 (개별 스탬프는 적립 안함)
    await prisma.customer.update({
      where: { id: customer!.id },
      data: {
        lastVisitAt: new Date(),
        visitCount: { increment: 1 },
      },
    });

    // 주문 내역 (매장 레벨 - 방문 기록)
    await prisma.visitOrOrder.create({
      data: {
        storeId: store.id,
        customerId: customer!.id,
        orderId: stateData.ordersheetId || null,
        visitedAt: new Date(),
        totalAmount: totalAmount,
        items: orderItems.length > 0 || tableLabel ? {
          items: orderItems,
          tableNumber: tableLabel,
        } : undefined,
      },
    });

    // 프랜차이즈 통합 스탬프 적립
    const previousFranchiseStamps = franchiseCustomer.totalStamps;
    const newFranchiseBalance = previousFranchiseStamps + 1;

    const franchiseResult = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchiseCustomer.update({
        where: { id: franchiseCustomer!.id },
        data: {
          totalStamps: newFranchiseBalance,
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          phone: customer?.phone || franchiseCustomer!.phone || undefined,
          name: customer?.name || franchiseCustomer!.name || undefined,
        },
      });

      const ledger = await tx.franchiseStampLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId: franchiseCustomer!.id,
          storeId: store!.id,
          type: 'EARN',
          delta: 1,
          balance: newFranchiseBalance,
          ordersheetId: stateData.ordersheetId || null,
          earnMethod: 'NFC_TAG',
          reason: stateData.ordersheetId
            ? `태그히어 주문 적립 (${stateData.ordersheetId})`
            : '카카오 로그인 스탬프 적립 (통합)',
        },
      });

      // 마일스톤 체크
      const milestoneResult = checkMilestoneAndDraw(
        previousFranchiseStamps,
        newFranchiseBalance,
        franchiseStampSetting as any,
      );
      if (milestoneResult) {
        await tx.franchiseStampLedger.update({
          where: { id: ledger.id },
          data: {
            drawnReward: milestoneResult.reward,
            drawnRewardTier: milestoneResult.tier,
          },
        });
      }

      return { customer: updated, ledger, milestoneResult };
    });

    console.log(`[Kakao Stamp] Franchise stamp earned - franchiseCustomerId: ${franchiseCustomer.id}, newBalance: ${franchiseResult.customer.totalStamps}${franchiseResult.milestoneResult ? `, milestone: ${franchiseResult.milestoneResult.tier}개 - ${franchiseResult.milestoneResult.reward}` : ''}`);

    // 알림톡 발송 (비동기)
    const phoneNumber = customer!.phone?.replace(/[^0-9]/g, '');
    if (franchiseStampSetting.alimtalkEnabled && phoneNumber) {
      const rewardsForAlimtalk: RewardEntry[] = franchiseStampSetting.rewards
        ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(franchiseStampSetting as any);
      const rules = rewardsForAlimtalk
        .sort((a, b) => a.tier - b.tier)
        .map(r => {
          const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
          return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
        });
      const stampUsageRule = rules.length > 0
        ? '\n' + rules.join('\n')
        : '\n- 10개 모을시 매장 선물 증정!';

      const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';

      enqueueStampEarnedAlimTalk({
        storeId: store.id,
        customerId: customer!.id,
        stampLedgerId: franchiseResult.ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: `${franchiseName} ${store.name}`,
          earnedStamps: 1,
          totalStamps: franchiseResult.customer.totalStamps,
          stampUsageRule,
          reviewGuide,
        },
        skipAlimtalkCheck: true, // 프랜차이즈 통합: franchiseStampSetting.alimtalkEnabled 이미 검증됨
      }).catch((err) => {
        console.error('[Kakao Stamp] Franchise Stamp AlimTalk enqueue failed:', err);
      });
    }

    // 리다이렉트
    const hasPreferences = !!(customer as any).preferredCategories;
    const hasVisitSource = !!(customer as any).visitSource;

    const successUrl = new URL(`${redirectOrigin}${stampBasePath}`);
    successUrl.searchParams.set('stamps', franchiseResult.customer.totalStamps.toString());
    successUrl.searchParams.set('successStoreName', store.name);
    successUrl.searchParams.set('franchiseName', franchiseName);
    successUrl.searchParams.set('customerId', customer!.id);
    successUrl.searchParams.set('kakaoId', kakaoId);
    successUrl.searchParams.set('hasPreferences', hasPreferences.toString());
    successUrl.searchParams.set('hasVisitSource', hasVisitSource.toString());

    const rewardsForUrl: RewardEntry[] = franchiseStampSetting.rewards
      ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(franchiseStampSetting as any);
    for (const entry of rewardsForUrl) {
      if (entry.description) {
        successUrl.searchParams.set(`reward${entry.tier}`, entry.description);
      }
      if (entry.options && Array.isArray(entry.options) && entry.options.length > 1) {
        successUrl.searchParams.set(`reward${entry.tier}Random`, 'true');
      }
    }
    if (stateData.ordersheetId) {
      successUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
    }
    if (franchiseResult.milestoneResult) {
      successUrl.searchParams.set('drawnReward', franchiseResult.milestoneResult.reward);
      successUrl.searchParams.set('drawnRewardTier', franchiseResult.milestoneResult.tier.toString());
    }

    return res.redirect(successUrl.toString());
  }

  // ============================================
  // 기존 매장 개별 스탬프 적립
  // ============================================

  // 스탬프 적립 (트랜잭션) - 스탬프 적립 시 무조건 방문횟수 +1
  const previousStamps = customer!.totalStamps ?? 0;
  console.log(`[Kakao Stamp] Before transaction - customerId: ${customer!.id}, previousStamps: ${previousStamps}`);

  const result = await prisma.$transaction(async (tx) => {
    const newBalance = previousStamps + 1;

    // 고객 스탬프 업데이트
    const updatedCustomer = await tx.customer.update({
      where: { id: customer!.id },
      data: {
        totalStamps: newBalance,
        lastVisitAt: new Date(),
        visitCount: { increment: 1 },
      },
    });

    // 거래 내역 기록
    const ledger = await tx.stampLedger.create({
      data: {
        storeId: store!.id,
        customerId: customer!.id,
        type: 'EARN',
        delta: 1,
        balance: newBalance,
        ordersheetId: stateData.ordersheetId || null,
        earnMethod: 'NFC_TAG',
        tableLabel: tableLabel,
        reason: stateData.ordersheetId ? `태그히어 주문 적립 (${stateData.ordersheetId})` : '카카오 로그인 스탬프 적립',
      },
    });

    // 주문 내역 생성
    await tx.visitOrOrder.create({
      data: {
        storeId: store!.id,
        customerId: customer!.id,
        orderId: stateData.ordersheetId || null,
        visitedAt: new Date(),
        totalAmount: totalAmount,
        items: orderItems.length > 0 || tableLabel ? {
          items: orderItems,
          tableNumber: tableLabel,
        } : undefined,
      },
    });

    // 마일스톤 도달 시 보상 추첨
    const milestoneResult = checkMilestoneAndDraw(previousStamps, newBalance, store!.stampSetting!);
    if (milestoneResult) {
      await tx.stampLedger.update({
        where: { id: ledger.id },
        data: {
          drawnReward: milestoneResult.reward,
          drawnRewardTier: milestoneResult.tier,
        },
      });
    }

    return { customer: updatedCustomer, ledger, milestoneResult };
  });

  console.log(`[Kakao Stamp] Stamp earned - customerId: ${customer.id}, newBalance: ${result.customer.totalStamps}${result.milestoneResult ? `, milestone: ${result.milestoneResult.tier}개 - ${result.milestoneResult.reward}` : ''}`);

  // 알림톡 발송 (비동기)
  const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
  if (store.stampSetting?.alimtalkEnabled && phoneNumber) {
    // 스탬프 사용 규칙 생성 (rewards JSON 또는 레거시 컬럼에서)
    const rewardsForAlimtalk: RewardEntry[] = store.stampSetting.rewards
      ? (store.stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);
    const rules = rewardsForAlimtalk
      .sort((a, b) => a.tier - b.tier)
      .map(r => {
        const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
        return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
      });
    const stampUsageRule = rules.length > 0
      ? '\n' + rules.join('\n')
      : '\n- 10개 모을시 매장 선물 증정!';

    // 리뷰 작성 안내 문구
    const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';

    enqueueStampEarnedAlimTalk({
      storeId: store.id,
      customerId: customer.id,
      stampLedgerId: result.ledger.id,
      phone: phoneNumber,
      variables: {
        storeName: store.name,
        earnedStamps: 1,
        totalStamps: result.customer.totalStamps,
        stampUsageRule,
        reviewGuide,
      },
    }).catch((err) => {
      console.error('[Kakao Stamp] Stamp AlimTalk enqueue failed:', err);
    });
  }

  // Check if customer already has preferredCategories
  const hasPreferences = !!(customer as any).preferredCategories;
  const hasVisitSource = !!(customer as any).visitSource;

  // Redirect back to stamp enroll page with success data
  const successUrl = new URL(`${redirectOrigin}${stampBasePath}`);
  successUrl.searchParams.set('stamps', result.customer.totalStamps.toString());
  successUrl.searchParams.set('successStoreName', store.name);
  successUrl.searchParams.set('customerId', customer.id);
  successUrl.searchParams.set('kakaoId', kakaoId);
  successUrl.searchParams.set('hasPreferences', hasPreferences.toString());
  successUrl.searchParams.set('hasVisitSource', hasVisitSource.toString());
  // rewards JSON 기반으로 보상 정보 전달
  const rewardsForUrl: RewardEntry[] = store.stampSetting?.rewards
    ? (store.stampSetting.rewards as unknown as RewardEntry[])
    : buildRewardsFromLegacy(store.stampSetting as any);
  for (const entry of rewardsForUrl) {
    if (entry.description) {
      successUrl.searchParams.set(`reward${entry.tier}`, entry.description);
    }
    if (entry.options && Array.isArray(entry.options) && entry.options.length > 1) {
      successUrl.searchParams.set(`reward${entry.tier}Random`, 'true');
    }
  }
  if (stateData.ordersheetId) {
    successUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
  }
  if (result.milestoneResult) {
    successUrl.searchParams.set('drawnReward', result.milestoneResult.reward);
    successUrl.searchParams.set('drawnRewardTier', result.milestoneResult.tier.toString());
  }

  res.redirect(successUrl.toString());
}

// GET /auth/kakao/taghere-callback - TagHere 전용 카카오 로그인 콜백
router.get('/taghere-callback', async (req, res) => {
  // state를 try 바깥에서 파싱하여 catch에서도 접근 가능하도록
  const { code, state, error: oauthError, error_description } = req.query;

  let stateData = { storeId: '', ordersheetId: '', slug: '', isTaghere: true, isStamp: false, isMyPage: false, origin: PUBLIC_APP_URL };
  try {
    stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    console.log('[TagHere Kakao Callback] Parsed state:', JSON.stringify(stateData));
  } catch (e) {
    console.error('Failed to parse state:', e);
  }

  // origin이 없으면 기본값 사용
  const redirectOrigin = stateData.origin || PUBLIC_APP_URL;

  try {
    if (oauthError) {
      console.error('Kakao OAuth error:', oauthError, error_description);
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=${oauthError}`);
    }

    if (!code) {
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=no_code`);
    }

    console.log(`[TagHere Kakao Callback] isStamp: ${stateData.isStamp}, isMyPage: ${stateData.isMyPage}, redirectOrigin: ${redirectOrigin}`);

    // 마이페이지 조회인 경우 (적립 없이 kakaoId만 추출)
    if (stateData.isMyPage) {
      console.log('[TagHere Kakao Callback] Routing to my-page callback handler');
      return handleMyPageCallback(req, res, stateData, redirectOrigin);
    }

    // 스탬프 적립인 경우 스탬프 전용 콜백으로 처리
    if (stateData.isStamp) {
      console.log('[TagHere Kakao Callback] Routing to stamp callback handler');
      return handleStampCallback(req, res, stateData, redirectOrigin);
    }

    // TagHere 전용 콜백 URL
    const tagherRedirectUri = KAKAO_REDIRECT_URI.replace('/callback', '/taghere-callback');

    // Exchange code for token
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_CLIENT_ID,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: tagherRedirectUri,
        code: code as string,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      error?: string;
      access_token?: string;
    };

    if (tokenData.error) {
      console.error('Kakao token error:', tokenData);
      return res.redirect(`${redirectOrigin}/taghere-enroll?error=token_error`);
    }

    // Get user info
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json() as {
      id?: number;
      kakao_account?: {
        phone_number?: string;
        profile?: { nickname?: string };
        gender?: string;
        birthday?: string;
        birthyear?: string;
      };
    };

    if (!userData.id) {
      console.error('Kakao user error:', userData);
      return res.redirect(`${redirectOrigin}/taghere-enroll?error=user_error`);
    }

    const kakaoId = userData.id.toString();
    const kakaoAccount = userData.kakao_account || {};
    const profile = kakaoAccount.profile || {};

    // Get store
    const storeId = stateData.storeId;
    let store = null;

    const storeSelect = {
      id: true,
      name: true,
      pointRatePercent: true,
      pointsAlimtalkEnabled: true,
      naverPlaceUrl: true,
    };

    if (storeId) {
      store = await prisma.store.findUnique({
        where: { id: storeId },
        select: storeSelect,
      });
    }

    if (!store && stateData.slug) {
      store = await prisma.store.findFirst({
        where: { slug: stateData.slug },
        select: storeSelect,
      });
    }

    if (!store) {
      return res.redirect(`${redirectOrigin}/taghere-enroll?error=store_not_found`);
    }

    // 전화번호 정규화
    const phoneLastDigits = kakaoAccount.phone_number
      ? kakaoAccount.phone_number.replace(/[^0-9]/g, '').slice(-8)
      : null;

    // 고객 찾기
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        kakaoId,
      },
    });

    if (!customer && phoneLastDigits) {
      customer = await prisma.customer.findFirst({
        where: {
          storeId: store.id,
          phoneLastDigits,
        },
      });
    }

    // 같은 ordersheetId로 이미 적립했는지 확인
    if (stateData.ordersheetId) {
      const existingEarn = await prisma.pointLedger.findFirst({
        where: {
          storeId: store.id,
          type: 'EARN',
          reason: { contains: stateData.ordersheetId },
        },
      });

      if (existingEarn) {
        const alreadyUrl = new URL(`${redirectOrigin}/taghere-enroll/${stateData.slug || ''}`);
        alreadyUrl.searchParams.set('error', 'already_participated');
        alreadyUrl.searchParams.set('storeName', store.name);
        if (stateData.ordersheetId) alreadyUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
        return res.redirect(alreadyUrl.toString());
      }
    }

    // TagHere API에서 주문 정보 조회 (slug 기반으로 Dev/Prod API 선택)
    let resultPrice = 0;
    let orderItems: any[] = [];
    let tableLabel: string | null = null;
    if (stateData.ordersheetId) {
      const orderData = await fetchOrdersheetForCallback(stateData.ordersheetId, stateData.slug);
      if (orderData) {
        // resultPrice는 content.resultPrice에 있고, 문자열일 수 있음
        const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
        resultPrice = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;
        // 테이블 레이블 추출 (tableLabel 또는 tableNumber)
        tableLabel = orderData.content?.tableLabel || orderData.tableLabel || orderData.content?.tableNumber || orderData.tableNumber || null;
        // 주문 아이템 정보 - TagHere API 응답 구조에 따라 추출
        const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
        // items 구조 로깅 (디버깅용)
        console.log('[TagHere Kakao] Raw items structure:', JSON.stringify(rawItems, null, 2));
        // 아이템 정규화 - 다양한 필드명 지원 (TagHere API는 label 필드 사용)
        orderItems = rawItems.map((item: any) => ({
          name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
          quantity: item.count || item.quantity || item.qty || item.amount || 1,
          price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
          option: item.option || null,
        }));
        console.log('[TagHere Kakao] Normalized items:', JSON.stringify(orderItems, null, 2));
        console.log('[TagHere Kakao] Table label:', tableLabel);
      }
    }

    // 적립률 기반 포인트 계산 (기본 5%)
    const ratePercent = store.pointRatePercent || 5;
    const earnPoints = resultPrice > 0 ? Math.round(resultPrice * ratePercent / 100) : 100;

    if (!customer) {
      // 신규 고객 생성
      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          kakaoId,
          name: profile.nickname || null,
          phone: kakaoAccount.phone_number || null,
          phoneLastDigits,
          gender: kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : null,
          birthday: kakaoAccount.birthday
            ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
            : null,
          birthYear: kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null,
          consentMarketing: true,
          consentKakao: true,
          consentAt: new Date(),
          totalPoints: 0,
          visitCount: 0,
        },
      });
    } else {
      // 기존 고객 정보 업데이트
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          kakaoId: customer.kakaoId || kakaoId,
          name: profile.nickname || customer.name,
          phone: kakaoAccount.phone_number || customer.phone,
          phoneLastDigits: phoneLastDigits || customer.phoneLastDigits,
          gender: kakaoAccount.gender === 'male' ? 'MALE' : kakaoAccount.gender === 'female' ? 'FEMALE' : customer.gender,
          birthday: customer.birthday || (kakaoAccount.birthday
            ? `${kakaoAccount.birthday.slice(0, 2)}-${kakaoAccount.birthday.slice(2, 4)}`
            : null),
          birthYear: customer.birthYear || (kakaoAccount.birthyear ? parseInt(kakaoAccount.birthyear) : null),
        },
      });
    }

    // Earn points
    const newBalance = customer.totalPoints + earnPoints;

    // 오늘 날짜의 시작/끝 계산
    const taghereTodayStart = new Date();
    taghereTodayStart.setHours(0, 0, 0, 0);

    const taghereTodayEnd = new Date();
    taghereTodayEnd.setHours(23, 59, 59, 999);

    // 오늘 이미 방문(포인트 적립)한 적이 있는지 확인
    const taghereTodayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'EARN',
        createdAt: {
          gte: taghereTodayStart,
          lte: taghereTodayEnd,
        },
      },
    });

    const isFirstVisitTodayTaghere = !taghereTodayVisit;

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          // 오늘 첫 방문인 경우에만 visitCount 증가
          ...(isFirstVisitTodayTaghere && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          delta: earnPoints,
          balance: newBalance,
          type: 'EARN',
          reason: stateData.ordersheetId
            ? `TagHere 주문 적립 (ordersheetId: ${stateData.ordersheetId})`
            : 'TagHere 적립',
          orderId: stateData.ordersheetId || null,
          tableLabel: tableLabel,
        },
      }),
      // 주문 정보를 VisitOrOrder 테이블에 저장
      prisma.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          orderId: stateData.ordersheetId || null,
          visitedAt: new Date(),
          totalAmount: resultPrice > 0 ? resultPrice : null,
          items: orderItems.length > 0 || tableLabel ? {
            items: orderItems,
            tableNumber: tableLabel,
          } : undefined,
        },
      }),
    ]);

    // 알림톡 발송
    const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');

    if (phoneNumber) {
      const pointLedger = await prisma.pointLedger.findFirst({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
      });

      if (pointLedger) {
        enqueuePointsEarnedAlimTalk({
          storeId: store.id,
          customerId: customer.id,
          pointLedgerId: pointLedger.id,
          phone: phoneNumber,
          variables: {
            storeName: store.name,
            points: earnPoints,
            totalPoints: newBalance,
          },
        }).catch((err) => {
          console.error('[TagHere Kakao] Points AlimTalk enqueue failed:', err);
        });
      }

      // 네이버 리뷰 요청 알림톡
      const reviewSetting = await prisma.reviewAutomationSetting.findUnique({
        where: { storeId: store.id },
      });

      if (reviewSetting?.enabled && reviewSetting?.naverReviewUrl) {
        // sendFrequency가 'first_only'인 경우, 오늘 첫 방문일 때만 발송
        let shouldSendReview = true;
        if (reviewSetting.sendFrequency === 'first_only') {
          shouldSendReview = isFirstVisitTodayTaghere;
          console.log('[TagHere Kakao] first_only mode - isFirstVisitToday:', isFirstVisitTodayTaghere);
        }

        if (shouldSendReview) {
          enqueueNaverReviewAlimTalk({
            storeId: store.id,
            customerId: customer.id,
            phone: phoneNumber,
            variables: {
              storeName: store.name,
              benefitText: reviewSetting.benefitText || '',
            },
          }).catch((err) => {
            console.error('[TagHere Kakao] Review AlimTalk enqueue failed:', err);
          });
        } else {
          console.log('[TagHere Kakao] Skipping Naver review alimtalk - first_only mode and not first visit today');
        }
      }
    }

    // Check if customer already has preferredCategories
    // The customer object includes all fields by default from findFirst/create/update
    const hasPreferences = !!(customer as any).preferredCategories;

    // Redirect back to enroll page with success data (shows popup with feedback)
    const successUrl = new URL(`${redirectOrigin}/taghere-enroll/${stateData.slug || ''}`);
    successUrl.searchParams.set('points', earnPoints.toString());
    successUrl.searchParams.set('successStoreName', store.name);
    successUrl.searchParams.set('customerId', customer.id);
    successUrl.searchParams.set('resultPrice', resultPrice.toString());
    successUrl.searchParams.set('kakaoId', kakaoId);  // 자동 적립을 위해 kakaoId 전달
    successUrl.searchParams.set('hasPreferences', hasPreferences.toString());  // 선호도 선택 여부 전달
    if (stateData.ordersheetId) {
      successUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
    }

    res.redirect(successUrl.toString());
  } catch (error) {
    console.error('TagHere Kakao callback error:', error);
    // 스탬프 모드일 때 스탬프 페이지로, 아니면 포인트 페이지로 리다이렉트
    if (stateData.isStamp) {
      const errorStampPath = (stateData as any).isHitejinro
        ? `/taghere-enroll-stamp-hitejinro/${stateData.slug || ''}`
        : `/taghere-enroll-stamp/${stateData.slug || ''}`;
      res.redirect(`${redirectOrigin}${errorStampPath}?error=callback_error`);
    } else {
      res.redirect(`${redirectOrigin}/taghere-enroll/${stateData.slug || ''}?error=callback_error`);
    }
  }
});

// GET /auth/kakao/store-info - 매장 정보 조회 (공개 API - 엔롤 페이지용)
router.get('/store-info', async (req, res) => {
  try {
    const { storeId } = req.query;

    let store = null;

    if (storeId) {
      store = await prisma.store.findUnique({
        where: { id: storeId as string },
        select: {
          id: true,
          name: true,
        },
      });
    }

    if (!store) {
      // Fallback to first store (for development)
      store = await prisma.store.findFirst({
        select: {
          id: true,
          name: true,
        },
      });
    }

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    console.error('Store info error:', error);
    res.status(500).json({ error: '매장 정보 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
