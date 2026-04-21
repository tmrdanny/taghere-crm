import { prisma as prismaClient } from '../lib/prisma.js';
import { broadcastRoomReset } from './chat-socket.js';

const prisma = prismaClient as any;

const POLL_INTERVAL_MS = 60 * 1000; // 1분
const HARD_CAP_MS = 7 * 24 * 60 * 60 * 1000; // 7일

let intervalId: NodeJS.Timeout | null = null;

function getKstHour(): number {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return kst.getUTCHours();
}

async function runTick() {
  try {
    const settings = await prisma.chatSetting.findMany({
      where: { enabled: true },
    });

    const now = new Date();
    const kstHour = getKstHour();

    for (const setting of settings) {
      const intervalMs = setting.resetIntervalDays * 24 * 60 * 60 * 1000;
      const lastReset = setting.lastResetAt ? new Date(setting.lastResetAt) : null;
      const elapsed = lastReset ? now.getTime() - lastReset.getTime() : Infinity;

      // 현재 시각이 설정 리셋 시각과 같고, 주기가 지났으면 초기화
      if (kstHour === setting.resetHourKst && elapsed >= intervalMs) {
        await prisma.chatMessage.updateMany({
          where: { storeId: setting.storeId, deletedAt: null },
          data: { deletedAt: now },
        });
        await prisma.chatParticipant.deleteMany({
          where: { storeId: setting.storeId },
        });
        await prisma.chatSetting.update({
          where: { id: setting.id },
          data: { lastResetAt: now },
        });
        broadcastRoomReset(setting.storeId, setting.welcomeMessage ?? null);
        console.log(`[ChatResetWorker] Reset store ${setting.storeId} at KST ${kstHour}시`);
      }
    }

    // Safety: 7일 초과 메시지 hard delete (모든 매장 대상)
    const cutoff = new Date(now.getTime() - HARD_CAP_MS);
    const hardDeleted = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (hardDeleted.count > 0) {
      console.log(`[ChatResetWorker] Hard-deleted ${hardDeleted.count} messages older than 7 days`);
    }
  } catch (err) {
    console.error('[ChatResetWorker] Tick error:', err);
  }
}

export function startChatResetWorker() {
  if (intervalId) return;
  intervalId = setInterval(runTick, POLL_INTERVAL_MS);
  console.log(`[ChatResetWorker] started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopChatResetWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
