/**
 * 네이버 플레이스 부스터 - 발송 워커
 *
 * 1분마다 폴링하여 도래한 회차(batch)를 발송한다.
 * - 발송 직전 대상자 산정(지역+피로도+캠페인 중복제외)
 * - 실제 발송은 AlimTalkOutbox + alimtalk-worker에 위임 (enqueueAlimTalk)
 * - 캠페인은 선결제로 정산되므로 회차 발송 시 추가 차감 없음
 *
 * 발송 프로바이더(SOLAPI)는 enqueueAlimTalk 뒤로 추상화되어 있어,
 * 프로바이더 교체 시 이 워커는 영향받지 않는다.
 */

import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { enqueueAlimTalk } from './solapi.js';
import { selectRecipients, buildBoosterAlimtalk } from './place-booster-service.js';

const POLL_INTERVAL_MS = 60 * 1000; // 1분
const STUCK_MS = 10 * 60 * 1000; // SENDING 10분 경과 시 재처리

async function processBatch(batchId: string) {
  const batch = await prisma.placeBoosterBatch.findUnique({
    where: { id: batchId },
    include: { campaign: true },
  });
  if (!batch) return;
  const campaign = batch.campaign;
  if (
    campaign.deletedAt ||
    campaign.paymentStatus !== 'PAID' ||
    (campaign.status !== 'SCHEDULED' && campaign.status !== 'RUNNING')
  ) {
    return;
  }

  // 알림톡 페이로드 (등록 템플릿 UG_5628 본문/버튼) — 공용 빌더
  const al = buildBoosterAlimtalk(campaign, batch.weekNo);

  // 점주 사본: 회차마다 점주 번호로 동일 알림톡 1통(통계/대상/피로도 미포함). 멱등키로 재처리 중복 방지.
  if (campaign.ownerPhone?.trim()) {
    await enqueueAlimTalk({
      storeId: campaign.storeId ?? `ext:${campaign.id}`,
      phone: campaign.ownerPhone.trim(),
      messageType: 'PLACE_BOOSTER',
      templateId: al.tplCode,
      variables: { subject: al.subject, message: al.message, buttonName: al.buttonName, buttonUrl: al.buttonUrl },
      idempotencyKey: `place_booster_owner:${batch.id}`,
    }).catch((e) => console.error(`[PlaceBoosterWorker] 점주 사본 발송 실패 batch=${batch.id}:`, e));
  }

  const recipients = await selectRecipients(campaign);
  if (recipients.length === 0) {
    // 대상자 없음 → 회차 종료 처리
    await finalizeBatch(batch.id, campaign.id, 0);
    return;
  }

  let enqueued = 0;
  let failed = 0;
  for (const r of recipients) {
    const result = await enqueueAlimTalk({
      // 외부(무매장) 캠페인은 합성 storeId — PLACE_BOOSTER 발송 경로는 storeId 미사용(추적/태그용)
      storeId: campaign.storeId ?? `ext:${campaign.id}`,
      phone: r.phone,
      messageType: 'PLACE_BOOSTER',
      templateId: al.tplCode, // 알리고 tpl_code
      // 알리고는 본문/버튼을 전송 시 직접 보냄 → 렌더된 값을 variables에 담아 전달
      variables: {
        subject: al.subject,
        message: al.message,
        buttonName: al.buttonName,
        buttonUrl: al.buttonUrl,
      },
      idempotencyKey: `place_booster:${batch.id}:${r.id}`,
    });
    // enqueue 실패 시: 수신자 기록/피로도 증가/집계를 하지 않음 → 잘못 '발송됨'으로 굳어
    // 영구 제외되는 것을 방지(다음 회차/재처리에서 다시 대상이 됨).
    if (!result.success) {
      failed++;
      console.error(
        `[PlaceBoosterWorker] enqueue 실패 campaign=${campaign.id} batch=${batch.id} uc=${r.id}: ${result.error ?? 'unknown'}`
      );
      continue;
    }
    // 수신자 기록 + 피로도 증가를 한 묶음으로 (신규 생성 시에만 증가 → 재처리 중복/누락 방지)
    try {
      await prisma.$transaction([
        prisma.placeBoosterRecipient.create({
          data: {
            batchId: batch.id,
            campaignId: campaign.id,
            uniqueCustomerId: r.id,
            phone: r.phone,
            outboxId: result.id ?? null,
          },
        }),
        prisma.uniqueCustomer.update({
          where: { id: r.id },
          data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
        }),
      ]);
      enqueued++;
    } catch (e) {
      // 이미 이 캠페인 수신자(재처리 경합) → 피로도 중복 증가 방지, 발송분으로는 집계
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        enqueued++;
      } else {
        throw e;
      }
    }
  }

  if (failed > 0) {
    console.warn(`[PlaceBoosterWorker] batch ${batch.id} enqueue 실패 ${failed}건 (성공 ${enqueued}건)`);
  }
  await finalizeBatch(batch.id, campaign.id, enqueued);
}

async function finalizeBatch(batchId: string, campaignId: string, sentCount: number) {
  // SENDING 상태일 때만 SENT 처리 — 발송 중 취소(CANCELLED)된 배치를 되살리지 않음
  const upd = await prisma.placeBoosterBatch.updateMany({
    where: { id: batchId, status: 'SENDING' },
    data: { status: 'SENT', sentCount, sentAt: new Date() },
  });
  if (upd.count === 0) return; // 취소 등으로 이미 종료 → 캠페인 상태 건드리지 않음

  const remaining = await prisma.placeBoosterBatch.count({
    where: { campaignId, status: { in: ['SCHEDULED', 'SENDING'] } },
  });
  // CANCELLED/COMPLETED 캠페인을 RUNNING으로 되살리지 않도록 조건부
  await prisma.placeBoosterCampaign.updateMany({
    where: { id: campaignId, status: { in: ['SCHEDULED', 'RUNNING'] } },
    data: { status: remaining === 0 ? 'COMPLETED' : 'RUNNING' },
  });
}

export async function processDueBatches() {
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - STUCK_MS);

  // 후보: 도래한 SCHEDULED + stuck SENDING (paymentStatus PAID, 활성, 미삭제)
  const due = await prisma.placeBoosterBatch.findMany({
    where: {
      OR: [
        { status: 'SCHEDULED', scheduledAt: { lte: now } },
        { status: 'SENDING', updatedAt: { lt: stuckBefore } },
      ],
      campaign: {
        deletedAt: null,
        paymentStatus: 'PAID',
        status: { in: ['SCHEDULED', 'RUNNING'] },
      },
    },
    select: { id: true, status: true },
    take: 50,
  });

  for (const b of due) {
    // 이중 발송 방지: SCHEDULED→SENDING 원자적 클레임
    if (b.status === 'SCHEDULED') {
      const claim = await prisma.placeBoosterBatch.updateMany({
        where: { id: b.id, status: 'SCHEDULED' },
        data: { status: 'SENDING' },
      });
      if (claim.count === 0) continue; // 다른 틱이 선점
    }
    try {
      await processBatch(b.id);
    } catch (error) {
      console.error(`[PlaceBoosterWorker] batch ${b.id} 처리 실패:`, error);
      // SENDING으로 남아 stuck 재처리 (멱등키 + Recipient unique로 중복 0)
    }
  }
}

export function startPlaceBoosterWorker() {
  console.log('[PlaceBoosterWorker] started (poll 60s)');
  processDueBatches().catch((e) => console.error('[PlaceBoosterWorker] initial run error:', e));
  setInterval(() => {
    processDueBatches().catch((e) => console.error('[PlaceBoosterWorker] error:', e));
  }, POLL_INTERVAL_MS);
}
