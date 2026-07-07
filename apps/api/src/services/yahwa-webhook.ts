import crypto from 'crypto';
import { prisma as prismaClient } from '../lib/prisma.js';
import {
  EXTERNAL_SOURCE,
  computeWaitingState,
  getStoreWaitingCount,
  getStoreWaitingEta,
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
    const storeEta = await getStoreWaitingEta(waiting.storeId);

    const payload = {
      event: 'waiting.status_changed' as const,
      waiting_id: waiting.id,
      store_id: waiting.storeId,
      status: state.status,
      position: state.position,
      waiting_count: waitingCount,
      store_eta_min: storeEta,
      occurred_at: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, secret);
    await postWithRetry(url, rawBody, signature);
  } catch (err) {
    console.error('[Yahwa] notifyYahwaStatusChange failed:', err);
  }
}

/**
 * 웨이팅 변동을 야화로 푸시한다 (fire-and-forget). 모든 등록 경로 공용.
 * - 야화 연동(externalSource=YAHWA) 웨이팅: 상태+카운트 웹훅 (notifyYahwaStatusChange).
 * - 그 외(태블릿/수기 등): 매장이 yahwaEnabled면 카운트만 푸시 —
 *   야화 지도의 "웨이팅 N팀" 표시는 매장 전체 대기 수가 필요해서 출처와 무관하게 보낸다.
 */
export async function notifyYahwaWaitingChange(waitingId: string): Promise<void> {
  try {
    const url = process.env.YAHWA_WEBHOOK_URL || '';
    const secret = process.env.YAHWA_WEBHOOK_SECRET || '';
    if (!url || !secret) return;

    const waiting = await prisma.waitingList.findUnique({ where: { id: waitingId } });
    if (!waiting) return;
    if (waiting.externalSource === EXTERNAL_SOURCE) {
      return notifyYahwaStatusChange(waitingId);
    }

    const store = await prisma.store.findUnique({
      where: { id: waiting.storeId },
      select: { yahwaEnabled: true },
    });
    if (!store?.yahwaEnabled) return;

    await notifyYahwaStoreCount(waiting.storeId);
  } catch (err) {
    console.error('[Yahwa] notifyYahwaWaitingChange failed:', err);
  }
}

/**
 * 매장의 현재 대기 팀 수/예상시간을 야화로 푸시한다 (카운트 웹훅).
 * 이벤트 경유(notifyYahwaWaitingChange)와 주기 동기화 워커가 공용으로 사용.
 * 호출 전 yahwaEnabled 확인은 호출자 책임. env 미설정 시 조용히 스킵.
 */
export async function notifyYahwaStoreCount(storeId: string): Promise<void> {
  try {
    const url = process.env.YAHWA_WEBHOOK_URL || '';
    const secret = process.env.YAHWA_WEBHOOK_SECRET || '';
    if (!url || !secret) return;

    const waitingCount = await getStoreWaitingCount(storeId);
    const storeEta = await getStoreWaitingEta(storeId);
    const payload = {
      event: 'waiting.count_changed' as const,
      store_id: storeId,
      waiting_count: waitingCount,
      store_eta_min: storeEta,
      occurred_at: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, secret);
    await postWithRetry(url, rawBody, signature);
  } catch (err) {
    console.error('[Yahwa] notifyYahwaStoreCount failed:', err);
  }
}
