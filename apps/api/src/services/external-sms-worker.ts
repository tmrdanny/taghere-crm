import { prisma } from '../lib/prisma.js';
import { SolapiService } from './solapi.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 5000; // 5초마다 폴링
const MIN_AGE_MS = 3000; // 최소 3초 경과한 메시지만 처리 (SOLAPI 처리 시간 고려)
const STUCK_PENDING_EXPIRE_MS = 60 * 60 * 1000; // 1시간 초과 PENDING은 강제 만료(FAILED) 처리
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
    return null;
  }

  globalSolapiService = new SolapiService(apiKey, apiSecret);
  return globalSolapiService;
}


// 단일 메시지 처리 (그룹 조회 결과를 인자로 받음)
async function processMessage(
  messageId: string,
  precomputedStatus?: { status: 'PENDING' | 'SENT' | 'FAILED'; failReason?: string } | null
): Promise<void> {
  const msg = await prisma.externalSmsMessage.findUnique({
    where: { id: messageId },
    include: { campaign: true, externalCustomer: true },
  });

  if (!msg || msg.status !== 'PENDING') {
    return;
  }

  // groupId 없으면 처리 불가
  if (!msg.solapiGroupId) {
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
    return;
  }

  try {
    // CRM 고객(externalCustomer가 null)인 경우 전화번호를 직접 가져올 수 없으므로 스킵
    if (!msg.externalCustomer) {
      return;
    }

    const phone = msg.externalCustomer.phone.replace(/-/g, '');

    // 그룹 단위 일괄 조회 결과 우선. 없으면 단건 fallback.
    let statusResult: { success: boolean; status?: 'PENDING' | 'SENT' | 'FAILED'; failReason?: string; error?: string };
    if (precomputedStatus) {
      statusResult = { success: true, status: precomputedStatus.status, failReason: precomputedStatus.failReason };
    } else if (precomputedStatus === null) {
      statusResult = { success: true, status: 'PENDING' };
    } else {
      statusResult = await solapiService.getMessageStatus(msg.solapiGroupId, phone);
    }

    if (!statusResult.success) {
      return; // 다음 폴링에서 재시도
    }

    if (statusResult.status === 'SENT') {
      // 발송 성공 - 트랜잭션으로 상태 업데이트 + 비용 차감
      await prisma.$transaction(async (tx) => {
        // 1. 메시지 상태 업데이트
        await tx.externalSmsMessage.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        // 2. 프랜차이즈 지갑 잔액 차감 (franchiseId가 있는 경우에만)
        if (msg.campaign.franchiseId) {
          await tx.franchiseWallet.update({
            where: { franchiseId: msg.campaign.franchiseId },
            data: { balance: { decrement: msg.cost } },
          });
        }

        // 4. 캠페인 sentCount 및 totalCost 증가
        await tx.externalSmsCampaign.update({
          where: { id: msg.campaignId },
          data: {
            sentCount: { increment: 1 },
            totalCost: { increment: msg.cost },
          },
        });

      });

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
    }
    // PENDING - 아직 결과 없음, 다음 폴링에서 재시도
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
    select: {
      id: true,
      solapiGroupId: true,
      externalCustomer: { select: { phone: true } },
    },
  });

  if (messages.length === 0) {
    return 0;
  }

  // groupId 단위로 묶어 SOLAPI를 1회만 호출
  const solapiService = getSolapiService();
  const groupIdToStatuses = new Map<string, Map<string, { status: 'PENDING' | 'SENT' | 'FAILED'; failReason?: string }> | null>();

  if (solapiService) {
    const uniqueGroupIds = Array.from(new Set(messages.map((m) => m.solapiGroupId!).filter(Boolean)));
    for (const groupId of uniqueGroupIds) {
      const result = await solapiService.getGroupMessageStatuses(groupId);
      if (result.success && result.statuses) {
        groupIdToStatuses.set(groupId, result.statuses);
      } else {
        console.log(`[External SMS Worker] Group status query failed for ${groupId}:`, result.error);
        groupIdToStatuses.set(groupId, null);
      }
    }
  }

  for (const msg of messages) {
    const groupStatuses = msg.solapiGroupId ? groupIdToStatuses.get(msg.solapiGroupId) : null;
    if (groupStatuses === null) continue; // 그룹 조회 실패 시 이번 사이클 스킵
    let precomputed: { status: 'PENDING' | 'SENT' | 'FAILED'; failReason?: string } | null | undefined;
    if (groupStatuses && msg.externalCustomer && solapiService) {
      const normalized = solapiService.normalizePhone(msg.externalCustomer.phone);
      precomputed = groupStatuses.get(normalized) ?? null;
    }
    await processMessage(msg.id, precomputed);
  }

  return messages.length;
}

// SOLAPI가 끝내 종결 리포트를 주지 않아 1시간 넘게 PENDING으로 남은 메시지를 FAILED로 정리한다.
// external-sms는 SENT 시점 과금 구조라 PENDING은 아직 미차감 상태 → 환불 없이 FAILED 처리만 한다.
// (처리 안 하면 캠페인이 COMPLETED로 넘어가지 못한다)
async function expireStuckPendingMessages(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_PENDING_EXPIRE_MS);

  const stuck = await prisma.externalSmsMessage.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    take: BATCH_SIZE,
    select: { id: true, campaignId: true },
  });

  for (const msg of stuck) {
    let didExpire = false;
    await prisma.$transaction(async (tx) => {
      // 동시 폴링과의 경합 방지: 여전히 PENDING일 때만 전환하고, 전환된 경우에만 카운트 증가
      const updated = await tx.externalSmsMessage.updateMany({
        where: { id: msg.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          failReason: '발송 결과 확인 시간 초과 (1시간)',
          cost: 0,
        },
      });
      if (updated.count === 0) return;
      await tx.externalSmsCampaign.update({
        where: { id: msg.campaignId },
        data: { failedCount: { increment: 1 } },
      });
      didExpire = true;
    });
    if (didExpire) {
      console.log(`[External SMS Worker] Message ${msg.id} expired after 1h PENDING, marked FAILED`);
    }
  }
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
    }
  }
}

// 워커 시작
export function startExternalSmsWorker(): void {
  if (isRunning) {
    return;
  }

  isRunning = true;

  const poll = async () => {
    if (!isRunning) return;

    try {
      await processBatch();
      // 오래 갇힌 PENDING 메시지 정리 (안전망)
      await expireStuckPendingMessages();
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
}

// 캐시 초기화
export function clearExternalSmsWorkerCache(): void {
  globalSolapiService = null;
}
