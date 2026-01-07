import { SolapiMessageService } from 'solapi';
import { prisma } from '../lib/prisma.js';
import type { AlimTalkType, AlimTalkStatus } from '@prisma/client';

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

// SOLAPI 서비스 클래스
export class SolapiService {
  private messageService: SolapiMessageService | null = null;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    if (apiKey && apiSecret) {
      this.messageService = new SolapiMessageService(apiKey, apiSecret);
    }
  }

  // 전화번호 형식 정규화 (01012345678 형태로 변환)
  private normalizePhoneNumber(phone: string): string {
    // 숫자만 추출
    let digits = phone.replace(/[^0-9]/g, '');

    // 82로 시작하면 국가코드 제거하고 0 추가
    if (digits.startsWith('82')) {
      digits = '0' + digits.slice(2);
    }

    // 0으로 시작하지 않으면 0 추가
    if (!digits.startsWith('0')) {
      digits = '0' + digits;
    }

    return digits;
  }

  // 알림톡 발송
  async sendAlimTalk(params: {
    to: string;
    pfId: string;
    templateId: string;
    variables: Record<string, string>;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.messageService) {
      return { success: false, error: 'SOLAPI not configured' };
    }

    try {
      // 전화번호 정규화
      const normalizedPhone = this.normalizePhoneNumber(params.to);

      // 알림톡(ATA) 발송 요청 구성
      const sendParams: any = {
        to: normalizedPhone,
        from: '07041380263', // 발신번호 고정
        type: 'ATA', // 알림톡 타입 명시
        kakaoOptions: {
          pfId: params.pfId,
          templateId: params.templateId,
          variables: params.variables,
        },
      };

      console.log('[SOLAPI] Sending ATA message:', JSON.stringify(sendParams, null, 2));

      const result = await this.messageService.send(sendParams);

      console.log('[SOLAPI] Send result:', JSON.stringify(result, null, 2));

      // SOLAPI 응답 처리
      if (result.groupInfo?.count?.total > 0) {
        return {
          success: true,
          messageId: result.groupInfo?.groupId,
        };
      }

      return {
        success: false,
        error: 'No messages sent',
      };
    } catch (error: any) {
      console.error('[SOLAPI] Send error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
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
  // 매장 알림톡 설정 및 지갑 잔액 확인
  const store = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: { pointsAlimtalkEnabled: true, pointUsageRule: true },
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
  const templateId = process.env.SOLAPI_TEMPLATE_ID_POINTS_EARNED;

  if (!templateId) {
    console.log(`[AlimTalk] Points earned notification disabled: no template ID configured`);
    return { success: false, error: 'AlimTalk template not configured' };
  }

  // 멱등성 키: storeId + customerId + pointLedgerId
  const idempotencyKey = `points_earned:${params.storeId}:${params.customerId}:${params.pointLedgerId}`;

  // 포인트 사용 규칙 (없으면 기본 문구)
  const usageRule = store.pointUsageRule || '다음 방문 시 사용 가능';

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
    },
    idempotencyKey,
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

  // 리뷰 자동 발송 설정 확인
  const reviewSetting = await prisma.reviewAutomationSetting.findUnique({
    where: { storeId: params.storeId },
  });

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
    scheduledAt: params.scheduledAt,
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

  // 하루에 한 번만 발송되도록 멱등성 키 설정 (storeId + 날짜)
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const idempotencyKey = `low_balance:${params.storeId}:${today}`;

  console.log(`[AlimTalk] Sending low balance notification to store ${params.storeId}, phone: ${store.phone}`);

  return enqueueAlimTalk({
    storeId: params.storeId,
    phone: store.phone,
    messageType: 'LOW_BALANCE',
    templateId,
    variables: {
      '#{상호명}': store.name,
    },
    idempotencyKey,
  });
}
