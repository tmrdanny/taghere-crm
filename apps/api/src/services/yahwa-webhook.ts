import crypto from 'crypto';
import { prisma as prismaClient } from '../lib/prisma.js';
import {
  EXTERNAL_SOURCE,
  computeWaitingState,
  getStoreWaitingCount,
} from './yahwa-waiting.js';

const prisma = prismaClient as any;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** HMAC-SHA256(raw_body, WEBHOOK_SECRET) → hex */
function sign(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * 야화 수신 URL로 POST. 2xx 외 응답/네트워크 오류 시 지수 백오프로 재시도(총 3회 추가 시도).
 */
async function postWithRetry(url: string, rawBody: string, signature: string): Promise<boolean> {
  const backoffMs = [1000, 4000, 9000]; // 최초 시도 실패 후 1s, 4s, 9s 간격으로 재시도
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-TagHere-Signature': signature,
        },
        body: rawBody,
      });
      if (res.ok) return true;
      console.warn(`[Yahwa] webhook non-2xx (attempt ${attempt + 1}): ${res.status}`);
    } catch (err: any) {
      console.warn(`[Yahwa] webhook error (attempt ${attempt + 1}): ${err?.message || err}`);
    }
    if (attempt < backoffMs.length) await sleep(backoffMs[attempt]);
  }
  return false;
}

/**
 * 야화 연동 웨이팅의 상태 변경을 야화로 푸시한다 (fire-and-forget).
 * - 야화 연동(externalSource=YAHWA) 웨이팅에만 발송.
 * - YAHWA_WEBHOOK_URL / YAHWA_WEBHOOK_SECRET 미설정 시 조용히 스킵.
 * - 호출 측 흐름을 막지 않도록 절대 throw 하지 않는다.
 */
export async function notifyYahwaStatusChange(waitingId: string): Promise<void> {
  try {
    const url = process.env.YAHWA_WEBHOOK_URL || '';
    const secret = process.env.YAHWA_WEBHOOK_SECRET || '';
    if (!url || !secret) return;

    const waiting = await prisma.waitingList.findUnique({
      where: { id: waitingId },
      include: { waitingType: true },
    });
    if (!waiting || waiting.externalSource !== EXTERNAL_SOURCE) return;

    const state = await computeWaitingState(waiting);
    const waitingCount = await getStoreWaitingCount(waiting.storeId);

    const payload = {
      event: 'waiting.status_changed' as const,
      waiting_id: waiting.id,
      store_id: waiting.storeId,
      status: state.status,
      position: state.position,
      waiting_count: waitingCount,
      occurred_at: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, secret);
    await postWithRetry(url, rawBody, signature);
  } catch (err) {
    console.error('[Yahwa] notifyYahwaStatusChange failed:', err);
  }
}
