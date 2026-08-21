import { prisma } from '../lib/prisma.js';
import type { AlimTalkType } from '@prisma/client';

// 템플릿 변수 타입
export interface PointsEarnedVariables {
  storeName: string;
  points: number;
  totalPoints: number;
}

export interface PointsUsedVariables {
  storeName: string;
  usedPoints: number;
  remainingPoints: number;
}

export interface NaverReviewRequestVariables {
  storeName: string;
  benefitText: string;
}

export interface StampEarnedVariables {
  storeName: string;
  earnedStamps: number;
  totalStamps: number;
  stampUsageRule: string;
  reviewGuide: string;
}

// Outbox에 메시지 추가
export async function enqueueAlimTalk(params: {
  storeId: string;
  customerId?: string;
  phone: string;
  messageType: AlimTalkType;
  templateId: string;
  variables: Record<string, string>;
  idempotencyKey: string;
  scheduledAt?: Date;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // 멱등성 체크 - 이미 존재하는 키면 스킵
    const existing = await prisma.alimTalkOutbox.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });

    if (existing) {
      console.log(`[AlimTalk] Duplicate idempotency key: ${params.idempotencyKey}`);
      return { success: true, id: existing.id };
    }

    const outbox = await prisma.alimTalkOutbox.create({
      data: {
        storeId: params.storeId,
        customerId: params.customerId,
        phone: params.phone,
        messageType: params.messageType,
        templateId: params.templateId,
        variables: params.variables,
        idempotencyKey: params.idempotencyKey,
        scheduledAt: params.scheduledAt,
        status: 'PENDING',
      },
    });

    console.log(`[AlimTalk] Enqueued message: ${outbox.id}, type: ${params.messageType}`);
    return { success: true, id: outbox.id };
  } catch (error: any) {
    console.error('[AlimTalk] Enqueue error:', error);
    return { success: false, error: error.message };
  }
}

// 최소 충전금 (5원 미만이면 알림톡 발송 불가)
const MIN_BALANCE_FOR_ALIMTALK = 5;

// 포인트 적립 알림톡 발송 요청
export async function enqueuePointsEarnedAlimTalk(params: {
  storeId: string;
  customerId: string;
  pointLedgerId: string;
  phone: string;
  variables: PointsEarnedVariables;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[AlimTalk] enqueuePointsEarnedAlimTalk called:`, {
    storeId: params.storeId,
    customerId: params.customerId,
    pointLedgerId: params.pointLedgerId,
    phone: params.phone,
    variables: params.variables,
  });

  // 매장 알림톡 설정 및 지갑 잔액 확인
  const store = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: {
      pointsAlimtalkEnabled: true,
      pointUsageRule: true,
      alimtalkDelayEnabled: true,
      alimtalkDelayMinutes: true,
      reviewAutomationSetting: {
        select: { benefitText: true }
      }
    },
  });

  console.log(`[AlimTalk] Store settings:`, {
    pointsAlimtalkEnabled: store?.pointsAlimtalkEnabled,
    hasPointUsageRule: !!store?.pointUsageRule,
    hasBenefitText: !!store?.reviewAutomationSetting?.benefitText,
  });

  if (!store?.pointsAlimtalkEnabled) {
    console.log(`[AlimTalk] Points alimtalk disabled for store: ${params.storeId}`);
    return { success: false, error: 'Points alimtalk disabled' };
  }

  // 충전금 확인 - 5원 미만이면 발송 불가
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
  });

  console.log(`[AlimTalk] Wallet balance check:`, {
    storeId: params.storeId,
    balance: wallet?.balance ?? 0,
    minRequired: MIN_BALANCE_FOR_ALIMTALK,
    canSend: wallet && wallet.balance >= MIN_BALANCE_FOR_ALIMTALK,
  });

  if (!wallet || wallet.balance < MIN_BALANCE_FOR_ALIMTALK) {
    console.log(`[AlimTalk] Insufficient balance for store: ${params.storeId}, balance: ${wallet?.balance ?? 0}`);
    return { success: false, error: 'Insufficient wallet balance' };
  }

  // 환경변수에서 설정 읽기
  const templateId = process.env.SOLAPI_TEMPLATE_ID_POINTS_EARNED;

  console.log(`[AlimTalk] Template ID check:`, {
    templateId: templateId || 'NOT_SET',
    envVarName: 'SOLAPI_TEMPLATE_ID_POINTS_EARNED',
  });

  if (!templateId) {
    console.log(`[AlimTalk] Points earned notification disabled: no template ID configured`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 멱등성 키: storeId + customerId + pointLedgerId
  const idempotencyKey = `points_earned:${params.storeId}:${params.customerId}:${params.pointLedgerId}`;

  // 포인트 사용 규칙 (없으면 기본 문구)
  const usageRule = store.pointUsageRule || '다음 방문 시 사용 가능';

  // 리뷰 작성 안내 문구 (없으면 기본 문구)
  const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';

  // 지연 발송 설정
  const scheduledAt = store.alimtalkDelayEnabled && store.alimtalkDelayMinutes > 0
    ? new Date(Date.now() + store.alimtalkDelayMinutes * 60_000)
    : undefined;

  return enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'POINTS_EARNED',
    templateId,
    variables: {
      '#{매장명}': params.variables.storeName,
      '#{적립포인트}': String(params.variables.points),
      '#{잔여포인트}': String(params.variables.totalPoints),
      '#{사용방법안내}': usageRule,
      '#{리뷰작성법안내}': reviewGuide,
      '#{포인트사용규칙}': usageRule,
    },
    idempotencyKey,
    scheduledAt,
  });
}

// 네이버 리뷰 요청 알림톡 발송 요청
export async function enqueueNaverReviewAlimTalk(params: {
  storeId: string;
  customerId: string;
  phone: string;
  variables: NaverReviewRequestVariables;
  scheduledAt?: Date;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[AlimTalk] enqueueNaverReviewAlimTalk called:`, {
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    variables: params.variables,
  });

  // 환경변수에서 설정 읽기
  const templateId = process.env.SOLAPI_TEMPLATE_ID_REVIEW_REQUEST;
  console.log(`[AlimTalk] Review template ID: ${templateId}`);

  if (!templateId) {
    console.log(`[AlimTalk] Review request notification disabled: no template ID configured`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 충전금 확인 - 5원 미만이면 발송 불가
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
  });

  if (!wallet || wallet.balance < MIN_BALANCE_FOR_ALIMTALK) {
    console.log(`[AlimTalk] Insufficient balance for store: ${params.storeId}, balance: ${wallet?.balance ?? 0}`);
    return { success: false, error: 'Insufficient wallet balance' };
  }

  // 리뷰 자동 발송 설정 및 지연 발송 설정 확인
  const [reviewSetting, storeDelaySetting] = await Promise.all([
    prisma.reviewAutomationSetting.findUnique({
      where: { storeId: params.storeId },
    }),
    prisma.store.findUnique({
      where: { id: params.storeId },
      select: { alimtalkDelayEnabled: true, alimtalkDelayMinutes: true },
    }),
  ]);

  if (!reviewSetting?.enabled) {
    console.log(`[AlimTalk] Review auto-send disabled for store: ${params.storeId}`);
    return { success: false, error: 'Review auto-send disabled' };
  }

  // 네이버 플레이스 URL 필수 체크
  if (!reviewSetting?.naverReviewUrl) {
    console.log(`[AlimTalk] Naver place URL not configured for store: ${params.storeId}`);
    return { success: false, error: 'Naver place URL not configured' };
  }

  // 고유 키: 매번 발송되도록 타임스탬프 사용
  const idempotencyKey = `review_request:${params.storeId}:${params.customerId}:${Date.now()}`;

  // 네이버 플레이스 URL에서 https:// 제거 (버튼 변수용)
  let placeAddress = reviewSetting.naverReviewUrl;
  if (placeAddress.startsWith('https://')) {
    placeAddress = placeAddress.replace('https://', '');
  } else if (placeAddress.startsWith('http://')) {
    placeAddress = placeAddress.replace('http://', '');
  }

  console.log(`[AlimTalk] Enqueuing Naver review alimtalk:`, {
    phone: params.phone,
    templateId,
    benefitText: params.variables.benefitText,
    placeAddress,
    idempotencyKey,
  });

  const result = await enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'NAVER_REVIEW_REQUEST',
    templateId,
    variables: {
      '#{매장명}': params.variables.storeName,
      '#{리뷰내용}': params.variables.benefitText,
      '#{플레이스주소}': placeAddress,
    },
    idempotencyKey,
    scheduledAt: storeDelaySetting?.alimtalkDelayEnabled && storeDelaySetting.alimtalkDelayMinutes > 0
      ? new Date(Date.now() + storeDelaySetting.alimtalkDelayMinutes * 60_000)
      : params.scheduledAt,
  });

  console.log(`[AlimTalk] Naver review enqueue result:`, result);
  return result;
}

// 포인트 사용 완료 알림톡 발송 요청
export async function enqueuePointsUsedAlimTalk(params: {
  storeId: string;
  customerId: string;
  pointLedgerId: string;
  phone: string;
  variables: PointsUsedVariables;
}): Promise<{ success: boolean; error?: string }> {
  // 매장 알림톡 설정 확인
  const store = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: { pointsAlimtalkEnabled: true },
  });

  if (!store?.pointsAlimtalkEnabled) {
    console.log(`[AlimTalk] Points alimtalk disabled for store: ${params.storeId}`);
    return { success: false, error: 'Points alimtalk disabled' };
  }

  // 충전금 확인 - 5원 미만이면 발송 불가
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
  });

  if (!wallet || wallet.balance < MIN_BALANCE_FOR_ALIMTALK) {
    console.log(`[AlimTalk] Insufficient balance for store: ${params.storeId}, balance: ${wallet?.balance ?? 0}`);
    return { success: false, error: 'Insufficient wallet balance' };
  }

  // 환경변수에서 설정 읽기
  const templateId = process.env.SOLAPI_TEMPLATE_ID_POINTS_USED;

  if (!templateId) {
    console.log(`[AlimTalk] Points used notification disabled: no template ID configured`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 멱등성 키: storeId + customerId + pointLedgerId
  const idempotencyKey = `points_used:${params.storeId}:${params.customerId}:${params.pointLedgerId}`;

  return enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'POINTS_EARNED', // 같은 타입 재사용 (POINTS_USED enum 추가 필요시 별도 처리)
    templateId,
    variables: {
      '#{매장명}': params.variables.storeName,
      '#{적립포인트}': String(params.variables.usedPoints),
      '#{잔여포인트}': String(params.variables.remainingPoints),
    },
    idempotencyKey,
  });
}

// 스탬프 적립 알림톡 발송 요청
export async function enqueueStampEarnedAlimTalk(params: {
  storeId: string;
  customerId: string;
  stampLedgerId: string;
  phone: string;
  variables: StampEarnedVariables;
  skipAlimtalkCheck?: boolean; // 프랜차이즈 통합 모드: 호출자가 이미 franchiseStampSetting.alimtalkEnabled 검증 완료
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[AlimTalk] enqueueStampEarnedAlimTalk called:`, {
    storeId: params.storeId,
    customerId: params.customerId,
    stampLedgerId: params.stampLedgerId,
    phone: params.phone,
    variables: params.variables,
    skipAlimtalkCheck: params.skipAlimtalkCheck,
  });

  // 매장 스탬프 알림톡 설정 및 지연 발송 설정 확인
  const [stampSetting, storeDelaySetting] = await Promise.all([
    params.skipAlimtalkCheck
      ? Promise.resolve(null)
      : prisma.stampSetting.findUnique({
          where: { storeId: params.storeId },
          select: { alimtalkEnabled: true },
        }),
    prisma.store.findUnique({
      where: { id: params.storeId },
      select: { alimtalkDelayEnabled: true, alimtalkDelayMinutes: true },
    }),
  ]);

  if (!params.skipAlimtalkCheck && !stampSetting?.alimtalkEnabled) {
    console.log(`[AlimTalk] Stamp alimtalk disabled for store: ${params.storeId}`);
    return { success: false, error: 'Stamp alimtalk disabled' };
  }

  // 충전금 확인 - 5원 미만이면 발송 불가
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
  });

  if (!wallet || wallet.balance < MIN_BALANCE_FOR_ALIMTALK) {
    console.log(`[AlimTalk] Insufficient balance for store: ${params.storeId}, balance: ${wallet?.balance ?? 0}`);
    return { success: false, error: 'Insufficient wallet balance' };
  }

  // 환경변수에서 스탬프 템플릿 ID 읽기
  const templateId = process.env.KAKAO_STAMP_TEMPLATE_CODE;

  if (!templateId) {
    console.log(`[AlimTalk] Stamp earned notification disabled: no template ID configured (KAKAO_STAMP_TEMPLATE_CODE)`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 멱등성 키: storeId + customerId + stampLedgerId
  const idempotencyKey = `stamp_earned:${params.storeId}:${params.customerId}:${params.stampLedgerId}`;

  // 지연 발송 설정
  const scheduledAt = storeDelaySetting?.alimtalkDelayEnabled && storeDelaySetting.alimtalkDelayMinutes > 0
    ? new Date(Date.now() + storeDelaySetting.alimtalkDelayMinutes * 60_000)
    : undefined;

  return enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'STAMP_EARNED',
    templateId,
    variables: {
      '#{매장명}': params.variables.storeName,
      '#{적립스탬프}': String(params.variables.earnedStamps),
      '#{모은스탬프}': String(params.variables.totalStamps),
      '#{스탬프사용규칙}': params.variables.stampUsageRule,
      '#{리뷰작성법안내}': params.variables.reviewGuide,
    },
    idempotencyKey,
    scheduledAt,
  });
}

// 하이트진로 스탬프 적립 알림톡 발송 요청
export async function enqueueHitejinroStampEarnedAlimTalk(params: {
  storeId: string;
  customerId: string;
  stampLedgerId: string;
  phone: string;
  variables: {
    storeName: string;
    earnedStamps: number;
    totalStamps: number;
    stampRewards: string; // 줄바꿈 + 리스트 형태 보상 목록
  };
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[AlimTalk] enqueueHitejinroStampEarnedAlimTalk called:`, {
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
  });

  // 충전금 확인
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
  });

  if (!wallet || wallet.balance < MIN_BALANCE_FOR_ALIMTALK) {
    console.log(`[AlimTalk] Insufficient balance for store: ${params.storeId}`);
    return { success: false, error: 'Insufficient wallet balance' };
  }

  const templateId = process.env.SOLAPI_TEMPLATE_ID_STAMP_HITEJINRO;
  if (!templateId) {
    console.log(`[AlimTalk] HiteJinro stamp template not configured (SOLAPI_TEMPLATE_ID_STAMP_HITEJINRO)`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  const idempotencyKey = `stamp_hitejinro:${params.storeId}:${params.customerId}:${params.stampLedgerId}`;

  // 지연 발송 설정
  const storeDelaySetting = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: { alimtalkDelayEnabled: true, alimtalkDelayMinutes: true },
  });
  const scheduledAt = storeDelaySetting?.alimtalkDelayEnabled && storeDelaySetting.alimtalkDelayMinutes > 0
    ? new Date(Date.now() + storeDelaySetting.alimtalkDelayMinutes * 60_000)
    : undefined;

  return enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'STAMP_EARNED',
    templateId,
    variables: {
      '#{매장명}': params.variables.storeName,
      '#{적립스탬프}': String(params.variables.earnedStamps),
      '#{모은스탬프}': String(params.variables.totalStamps),
      '#{스탬프보상}': params.variables.stampRewards,
      '#{스탬프참여매장}': 'naver.me/FnsNo9P2',
      '#{보상신청}': 'taghere-crm-web-g96p.onrender.com/taghere-my',
    },
    idempotencyKey,
    scheduledAt,
  });
}

// 충전금 부족 안내 알림톡 발송 요청 (매장 소유자에게)
export async function sendLowBalanceAlimTalk(params: {
  storeId: string;
  reason: string; // 발송 실패 이유 (예: "포인트 적립 알림톡", "네이버 리뷰 요청 알림톡")
}): Promise<{ success: boolean; error?: string }> {
  // 환경변수에서 템플릿 ID 읽기
  const templateId = process.env.SOLAPI_TEMPLATE_ID_LOW_BALANCE;

  if (!templateId) {
    console.log(`[AlimTalk] Low balance notification disabled: no template ID configured`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 매장 정보 조회 (매장명, 전화번호)
  const store = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: { name: true, phone: true },
  });

  if (!store?.phone) {
    console.log(`[AlimTalk] Low balance notification skipped: no store phone for store ${params.storeId}`);
    return { success: false, error: 'Store phone not configured' };
  }

  // 매장 잔액 조회
  const wallet = await prisma.wallet.findUnique({
    where: { storeId: params.storeId },
    select: { balance: true },
  });
  const balance = wallet?.balance ?? 0;

  // 하루에 한 번만 발송되도록 멱등성 키 설정 (storeId + KST 날짜)
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]; // KST YYYY-MM-DD
  const idempotencyKey = `low_balance:${params.storeId}:${kstDate}`;

  console.log(`[AlimTalk] Sending low balance notification to store ${params.storeId}, phone: ${store.phone}, balance: ${balance}`);

  return enqueueAlimTalk({
    storeId: params.storeId,
    phone: store.phone,
    messageType: 'LOW_BALANCE',
    templateId,
    variables: {
      '#{상호명}': store.name,
      '#{잔액}': balance.toLocaleString(),
    },
    idempotencyKey,
  });
}

// 기업광고 쿠폰 알림톡 발송 요청
export async function enqueueCorporateAdAlimTalk(params: {
  storeId: string;
  customerId: string;
  phone: string;
  couponId: string;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[AlimTalk] enqueueCorporateAdAlimTalk called:`, {
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    couponId: params.couponId,
  });

  // 특정 쿠폰 조회
  const corporateAd = await prisma.corporateAd.findUnique({
    where: { id: params.couponId },
  });

  if (!corporateAd || !corporateAd.enabled) {
    console.log(`[AlimTalk] Corporate ad disabled or not found:`, corporateAd ? { enabled: corporateAd.enabled, templateId: corporateAd.templateId } : 'null');
    return { success: false, error: 'Corporate ad not configured' };
  }

  // 이미 해당 쿠폰이 오늘 발송된 적 있는지 확인 (매장당 하루 1회)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const kstToday = kstNow.toISOString().split('T')[0]; // YYYY-MM-DD (KST 기준)
  const idempotencyKey = `corporate_ad:${params.storeId}:${params.customerId}:${params.couponId}:${kstToday}`;

  const alreadySent = await prisma.alimTalkOutbox.findFirst({
    where: {
      idempotencyKey,
      status: { not: 'FAILED' },
    },
  });

  if (alreadySent) {
    console.log(`[AlimTalk] Corporate ad coupon ${params.couponId} already sent to customer ${params.customerId}, skipping`);
    return { success: false, error: 'Already sent' };
  }

  // 알림톡 변수 매핑: templateVariables (커스텀) > legacy 표준 매핑
  let variables: Record<string, string>;
  const customVars = corporateAd.templateVariables as
    | { variable: string; value: string }[]
    | null
    | undefined;

  if (Array.isArray(customVars) && customVars.length > 0) {
    variables = {};
    for (const row of customVars) {
      if (row?.variable) {
        variables[row.variable] = row.value ?? '';
      }
    }
  } else {
    // 호환용 폴백: 기존 고정 변수 매핑
    variables = {
      '#{쿠폰명}': corporateAd.couponName,
      '#{쿠폰 내용}': corporateAd.couponContent,
      '#{쿠폰 금액}': corporateAd.couponAmount,
      '#{유효기간}': corporateAd.expiryDate,
      '#{등록방법}': corporateAd.registrationMethod,
      '#{랜딩 링크}': corporateAd.landingLink,
      '#{쿠폰 링크}': corporateAd.couponLink,
    };
  }

  // 난수 쿠폰 코드 자동 할당 (couponCodeVariable이 설정된 경우)
  const codeVar = (corporateAd.couponCodeVariable || '').trim();
  if (codeVar) {
    const claimedCode = await prisma.$transaction(async (tx) => {
      const free = await tx.couponCode.findFirst({
        where: { corporateAdId: corporateAd.id, usedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, code: true },
      });
      if (!free) return null;
      // optimistic locking: 다른 트랜잭션이 먼저 잡았으면 count === 0
      const updateRes = await tx.couponCode.updateMany({
        where: { id: free.id, usedAt: null },
        data: { usedAt: new Date(), usedByCustomerId: params.customerId },
      });
      if (updateRes.count === 0) return null;
      return free.code;
    });

    if (!claimedCode) {
      console.error(`[CorporateAd] No coupon codes available for ${corporateAd.id} (${corporateAd.brandName})`);
      return { success: false, error: 'No coupon codes available' };
    }

    variables[codeVar] = claimedCode;
    console.log(`[CorporateAd] Claimed code for ${corporateAd.id}: ${claimedCode}`);
  }

  return enqueueAlimTalk({
    storeId: params.storeId,
    customerId: params.customerId,
    phone: params.phone,
    messageType: 'CORPORATE_AD',
    templateId: corporateAd.templateId,
    variables,
    idempotencyKey,
  });
}
