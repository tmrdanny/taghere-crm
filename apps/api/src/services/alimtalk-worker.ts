import { prisma } from '../lib/prisma.js';
import { SolapiService, sendLowBalanceAlimTalk } from './solapi.js';

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 5000; // 5초마다 폴링
const MAX_RETRIES = 3;
const LOW_BALANCE_THRESHOLD = 400; // 충전금 부족 알림 기준 (400원 미만)

// 알림톡 건당 비용 (메시지 타입별)
const ALIMTALK_COSTS: Record<string, number> = {
  POINTS_EARNED: 20,      // 포인트 적립 알림톡: 20원
  POINTS_USED: 20,        // 포인트 사용 알림톡: 20원
  NAVER_REVIEW_REQUEST: 50, // 네이버 리뷰 요청 알림톡: 50원
};
const DEFAULT_COST = 20; // 기본 비용

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

// 글로벌 SOLAPI 서비스 인스턴스 (환경변수 기반)
let globalSolapiService: SolapiService | null = null;

// SOLAPI 서비스 가져오기 (환경변수에서 설정 읽기)
function getSolapiService(): SolapiService | null {
  if (globalSolapiService) {
    return globalSolapiService;
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.log(`[Worker] No SOLAPI credentials configured in environment variables`);
    return null;
  }

  globalSolapiService = new SolapiService(apiKey, apiSecret);
  return globalSolapiService;
}

// 단일 메시지 처리
async function processMessage(messageId: string): Promise<void> {
  // 메시지 조회 및 상태를 PROCESSING으로 변경 (낙관적 잠금)
  const message = await prisma.alimTalkOutbox.updateMany({
    where: {
      id: messageId,
      status: { in: ['PENDING', 'RETRY'] },
    },
    data: {
      status: 'PROCESSING',
      updatedAt: new Date(),
    },
  });

  if (message.count === 0) {
    console.log(`[Worker] Message ${messageId} already being processed or completed`);
    return;
  }

  // 메시지 상세 조회
  const msg = await prisma.alimTalkOutbox.findUnique({
    where: { id: messageId },
  });

  if (!msg) return;

  try {
    // LOW_BALANCE 타입은 비용 없이 무료 발송 (충전금 부족 안내이므로)
    const isLowBalanceMessage = msg.messageType === 'LOW_BALANCE';

    // 메시지 타입에 따른 비용 결정 (LOW_BALANCE는 무료)
    const cost = isLowBalanceMessage ? 0 : (ALIMTALK_COSTS[msg.messageType] || DEFAULT_COST);

    // LOW_BALANCE가 아닌 경우에만 잔액 확인
    if (!isLowBalanceMessage) {
      const wallet = await prisma.wallet.findUnique({
        where: { storeId: msg.storeId },
      });

      if (!wallet || wallet.balance < cost) {
        console.log(`[Worker] Insufficient balance for message ${messageId}, balance: ${wallet?.balance ?? 0}, required: ${cost}`);
        // 메시지 상태를 FAILED로 변경
        await prisma.alimTalkOutbox.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            failReason: 'Insufficient wallet balance',
            updatedAt: new Date(),
          },
        });
        // 잔액이 400원 미만이면 충전금 부족 안내 알림톡 발송
        if (!wallet || wallet.balance < LOW_BALANCE_THRESHOLD) {
          sendLowBalanceAlimTalk({ storeId: msg.storeId, reason: '알림톡 발송' }).catch((err) => {
            console.error(`[Worker] Failed to send low balance notification:`, err);
          });
        }
        return;
      }
    }

    // 환경변수에서 pfId 읽기
    const pfId = process.env.SOLAPI_PF_ID;

    if (!pfId) {
      throw new Error('SOLAPI_PF_ID not configured in environment variables');
    }

    // SOLAPI 서비스 가져오기
    const solapiService = getSolapiService();
    if (!solapiService) {
      throw new Error('SOLAPI service not available');
    }

    // 알림톡 발송
    const result = await solapiService.sendAlimTalk({
      to: msg.phone,
      pfId,
      templateId: msg.templateId,
      variables: msg.variables as Record<string, string>,
    });

    if (result.success) {
      if (isLowBalanceMessage) {
        // LOW_BALANCE 메시지는 무료 - 상태만 업데이트
        await prisma.alimTalkOutbox.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            solapiMessageId: result.messageId,
            sentAt: new Date(),
            updatedAt: new Date(),
          },
        });
        console.log(`[Worker] Low balance notification ${messageId} sent successfully (free), SOLAPI ID: ${result.messageId}`);
      } else {
        // 일반 메시지 - 트랜잭션으로 상태 업데이트 + 지갑 차감
        await prisma.$transaction(async (tx) => {
          // 1. 메시지 상태 업데이트
          await tx.alimTalkOutbox.update({
            where: { id: messageId },
            data: {
              status: 'SENT',
              solapiMessageId: result.messageId,
              sentAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // 2. 지갑 잔액 차감
          await tx.wallet.update({
            where: { storeId: msg.storeId },
            data: { balance: { decrement: cost } },
          });

          // 3. 결제 트랜잭션 로그 생성
          await tx.paymentTransaction.create({
            data: {
              storeId: msg.storeId,
              amount: -cost,
              type: 'ALIMTALK_SEND',
              status: 'SUCCESS',
              meta: {
                messageId: messageId,
                messageType: msg.messageType,
                phone: msg.phone,
                unitCost: cost,
              },
            },
          });
        });

        console.log(`[Worker] Message ${messageId} (${msg.messageType}) sent successfully, SOLAPI ID: ${result.messageId}, cost: ${cost}원 차감`);

        // 차감 후 잔액 확인 - 400원 미만이면 충전금 부족 알림톡 발송
        const updatedWallet = await prisma.wallet.findUnique({
          where: { storeId: msg.storeId },
        });
        if (updatedWallet && updatedWallet.balance < LOW_BALANCE_THRESHOLD) {
          console.log(`[Worker] Low balance detected for store ${msg.storeId}: ${updatedWallet.balance}원`);
          sendLowBalanceAlimTalk({ storeId: msg.storeId, reason: '알림톡 발송 후 잔액 부족' }).catch((err) => {
            console.error(`[Worker] Failed to send low balance notification:`, err);
          });
        }
      }
    } else {
      throw new Error(result.error || 'Send failed');
    }
  } catch (error: any) {
    console.error(`[Worker] Message ${messageId} failed:`, error.message);

    const currentRetry = msg.retryCount + 1;
    const shouldRetry = currentRetry < MAX_RETRIES;

    await prisma.alimTalkOutbox.update({
      where: { id: messageId },
      data: {
        status: shouldRetry ? 'RETRY' : 'FAILED',
        retryCount: currentRetry,
        failReason: error.message,
        updatedAt: new Date(),
      },
    });

    if (shouldRetry) {
      console.log(`[Worker] Message ${messageId} will retry (${currentRetry}/${MAX_RETRIES})`);
    } else {
      console.log(`[Worker] Message ${messageId} failed permanently after ${MAX_RETRIES} retries`);
    }
  }
}

// 배치 처리
async function processBatch(): Promise<number> {
  // PENDING 또는 RETRY 상태의 메시지 조회
  const messages = await prisma.alimTalkOutbox.findMany({
    where: {
      status: { in: ['PENDING', 'RETRY'] },
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (messages.length === 0) {
    return 0;
  }

  console.log(`[Worker] Processing ${messages.length} messages`);

  // 병렬 처리 (제한적)
  await Promise.all(messages.map((msg) => processMessage(msg.id)));

  return messages.length;
}

// 워커 시작
export function startAlimTalkWorker(): void {
  if (isRunning) {
    console.log('[Worker] AlimTalk worker already running');
    return;
  }

  isRunning = true;
  console.log('[Worker] Starting AlimTalk worker...');

  const poll = async () => {
    if (!isRunning) return;

    try {
      const processed = await processBatch();
      if (processed > 0) {
        console.log(`[Worker] Processed ${processed} messages`);
      }
    } catch (error) {
      console.error('[Worker] Error in poll cycle:', error);
    }
  };

  // 즉시 한 번 실행
  poll();

  // 주기적으로 폴링
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

// 워커 중지
export function stopAlimTalkWorker(): void {
  if (!isRunning) return;

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log('[Worker] AlimTalk worker stopped');
}

// 캐시 초기화 (설정 변경 시 호출)
export function clearSolapiCache(): void {
  globalSolapiService = null;
}
