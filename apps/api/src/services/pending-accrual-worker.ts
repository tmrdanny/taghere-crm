import { prisma } from '../lib/prisma.js';
import { finalizePendingAccrual } from './pending-point-accrual.js';
import { finalizePendingStampAccrual } from './pending-stamp-accrual.js';

/**
 * 적립 예약 타임아웃 워커 (포인트 + 스탬프).
 *
 * POS 결제완료 신호가 끝내 오지 않는 경우(손님이 현금 계산, POS 에이전트 다운, 신호 유실 등)
 * 예약이 영영 남지 않도록 expiresAt(예약 + 12시간)이 지난 건을 자동으로 적립 전환한다.
 * 전환 로직은 결제완료 통보와 완전히 동일한 finalizePendingAccrual/finalizePendingStampAccrual 을 공유한다.
 */

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 60000; // 1분마다 폴링 (만료 기준이 12시간이라 이 정도로 충분)
/** 전환 실패 시 이 시간만큼 뒤로 밀어 재시도한다 (선두 점유·로그 폭주 방지) */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

export async function processBatch(): Promise<number> {
  const expired = await prisma.pendingPointAccrual.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: new Date() },
    },
    take: BATCH_SIZE,
    orderBy: { expiresAt: 'asc' },
    select: { id: true },
  });

  let finalized = 0;
  for (const { id } of expired) {
    try {
      const result = await finalizePendingAccrual(id, 'TIMEOUT');
      if (result.finalized) finalized += 1;
    } catch (error) {
      console.error(`[PendingAccrualWorker] 전환 실패 - pendingId: ${id}`, error);
      // 실패한 행을 그대로 두면 expiresAt 오름차순 선두를 계속 점유해
      // 뒤의 정상 예약이 영영 처리되지 않고 1분마다 같은 에러가 반복된다.
      // expiresAt 을 뒤로 밀어 대기열에서 빼고 다음 주기에 재시도하게 한다.
      await prisma.pendingPointAccrual
        .updateMany({
          where: { id, status: 'PENDING' },
          data: { expiresAt: new Date(Date.now() + FAILURE_BACKOFF_MS) },
        })
        .catch(() => {});
    }
  }

  finalized += await processStampBatch();

  return finalized;
}

/** 스탬프 예약 만료분 전환. 포인트 배치와 동일한 규칙(배치 크기·정렬·실패 백오프)을 쓴다. */
async function processStampBatch(): Promise<number> {
  const expired = await prisma.pendingStampAccrual.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: new Date() },
    },
    take: BATCH_SIZE,
    orderBy: { expiresAt: 'asc' },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  let finalized = 0;
  for (const { id } of expired) {
    try {
      const result = await finalizePendingStampAccrual(id, 'TIMEOUT');
      if (result.finalized) {
        finalized += 1;
      } else if (result.status === 'NOT_FOUND') {
        // finalize 가 예외 없이 실패를 알리는 유일한 경로(매장 stampSetting 소실 등).
        // PENDING 으로 남으므로 catch 와 동일하게 뒤로 밀지 않으면 선두를 영구 점유한다.
        console.error(`[PendingAccrualWorker] 스탬프 전환 불가(NOT_FOUND) - pendingId: ${id}`);
        await pushBackStampAccrual(id);
      }
    } catch (error) {
      console.error(`[PendingAccrualWorker] 스탬프 전환 실패 - pendingId: ${id}`, error);
      // 실패한 행이 expiresAt 오름차순 선두를 계속 점유하지 않도록 뒤로 밀어 다음 주기에 재시도한다.
      await pushBackStampAccrual(id);
    }
  }

  return finalized;
}

/** 전환에 실패한 스탬프 예약을 백오프만큼 뒤로 밀어 대기열 선두에서 빼낸다. */
async function pushBackStampAccrual(id: string): Promise<void> {
  await prisma.pendingStampAccrual
    .updateMany({
      where: { id, status: 'PENDING' },
      data: { expiresAt: new Date(Date.now() + FAILURE_BACKOFF_MS) },
    })
    .catch(() => {});
}

export function startPendingAccrualWorker(): void {
  if (isRunning) {
    console.log('[Worker] PendingAccrual worker already running');
    return;
  }

  isRunning = true;
  console.log('[Worker] Starting PendingAccrual worker...');

  const poll = async () => {
    if (!isRunning) return;

    try {
      const finalized = await processBatch();
      if (finalized > 0) {
        console.log(`[Worker] 타임아웃으로 적립 전환 ${finalized}건`);
      }
    } catch (error) {
      console.error('[Worker] Error in poll cycle:', error);
    }
  };

  poll();

  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopPendingAccrualWorker(): void {
  if (!isRunning) return;

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log('[Worker] PendingAccrual worker stopped');
}
