import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueNaverReviewAlimTalk, enqueuePointsEarnedAlimTalk } from '../services/solapi.js';

const router = Router();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const NAVER_REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://localhost:4000/auth/naver/callback';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

// GET /auth/naver/start - 네이버 로그인 시작
router.get('/start', (req, res) => {
  const { storeId, orderId, redirect } = req.query;

  // 네이버 OAuth가 설정되지 않은 경우 개발용 모드로 바로 성공 페이지로 이동
  if (!NAVER_CLIENT_ID) {
    console.log('Naver OAuth not configured, using dev mode');
    const successUrl = new URL(`${PUBLIC_APP_URL}/naver-enroll/success`);
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

  const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_REDIRECT_URI)}&response_type=code&state=${state}`;

  res.redirect(naverAuthUrl);
});

// GET /auth/naver/callback - 네이버 로그인 콜백
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('Naver OAuth error:', error, error_description);
      return res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=${error}`);
    }

    if (!code) {
      return res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=no_code`);
    }

    // Parse state
    let stateData = { storeId: '', orderId: '', redirect: '' };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch (e) {
      console.error('Failed to parse state:', e);
    }

    // Exchange code for token
    const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: NAVER_CLIENT_ID,
        client_secret: NAVER_CLIENT_SECRET,
        code: code as string,
        state: state as string,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      error?: string;
      error_description?: string;
      access_token?: string;
    };

    if (tokenData.error) {
      console.error('Naver token error:', tokenData);
      return res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=token_error`);
    }

    // Get user info
    const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json() as {
      resultcode?: string;
      message?: string;
      response?: {
        id?: string;
        nickname?: string;
        name?: string;
        email?: string;
        mobile?: string;
        mobile_e164?: string;
        gender?: string;      // M, F, U
        birthday?: string;    // MM-DD 형식
        birthyear?: string;   // YYYY 형식
        profile_image?: string;
      };
    };

    if (userData.resultcode !== '00' || !userData.response?.id) {
      console.error('Naver user error:', userData);
      return res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=user_error`);
    }

    const naverUser = userData.response;

    // 네이버에서 받은 전체 사용자 데이터 로그
    console.log('=== 네이버 로그인 사용자 데이터 ===');
    console.log(JSON.stringify(naverUser, null, 2));
    console.log('================================');
    const naverId = naverUser.id;
    const naverNickname = naverUser.nickname || null;

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
      return res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=store_not_found`);
    }

    // 전화번호 정규화 (네이버는 010-1234-5678 또는 01012345678 형식)
    const phoneLastDigits = naverUser.mobile
      ? naverUser.mobile.replace(/[^0-9]/g, '').slice(-8)
      : null;

    // 고객 찾기: 이 매장에서 naverId 또는 phoneLastDigits로 검색 (매장별 고객 관리)
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        naverId,
      },
    });

    // naverId로 찾지 못한 경우, 이 매장에서 phoneLastDigits로 검색
    if (!customer && phoneLastDigits) {
      customer = await prisma.customer.findFirst({
        where: {
          storeId: store.id,
          phoneLastDigits,
        },
      });
    }

    // 오늘 00시 기준 시간 계산 (KST 기준)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstTodayStart = new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0, 0) - kstOffset
    );

    // 성별 변환 (네이버: M, F, U → DB: MALE, FEMALE, null)
    const genderMap: { [key: string]: 'MALE' | 'FEMALE' | null } = {
      'M': 'MALE',
      'F': 'FEMALE',
    };
    const gender = naverUser.gender ? (genderMap[naverUser.gender] || null) : null;

    if (!customer) {
      // 신규 고객 생성
      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          naverId,
          naverNickname,
          name: naverUser.nickname || naverUser.name || null,
          phone: naverUser.mobile || null,
          phoneLastDigits,
          gender,
          birthday: naverUser.birthday || null, // 네이버는 이미 MM-DD 형식
          birthYear: naverUser.birthyear ? parseInt(naverUser.birthyear) : null,
          consentMarketing: true,
          consentAt: new Date(),
          totalPoints: 0,
          visitCount: 1, // 신규 고객은 첫 방문
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
      //   const alreadyUrl = new URL(`${PUBLIC_APP_URL}/naver-enroll`);
      //   alreadyUrl.searchParams.set('error', 'already_participated');
      //   alreadyUrl.searchParams.set('storeName', store.name);
      //   if (stateData.storeId) alreadyUrl.searchParams.set('storeId', stateData.storeId);
      //   return res.redirect(alreadyUrl.toString());
      // }

      // 기존 고객 정보 업데이트 (naverId, naverNickname, 이름, 성별, 생일 등)
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          naverId: customer.naverId || naverId, // naverId가 없으면 연결
          naverNickname: naverNickname || customer.naverNickname,
          name: naverUser.nickname || naverUser.name || customer.name,
          phone: naverUser.mobile || customer.phone,
          phoneLastDigits: phoneLastDigits || customer.phoneLastDigits,
          gender: gender || customer.gender,
          birthday: customer.birthday || naverUser.birthday || null,
          birthYear: customer.birthYear || (naverUser.birthyear ? parseInt(naverUser.birthyear) : null),
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

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          visitCount: { increment: 1 },
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
          reason: '네이버 로그인 적립',
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
          console.error('[Naver] Points AlimTalk enqueue failed:', err);
        });
      }

      // 2. 네이버 리뷰 요청 알림톡 (reviewAutoSendEnabled가 true인 경우)
      const reviewSetting = await prisma.reviewAutomationSetting.findUnique({
        where: { storeId: store.id },
      });

      console.log('[Naver] Review setting:', {
        enabled: reviewSetting?.enabled,
        naverReviewUrl: reviewSetting?.naverReviewUrl,
        benefitText: reviewSetting?.benefitText,
      });

      if (reviewSetting?.enabled && reviewSetting?.naverReviewUrl) {
        console.log('[Naver] Sending Naver review alimtalk...');
        enqueueNaverReviewAlimTalk({
          storeId: store.id,
          customerId: customer.id,
          phone: phoneNumber,
          variables: {
            storeName: store.name,
            benefitText: reviewSetting.benefitText || '',
          },
        }).catch((err) => {
          console.error('[Naver] Review AlimTalk enqueue failed:', err);
        });
      } else {
        console.log('[Naver] Skipping Naver review alimtalk - not enabled or no URL');
      }
    }

    // Redirect back to enroll page with success data (shows popup)
    const successUrl = new URL(`${PUBLIC_APP_URL}/naver-enroll`);
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
    console.error('Naver callback error:', error);
    res.redirect(`${PUBLIC_APP_URL}/naver-enroll?error=callback_error`);
  }
});

// GET /auth/naver/store-info - 매장 정보 조회 (공개 API - 엔롤 페이지용)
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
