// 야화 웨이팅 카운트 주기 동기화 워커.
// 웹훅은 이벤트가 있을 때만 발송되므로, 이벤트 없이 상태가 바뀌는 케이스
// (영업일 리셋으로 당일 웨이팅이 0이 되는 새벽, 유실된 웹훅)에서 야화 캐시가
// 낡는다. 10분마다 yahwaEnabled 매장 전체의 현재 카운트를 밀어 자기치유한다.
import { prisma as prismaClient } from '../lib/prisma.js';
import { notifyYahwaStoreCount } from './yahwa-webhook.js';

const prisma = prismaClient as any;

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10분

let intervalId: NodeJS.Timeout | null = null;

async function runTick() {
  try {
    if (!process.env.YAHWA_WEBHOOK_URL || !process.env.YAHWA_WEBHOOK_SECRET) return;

    const stores = await prisma.store.findMany({
      where: { yahwaEnabled: true },
      select: { id: true },
    });
    for (const s of stores) {
      await notifyYahwaStoreCount(s.id);
    }
    if (stores.length > 0) {
      console.log(`[YahwaCountSync] synced ${stores.length} stores`);
    }
  } catch (err) {
    console.error('[YahwaCountSync] Tick error:', err);
  }
}

export function startYahwaCountSyncWorker() {
  if (intervalId) return;
  // 부팅 직후 1회 즉시 동기화 (배포/재시작 동안 놓친 변화 보정)
  void runTick();
  intervalId = setInterval(runTick, POLL_INTERVAL_MS);
  console.log(`[YahwaCountSync] started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopYahwaCountSyncWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
