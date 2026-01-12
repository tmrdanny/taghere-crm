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
  }): Promise<{ success: boolean; messageId?: string; groupId?: string; error?: string }> {
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

      // SOLAPI 응답 처리 - 접수 성공만 확인 (실제 발송 결과는 나중에 조회)
      if (result.groupInfo?.count?.total > 0) {
        return {
          success: true,
          messageId: result.groupInfo?.groupId,
          groupId: result.groupInfo?.groupId,
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

  // SOLAPI 에러 코드 → 한글 메시지 매핑
  private getFailReasonKorean(statusCode: string, statusMessage?: string): string {
    // statusMessage가 있고 의미있는 값이면 그대로 사용
    if (statusMessage && statusMessage.length > 0 && !statusMessage.startsWith('Failed')) {
      return statusMessage;
    }

    // SOLAPI 에러 코드별 한글 메시지
    // 참고: 3000은 "이통사 접수 중"으로 PENDING 상태이며, 여기서 처리되지 않음
    const errorMessages: Record<string, string> = {
      // '3000': 이통사 접수 중 (PENDING으로 처리됨, 에러 아님)
      '3001': '잘못된 전화번호',
      '3002': '수신거부',
      '3003': '기타 오류',
      '3004': '단말기 전원 꺼짐',
      '3005': '메시지 삭제됨',
      '3006': '음영지역',
      '3007': '단말기 메시지 풀',
      '3008': '일시정지',
      '3009': '기타 오류',
      '3010': '사용자 없음',
      '3011': '발신번호 차단',
      '3012': '스팸 차단',
      '3013': '발신번호 사전등록 필요',
      '3014': '결번',
      '3015': '서비스 불가 단말기',
      '3016': '착신 거부',
      '3017': 'SPAM',
      '3018': '휴대폰 호 처리 중',
      '3019': '기타 단말기 문제',
      '3020': '가입자 없음',
      '3021': '단말기 일시정지',
      '3022': '카카오톡 미사용자',
      '3023': '카카오 시스템 오류',
      '3024': '카카오 템플릿 오류',
      '3025': '카카오 발신프로필 오류',
      '3026': '친구톡 수신거부',
      '3027': '카카오 메시지 형식 오류',
      '3028': '카카오 이미지 오류',
      '3029': '카카오 전화번호 형식 오류',
      '3030': '카카오 버튼 오류',
      '3031': '카카오 기타 오류',
      '3032': '카카오 변수 오류',
      '3033': '카카오 일일 발송량 초과',
      '3034': '카카오 발송 불가 시간',
      '3100': '카카오 비즈메시지 전환 발송 실패',
      '3104': '카카오톡 미사용자',
      '3108': '카카오 전화번호 형식 오류',
      '3110': '카카오 발송 실패',
      '3120': '알림톡 발송 실패 (대체 발송됨)',
    };

    return errorMessages[statusCode] || `발송 실패 (${statusCode})`;
  }

  // 메시지 그룹 상태 조회 (특정 전화번호로 필터링 가능)
  async getMessageStatus(groupId: string, targetPhone?: string): Promise<{
    success: boolean;
    status?: 'PENDING' | 'SENT' | 'FAILED';
    failReason?: string;
    error?: string;
  }> {
    if (!this.messageService) {
      return { success: false, error: 'SOLAPI not configured' };
    }

    try {
      // SOLAPI getMessages로 그룹 내 메시지 조회
      const result = await this.messageService.getMessages({ groupId });

      console.log('[SOLAPI] Message status result:', JSON.stringify(result, null, 2));

      if (result.messageList && Object.keys(result.messageList).length > 0) {
        const messages = Object.values(result.messageList) as any[];

        // 모든 메시지 정보 로깅
        console.log('[SOLAPI] All messages in group:', messages.map((m: any) => ({
          to: m.to,
          statusCode: m.statusCode,
          statusMessage: m.statusMessage,
        })));

        // 특정 전화번호가 지정된 경우 해당 번호의 메시지만 찾기
        let targetMessage = messages[0];
        if (targetPhone) {
          const normalizedTarget = this.normalizePhoneNumber(targetPhone);
          console.log('[SOLAPI] Looking for phone:', normalizedTarget);

          const foundMessage = messages.find((msg) => {
            const msgPhone = this.normalizePhoneNumber(msg.to || '');
            console.log('[SOLAPI] Comparing:', { msgPhone, normalizedTarget, match: msgPhone === normalizedTarget });
            return msgPhone === normalizedTarget;
          });

          if (foundMessage) {
            targetMessage = foundMessage;
            console.log('[SOLAPI] Found matching message for phone:', targetPhone);
          } else {
            console.log('[SOLAPI] No matching message found for phone:', targetPhone, '- using first message');
          }
        }

        const statusCode = targetMessage?.statusCode;
        const statusMessage = targetMessage?.statusMessage;

        console.log('[SOLAPI] Target message status:', { phone: targetPhone, to: targetMessage?.to, statusCode, statusMessage, status: targetMessage?.status });

        // SOLAPI 상태 코드 매핑
        // 2xxx: 발송 대기/처리중
        // 3000: 이통사 접수 중 (아직 결과 없음) - PENDING으로 처리
        // 3001~3999: 발송 실패
        // 4xxx: 발송 성공
        if (statusCode?.startsWith('4')) {
          return { success: true, status: 'SENT' };
        } else if (statusCode === '3000') {
          // 3000은 이통사에 접수되어 리포트를 기다리는 중 - 아직 결과 없음
          console.log('[SOLAPI] Status 3000 = waiting for carrier report, treating as PENDING');
          return { success: true, status: 'PENDING' };
        } else if (statusCode?.startsWith('3')) {
          return { success: true, status: 'FAILED', failReason: this.getFailReasonKorean(statusCode, statusMessage) };
        } else if (statusCode?.startsWith('2')) {
          return { success: true, status: 'PENDING' };
        }

        // 알 수 없는 상태코드
        return { success: true, status: 'PENDING' };
      }

      return { success: false, error: 'No messages found in group' };
    } catch (error: any) {
      console.error('[SOLAPI] Get message status error:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  // 브랜드 메시지 자유형 발송
  async sendBrandMessage(params: {
    to: string;
    pfId: string;
    content: string;
    messageType: 'TEXT' | 'IMAGE';
    imageId?: string;
    buttons?: BrandMessageButton[];
  }): Promise<{ success: boolean; messageId?: string; groupId?: string; error?: string }> {
    if (!this.messageService) {
      return { success: false, error: 'SOLAPI not configured' };
    }

    try {
      // 전화번호 정규화
      const normalizedPhone = this.normalizePhoneNumber(params.to);

      // 버튼 형식 변환 (Solapi 형식)
      const solapiButtons = params.buttons?.map((btn) => ({
        buttonType: btn.type,
        buttonName: btn.name,
        linkMo: btn.linkMo,
        linkPc: btn.linkPc || btn.linkMo,
      }));

      // 브랜드 메시지 자유형(BMS_FREE) 발송 요청 구성
      const sendParams: any = {
        to: normalizedPhone,
        from: '07041380263', // 발신번호 고정
        type: 'BMS_FREE', // 브랜드 메시지 자유형 타입 명시
        text: params.content, // BMS는 text 필드 사용
        kakaoOptions: {
          pfId: params.pfId,
          disableSms: true, // SMS 폴백 비활성화
          buttons: solapiButtons,
        },
      };

      // 이미지형인 경우 이미지 추가
      if (params.messageType === 'IMAGE' && params.imageId) {
        sendParams.kakaoOptions.imageId = params.imageId;
      }

      console.log('[SOLAPI] Sending Brand Message:', JSON.stringify(sendParams, null, 2));

      const result = await this.messageService.send(sendParams);

      console.log('[SOLAPI] Brand Message result:', JSON.stringify(result, null, 2));

      // SOLAPI 응답 처리
      if (result.groupInfo?.count?.total > 0) {
        return {
          success: true,
          messageId: result.groupInfo?.groupId,
          groupId: result.groupInfo?.groupId,
        };
      }

      return {
        success: false,
        error: 'No messages sent',
      };
    } catch (error: any) {
      console.error('[SOLAPI] Brand Message send error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  // 이미지 업로드 (브랜드 메시지용)
  async uploadImage(filePath: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
    if (!this.messageService) {
      return { success: false, error: 'SOLAPI not configured' };
    }

    try {
      const result = await this.messageService.uploadFile(filePath, 'KAKAO');

      console.log('[SOLAPI] Image upload result:', JSON.stringify(result, null, 2));

      if (result.fileId) {
        return { success: true, fileId: result.fileId };
      }

      return { success: false, error: 'Failed to upload image' };
    } catch (error: any) {
      console.error('[SOLAPI] Image upload error:', error);
      return { success: false, error: error.message || 'Unknown error' };
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

// 브랜드 메시지 자유형 버튼 인터페이스
export interface BrandMessageButton {
  type: 'WL'; // 웹링크만 지원
  name: string; // 버튼명 (최대 14자)
  linkMo: string; // 모바일 URL (필수)
  linkPc?: string; // PC URL (선택)
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
