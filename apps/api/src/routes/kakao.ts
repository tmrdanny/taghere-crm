import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueNaverReviewAlimTalk, enqueuePointsEarnedAlimTalk } from '../services/solapi.js';

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
      fixedPointEnabled: true,
      fixedPointAmount: true,
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

    // Calculate points to earn (고정 포인트 사용)
    let earnPoints = 100; // Default

    if (store.fixedPointEnabled && store.fixedPointAmount > 0) {
      earnPoints = store.fixedPointAmount;
    }

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
        naverReviewUrl: reviewSetting?.naverReviewUrl,
        benefitText: reviewSetting?.benefitText,
      });

      if (reviewSetting?.enabled && reviewSetting?.naverReviewUrl) {
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
  tableNumber?: string;
  orderItems?: any[];
  items?: any[];
  content?: {
    resultPrice?: number | string;
    totalPrice?: number | string;
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
  const { storeId, ordersheetId, slug } = req.query;

  if (!KAKAO_CLIENT_ID) {
    console.log('Kakao OAuth not configured, using dev mode');
    const successUrl = new URL(`${PUBLIC_APP_URL}/taghere-enroll/success`);
    successUrl.searchParams.set('points', '100');
    successUrl.searchParams.set('storeName', '태그히어 (개발모드)');
    successUrl.searchParams.set('devMode', 'true');
    return res.redirect(successUrl.toString());
  }

  // Build state parameter with ordersheetId
  const state = Buffer.from(
    JSON.stringify({
      storeId: storeId || '',
      ordersheetId: ordersheetId || '',
      slug: slug || '',
      isTaghere: true,
    })
  ).toString('base64');

  // TagHere 전용 콜백 URL
  const tagherRedirectUri = KAKAO_REDIRECT_URI.replace('/callback', '/taghere-callback');

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(tagherRedirectUri)}&response_type=code&state=${state}&scope=profile_nickname,account_email,phone_number,gender,birthday,birthyear`;

  res.redirect(kakaoAuthUrl);
});

// GET /auth/kakao/taghere-callback - TagHere 전용 카카오 로그인 콜백
router.get('/taghere-callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('Kakao OAuth error:', error, error_description);
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=${error}`);
    }

    if (!code) {
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=no_code`);
    }

    // Parse state
    let stateData = { storeId: '', ordersheetId: '', slug: '', isTaghere: true };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch (e) {
      console.error('Failed to parse state:', e);
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
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=token_error`);
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
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=user_error`);
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
      pointRateEnabled: true,
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
      return res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=store_not_found`);
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
        const alreadyUrl = new URL(`${PUBLIC_APP_URL}/taghere-enroll/${stateData.slug || ''}`);
        alreadyUrl.searchParams.set('error', 'already_participated');
        alreadyUrl.searchParams.set('storeName', store.name);
        if (stateData.ordersheetId) alreadyUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
        return res.redirect(alreadyUrl.toString());
      }
    }

    // TagHere API에서 주문 정보 조회 (slug 기반으로 Dev/Prod API 선택)
    let resultPrice = 0;
    let orderItems: any[] = [];
    let tableNumber: string | null = null;
    if (stateData.ordersheetId) {
      const orderData = await fetchOrdersheetForCallback(stateData.ordersheetId, stateData.slug);
      if (orderData) {
        // resultPrice는 content.resultPrice에 있고, 문자열일 수 있음
        const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
        resultPrice = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;
        // 테이블 번호 추출
        tableNumber = orderData.content?.tableNumber || orderData.tableNumber || null;
        // 주문 아이템 정보 - TagHere API 응답 구조에 따라 추출
        const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
        // items 구조 로깅 (디버깅용)
        console.log('[TagHere Kakao] Raw items structure:', JSON.stringify(rawItems, null, 2));
        // 아이템 정규화 - 다양한 필드명 지원 (TagHere API는 label 필드 사용)
        orderItems = rawItems.map((item: any) => ({
          name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
          quantity: item.count || item.quantity || item.qty || item.amount || 1,
          price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
        }));
        console.log('[TagHere Kakao] Normalized items:', JSON.stringify(orderItems, null, 2));
        console.log('[TagHere Kakao] Table number:', tableNumber);
      }
    }

    // 적립률 기반 포인트 계산 (기본 5%)
    const ratePercent = store.pointRatePercent || 5;
    const earnPoints = resultPrice > 0 ? Math.floor(resultPrice * ratePercent / 100) : 100;

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
          items: orderItems.length > 0 || tableNumber ? {
            items: orderItems,
            tableNumber: tableNumber,
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
      }
    }

    // Redirect back to enroll page with success data (shows popup with feedback)
    const successUrl = new URL(`${PUBLIC_APP_URL}/taghere-enroll/${stateData.slug || ''}`);
    successUrl.searchParams.set('points', earnPoints.toString());
    successUrl.searchParams.set('successStoreName', store.name);
    successUrl.searchParams.set('customerId', customer.id);
    successUrl.searchParams.set('resultPrice', resultPrice.toString());
    if (stateData.ordersheetId) {
      successUrl.searchParams.set('ordersheetId', stateData.ordersheetId);
    }

    res.redirect(successUrl.toString());
  } catch (error) {
    console.error('TagHere Kakao callback error:', error);
    res.redirect(`${PUBLIC_APP_URL}/taghere-enroll?error=callback_error`);
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
          fixedPointEnabled: true,
          fixedPointAmount: true,
        },
      });
    }

    if (!store) {
      // Fallback to first store (for development)
      store = await prisma.store.findFirst({
        select: {
          id: true,
          name: true,
          fixedPointEnabled: true,
          fixedPointAmount: true,
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
