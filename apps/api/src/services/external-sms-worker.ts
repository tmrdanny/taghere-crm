import { prisma } from '../lib/prisma.js';
import { SolapiService } from './solapi.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 5000; // 5초마다 폴링
const MIN_AGE_MS = 3000; // 최소 3초 경과한 메시지만 처리 (SOLAPI 처리 시간 고려)
const EXTERNAL_SMS_COST = 250; // 건당 비용

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

// 글로벌 SOLAPI 서비스 인스턴스
let globalSolapiService: SolapiService | null = null;

function getSolapiService(): SolapiService | null {
  if (globalSolapiService) {
    return globalSolapiService;
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.log(`[External SMS Worker] No SOLAPI credentials configured`);
    return null;
  }

  globalSolapiService = new SolapiService(apiKey, apiSecret);
  return globalSolapiService;
}

// 월요일 기준 주차 시작일 계산
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 단일 메시지 처리
async function processMessage(messageId: string): Promise<void> {
  const msg = await prisma.externalSmsMessage.findUnique({
    where: { id: messageId },
    include: { campaign: true, externalCustomer: true },
  });

  if (!msg || msg.status !== 'PENDING') {
    return;
  }

  // groupId 없으면 처리 불가
  if (!msg.solapiGroupId) {
    console.log(`[External SMS Worker] Message ${messageId} has no groupId, marking as FAILED`);
    await prisma.externalSmsMessage.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        failReason: 'No SOLAPI group ID',
        cost: 0,
      },
    });
    return;
  }

  const solapiService = getSolapiService();
  if (!solapiService) {
    console.log(`[External SMS Worker] SOLAPI service not available`);
    return;
  }

  try {
    // SOLAPI에서 실제 발송 결과 조회
    const phone = msg.externalCustomer.phone.replace(/-/g, '');
    const statusResult = await solapiService.getMessageStatus(msg.solapiGroupId, phone);
    console.log(`[External SMS Worker] Status for ${phone}:`, statusResult);

    if (!statusResult.success) {
      console.log(`[External SMS Worker] Status query failed for message ${messageId}:`, statusResult.error);
      return; // 다음 폴링에서 재시도
    }

    const weekStart = getWeekStart(new Date());

    if (statusResult.status === 'SENT') {
      // 발송 성공 - 트랜잭션으로 상태 업데이트 + 비용 차감 + 슬롯 증가
      await prisma.$transaction(async (tx) => {
        // 1. 메시지 상태 업데이트
        await tx.externalSmsMessage.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        // 2. 지갑 잔액 차감
        await tx.wallet.update({
          where: { storeId: msg.storeId },
          data: { balance: { decrement: msg.cost } },
        });

        // 3. 결제 트랜잭션 로그 생성
        await tx.paymentTransaction.create({
          data: {
            storeId: msg.storeId,
            amount: -msg.cost,
            type: 'ALIMTALK_SEND', // 외부 SMS도 동일 타입 사용
            status: 'SUCCESS',
            meta: {
              messageId: messageId,
              campaignId: msg.campaignId,
              phone: phone,
              type: 'EXTERNAL_SMS',
            },
          },
        });

        // 4. 캠페인 sentCount 및 totalCost 증가
        await tx.externalSmsCampaign.update({
          where: { id: msg.campaignId },
          data: {
            sentCount: { increment: 1 },
            totalCost: { increment: msg.cost },
          },
        });

        // 5. 외부 고객 주간 슬롯 증가
        await tx.externalCustomerWeeklySlot.upsert({
          where: {
            externalCustomerId_weekStart: {
              externalCustomerId: msg.externalCustomerId,
              weekStart,
            },
          },
          update: { slotUsed: { increment: 1 } },
          create: {
            externalCustomerId: msg.externalCustomerId,
            weekStart,
            slotUsed: 1,
          },
        });
      });

      console.log(`[External SMS Worker] Message ${messageId} sent successfully, cost: ${msg.cost}원 차감`);
    } else if (statusResult.status === 'FAILED') {
      // 발송 실패 - 상태만 업데이트, 비용 차감 없음
      await prisma.$transaction(async (tx) => {
        await tx.externalSmsMessage.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            failReason: statusResult.failReason || '발송 실패',
            cost: 0, // 실패 시 비용 0
          },
        });

        // 캠페인 failedCount 증가
        await tx.externalSmsCampaign.update({
          where: { id: msg.campaignId },
          data: { failedCount: { increment: 1 } },
        });
      });

      console.log(`[External SMS Worker] Message ${messageId} FAILED: ${statusResult.failReason}`);
    } else {
      // PENDING - 아직 결과 없음, 다음 폴링에서 재시도
      console.log(`[External SMS Worker] Message ${messageId} still PENDING, will retry`);
    }
  } catch (error: any) {
    console.error(`[External SMS Worker] Error processing message ${messageId}:`, error.message);
  }
}

// 배치 처리
async function processBatch(): Promise<number> {
  // 최소 3초 이상 경과한 PENDING 상태 메시지 조회
  const minCreatedAt = new Date(Date.now() - MIN_AGE_MS);

  const messages = await prisma.externalSmsMessage.findMany({
    where: {
      status: 'PENDING',
      solapiGroupId: { not: null },
      createdAt: { lte: minCreatedAt },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (messages.length === 0) {
    return 0;
  }

  console.log(`[External SMS Worker] Processing ${messages.length} messages`);

  // 순차 처리 (SOLAPI API 호출 제한 고려)
  for (const msg of messages) {
    await processMessage(msg.id);
  }

  return messages.length;
}

// 캠페인 완료 상태 업데이트 (모든 메시지 처리 완료 시)
async function updateCampaignStatus(): Promise<void> {
  // SENDING 상태인 캠페인 중 PENDING 메시지가 없는 캠페인 찾기
  const sendingCampaigns = await prisma.externalSmsCampaign.findMany({
    where: { status: 'SENDING' },
    select: { id: true },
  });

  for (const campaign of sendingCampaigns) {
    const pendingCount = await prisma.externalSmsMessage.count({
      where: { campaignId: campaign.id, status: 'PENDING' },
    });

    if (pendingCount === 0) {
      // 모든 메시지 처리 완료 - 캠페인 COMPLETED로 변경
      await prisma.externalSmsCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED' },
      });
      console.log(`[External SMS Worker] Campaign ${campaign.id} completed`);
    }
  }
}

// 워커 시작
export function startExternalSmsWorker(): void {
  if (isRunning) {
    console.log('[External SMS Worker] Worker already running');
    return;
  }

  isRunning = true;
  console.log('[External SMS Worker] Starting External SMS worker...');

  const poll = async () => {
    if (!isRunning) return;

    try {
      const processed = await processBatch();
      if (processed > 0) {
        console.log(`[External SMS Worker] Processed ${processed} messages`);
      }

      // 캠페인 상태 업데이트
      await updateCampaignStatus();
    } catch (error) {
      console.error('[External SMS Worker] Error in poll cycle:', error);
    }
  };

  // 즉시 한 번 실행
  poll();

  // 주기적으로 폴링
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

// 워커 중지
export function stopExternalSmsWorker(): void {
  if (!isRunning) return;

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log('[External SMS Worker] Worker stopped');
}

// 캐시 초기화
export function clearExternalSmsWorkerCache(): void {
  globalSolapiService = null;
}
