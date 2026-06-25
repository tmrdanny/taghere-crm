/**
 * 네이버 플레이스 부스터 - 예약 등록 워커
 *
 * 알리고 "예약 발송(senddate)" 으로 미리 등록하는 구조.
 * 60초 폴링하며 3가지 작업을 수행한다:
 *  (A) 등록: 활성·결제완료 캠페인의 미등록 회차를 대상자 선별 후 알리고에 senddate로 예약 등록
 *  (B) 재개: 등록 처리 중(SENDING) 정체 회차를 이어서 등록 (청크 단위 커밋이라 멱등/재개 안전)
 *  (C) 마감: 발송 시각이 지난 예약(REGISTERED) 회차를 SENT로 플립하고 캠페인 상태 재계산
 *
 * 실제 발송은 알리고가 예약 시각에 수행 → 발송 순간 워커 개입 없음.
 */

import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { selectRecipients, buildBoosterAlimtalk } from './place-booster-service.js';
import { sendAligoAlimtalkBulk, formatSenddateKST, ALIGO_MAX_RECEIVERS } from './aligo.js';

const POLL_INTERVAL_MS = 60 * 1000; // 1분
const STUCK_MS = 10 * 60 * 1000; // SENDING 10분 경과 시 재개

/**
 * (A)/(B) 한 회차를 알리고에 예약 등록. 청크(≤500)마다 선별→전송→기록을 커밋하므로
 * 중간 실패/크래시 후 다음 틱에서 잔여 인원만 이어서 등록(재개)된다.
 */
async function registerBatch(batchId: string) {
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
    return; // 비활성(취소/미결제) → 건드리지 않음
  }

  // 등록 템플릿(UG_5628) 본문/버튼 — 공용 빌더 (버튼 URL은 회차 추적링크, 수신자 무관)
  const al = buildBoosterAlimtalk(campaign, batch.weekNo);
  // 발송 시각이 미래면 예약(senddate), 이미 과거면 즉시 발송(senddate 생략)
  const senddate = batch.scheduledAt.getTime() > Date.now() ? formatSenddateKST(batch.scheduledAt) : undefined;

  // 이미 등록된 수신자(재개 시) 제외하고 잔여 인원만 채움
  const existing = await prisma.placeBoosterRecipient.count({ where: { batchId: batch.id } });
  let remaining = campaign.perBatchCount - existing;

  while (remaining > 0) {
    const take = Math.min(ALIGO_MAX_RECEIVERS, remaining);
    // selectRecipients 는 캠페인 내 기존 수신자를 제외 → 매 청크마다 신규 선별
    const picked = await selectRecipients(campaign, take);
    if (picked.length === 0) break; // 지역 풀 소진

    const result = await sendAligoAlimtalkBulk({
      phones: picked.map((p) => p.phone),
      senddate,
      tplCode: al.tplCode,
      subject: al.subject,
      message: al.message,
      buttonName: al.buttonName,
      buttonUrl: al.buttonUrl,
    });
    if (!result.success) {
      // 등록 실패 → 이 청크는 미기록(SENDING 잔류 → 다음 틱/STUCK 재개에서 재시도). 마감하지 않음.
      console.error(`[PlaceBoosterWorker] 예약 등록 실패 campaign=${campaign.id} batch=${batch.id}: ${result.error ?? 'unknown'}`);
      return;
    }

    // 성공: 수신자 기록 + 피로도 증가 + mid 저장을 한 트랜잭션으로 커밋(청크 단위 재개 지점)
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.placeBoosterRecipient.createMany({
        data: picked.map((p) => ({
          batchId: batch.id,
          campaignId: campaign.id,
          uniqueCustomerId: p.id,
          phone: p.phone,
        })),
        skipDuplicates: true,
      }),
      prisma.uniqueCustomer.updateMany({
        where: { id: { in: picked.map((p) => p.id) } },
        data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
      }),
    ];
    if (result.mid) {
      ops.push(
        prisma.placeBoosterBatch.update({
          where: { id: batch.id },
          data: { aligoMids: { push: result.mid } },
        })
      );
    }
    await prisma.$transaction(ops);
    remaining -= picked.length;
  }

  // 사장님 사본: 회차당 1통(통계/피로도 미포함). 미등록(ownerAligoMid null)일 때만.
  if (campaign.ownerPhone?.trim() && !batch.ownerAligoMid) {
    const ownerRes = await sendAligoAlimtalkBulk({
      phones: [campaign.ownerPhone.trim()],
      senddate,
      tplCode: al.tplCode,
      subject: al.subject,
      message: al.message,
      buttonName: al.buttonName,
      buttonUrl: al.buttonUrl,
    });
    if (ownerRes.success && ownerRes.mid) {
      await prisma.placeBoosterBatch.update({ where: { id: batch.id }, data: { ownerAligoMid: ownerRes.mid } });
    } else if (!ownerRes.success) {
      // 사장님 사본 실패는 고객 발송 마감을 막지 않음(부가 통보) — 로그만
      console.error(`[PlaceBoosterWorker] 사장님 사본 예약 실패 batch=${batch.id}: ${ownerRes.error ?? 'unknown'}`);
    }
  }

  // 마감: SENDING → REGISTERED (취소로 CANCELLED 된 회차는 status 가드로 되살리지 않음)
  const finalCount = await prisma.placeBoosterRecipient.count({ where: { batchId: batch.id } });
  await prisma.placeBoosterBatch.updateMany({
    where: { id: batch.id, status: 'SENDING' },
    data: { status: 'REGISTERED', reservedAt: new Date(), sentCount: finalCount },
  });
}

/** (A)(B): 활성 캠페인의 미등록(SCHEDULED) + 정체(SENDING) 회차를 등록/재개 */
async function registerPendingBatches() {
  const stuckBefore = new Date(Date.now() - STUCK_MS);
  const candidates = await prisma.placeBoosterBatch.findMany({
    where: {
      OR: [{ status: 'SCHEDULED' }, { status: 'SENDING', updatedAt: { lt: stuckBefore } }],
      campaign: { deletedAt: null, paymentStatus: 'PAID', status: { in: ['SCHEDULED', 'RUNNING'] } },
    },
    select: { id: true, status: true },
    orderBy: [{ campaignId: 'asc' }, { weekNo: 'asc' }], // 주차 오름차순 → 주차 간 수신자 중복제외 유지
    take: 50,
  });

  for (const b of candidates) {
    // 미등록은 SCHEDULED→SENDING 원자적 클레임(이중 처리 방지)
    if (b.status === 'SCHEDULED') {
      const claim = await prisma.placeBoosterBatch.updateMany({
        where: { id: b.id, status: 'SCHEDULED' },
        data: { status: 'SENDING' },
      });
      if (claim.count === 0) continue; // 다른 틱이 선점
    }
    try {
      await registerBatch(b.id);
    } catch (error) {
      console.error(`[PlaceBoosterWorker] batch ${b.id} 등록 실패:`, error);
      // SENDING 잔류 → STUCK 재개 (청크 커밋 + Recipient unique 로 중복 0)
    }
  }
}

/** (C): 발송 시각이 지난 예약 회차를 SENT 로 플립하고 캠페인 상태 재계산 */
async function flipSentBatches() {
  const now = new Date();
  const due = await prisma.placeBoosterBatch.findMany({
    where: { status: 'REGISTERED', scheduledAt: { lte: now }, campaign: { deletedAt: null } },
    select: { id: true, campaignId: true, scheduledAt: true },
    take: 100,
  });
  for (const b of due) {
    const upd = await prisma.placeBoosterBatch.updateMany({
      where: { id: b.id, status: 'REGISTERED' },
      data: { status: 'SENT', sentAt: b.scheduledAt },
    });
    if (upd.count === 0) continue;
    await recomputeCampaignStatus(b.campaignId);
  }
}

async function recomputeCampaignStatus(campaignId: string) {
  const [remaining, anySent] = await Promise.all([
    prisma.placeBoosterBatch.count({
      where: { campaignId, status: { in: ['SCHEDULED', 'SENDING', 'REGISTERED'] } },
    }),
    prisma.placeBoosterBatch.count({ where: { campaignId, status: 'SENT' } }),
  ]);
  // CANCELLED/COMPLETED 캠페인은 건드리지 않도록 조건부
  await prisma.placeBoosterCampaign.updateMany({
    where: { id: campaignId, status: { in: ['SCHEDULED', 'RUNNING'] } },
    data: { status: remaining === 0 ? 'COMPLETED' : anySent > 0 ? 'RUNNING' : 'SCHEDULED' },
  });
}

let running = false;
async function processTick() {
  if (running) return; // 이전 틱이 길어지면(대량 등록) 중첩 방지
  running = true;
  try {
    await registerPendingBatches();
    await flipSentBatches();
  } finally {
    running = false;
  }
}

export function startPlaceBoosterWorker() {
  console.log('[PlaceBoosterWorker] started (poll 60s, 알리고 예약 발송 등록)');
  processTick().catch((e) => console.error('[PlaceBoosterWorker] initial run error:', e));
  setInterval(() => {
    processTick().catch((e) => console.error('[PlaceBoosterWorker] error:', e));
  }, POLL_INTERVAL_MS);
}
