/**
 * 네이버 플레이스 부스터 - 예약 등록 워커
 *
 * 솔라피 "태그히어" 채널 알림톡 예약 발송으로 미리 등록하는 구조 (booster-channel.ts).
 * 2026-10 "태그히어플레이스" 채널(알리고) 정지로 전환 — 알리고에 남은 예약은 (E)에서 취소 후 솔라피로 다시 등록한다.
 * 60초 폴링하며 3가지 작업을 수행한다:
 *  (A) 등록: 활성·결제완료 캠페인의 미등록 회차를 대상자 선별 후 알리고에 senddate로 예약 등록
 *  (B) 재개: 등록 처리 중(SENDING) 정체 회차를 이어서 등록 (청크 단위 커밋이라 멱등/재개 안전)
 *  (C) 마감: 발송 시각이 지난 예약(REGISTERED) 회차를 SENT로 플립하고 캠페인 상태 재계산
 *
 * 실제 발송은 알리고가 예약 시각에 수행 → 발송 순간 워커 개입 없음.
 */

import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { selectRecipients, buildBoosterAlimtalk, syncBatchFailures } from './place-booster-service.js';
import { sendBoosterBulk, cancelBoosterReservation, BOOSTER_CHUNK } from './booster-channel.js';
import { isSendableTime, getNextSendableTime } from '../utils/send-window.js';

const POLL_INTERVAL_MS = 60 * 1000; // 1분
const STUCK_MS = 10 * 60 * 1000; // SENDING 10분 경과 시 재개
const REGISTERING_STALE_MS = 10 * 60 * 1000; // 캠페인 등록 잠금 stale 회수(크래시 대비)
const RESULT_LAG_MS = 60 * 60 * 1000; // 발송 후 알리고 결과 적재 대기(1시간) 뒤 차단 회수
const FAILURE_SYNC_BATCH_LIMIT = 10; // 틱당 결과 수집 회차 수 상한(틱 지연 방지)

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

  // 템플릿 변수 — 공용 빌더 (버튼 URL은 회차 추적링크, 수신자 무관)
  const al = buildBoosterAlimtalk(campaign, batch.weekNo);
  // 발송 시각: 미래면 그 시각에 예약. 이미 지났으면(재발송) 지금, 광고 발송 불가 시간이면 다음 오전 8시.
  const sendAt =
    batch.scheduledAt.getTime() > Date.now() ? batch.scheduledAt : isSendableTime() ? new Date() : getNextSendableTime();

  // (1) 이미 뽑혔지만 아직 솔라피로 접수되지 않은 수신자(outboxId 없음) — 알리고 실패분 재발송·중단 재개
  for (;;) {
    const pending = await prisma.placeBoosterRecipient.findMany({
      where: { batchId: batch.id, outboxId: null },
      select: { id: true, phone: true },
      take: BOOSTER_CHUNK,
    });
    if (pending.length === 0) break;
    const result = await sendBoosterBulk({ phones: pending.map((r) => r.phone), variables: al.variables, scheduledAt: sendAt });
    if (!result.success || !result.mid) {
      console.error(`[PlaceBoosterWorker] 재발송 등록 실패 campaign=${campaign.id} batch=${batch.id}: ${result.error ?? 'unknown'}`);
      return; // SENDING 잔류 → 다음 틱 재개
    }
    await prisma.$transaction([
      prisma.placeBoosterRecipient.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { outboxId: result.mid } }),
      prisma.placeBoosterBatch.update({ where: { id: batch.id }, data: { aligoMids: { push: result.mid } } }),
    ]);
  }

  // (2) 남은 인원 신규 선별 → 등록
  const existing = await prisma.placeBoosterRecipient.count({ where: { batchId: batch.id } });
  let remaining = campaign.perBatchCount - existing;

  while (remaining > 0) {
    const take = Math.min(BOOSTER_CHUNK, remaining);
    // selectRecipients 는 캠페인 내 기존 수신자를 제외 → 매 청크마다 신규 선별
    const picked = await selectRecipients(campaign, take);
    if (picked.length === 0) break; // 지역 풀 소진

    const result = await sendBoosterBulk({ phones: picked.map((p) => p.phone), variables: al.variables, scheduledAt: sendAt });
    if (!result.success || !result.mid) {
      // 등록 실패 → 이 청크는 미기록(SENDING 잔류 → 다음 틱/STUCK 재개에서 재시도). 마감하지 않음.
      console.error(`[PlaceBoosterWorker] 예약 등록 실패 campaign=${campaign.id} batch=${batch.id}: ${result.error ?? 'unknown'}`);
      return;
    }

    // 성공: 수신자 기록(outboxId=솔라피 groupId) + 피로도 증가 + mid 저장을 한 트랜잭션으로 커밋(청크 단위 재개 지점)
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.placeBoosterRecipient.createMany({
        data: picked.map((p) => ({
          batchId: batch.id,
          campaignId: campaign.id,
          uniqueCustomerId: p.id,
          phone: p.phone,
          outboxId: result.mid,
        })),
        skipDuplicates: true,
      }),
      prisma.uniqueCustomer.updateMany({
        where: { id: { in: picked.map((p) => p.id) } },
        data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
      }),
      prisma.placeBoosterBatch.update({
        where: { id: batch.id },
        data: { aligoMids: { push: result.mid } },
      }),
    ];
    await prisma.$transaction(ops);
    remaining -= picked.length;
  }

  // 사장님 사본: 회차당 1통(통계/피로도 미포함). 미등록(ownerAligoMid null)일 때만.
  if (campaign.ownerPhone?.trim() && !batch.ownerAligoMid) {
    const ownerRes = await sendBoosterBulk({ phones: [campaign.ownerPhone.trim()], variables: al.variables, scheduledAt: sendAt });
    if (ownerRes.success && ownerRes.mid) {
      await prisma.placeBoosterBatch.update({ where: { id: batch.id }, data: { ownerAligoMid: ownerRes.mid } });
    } else {
      // 사장님 사본 실패는 고객 발송 마감을 막지 않음(부가 통보) — 로그만
      console.error(`[PlaceBoosterWorker] 사장님 사본 예약 실패 batch=${batch.id}: ${ownerRes.error ?? 'unknown'}`);
    }
  }

  // 마감: SENDING → REGISTERED (취소로 CANCELLED 된 회차는 status 가드로 되살리지 않음).
  // 재발송으로 시각이 바뀌었으면 실제 발송 시각으로 맞춘다 (SENT 플립·결과 수집 기준).
  const finalCount = await prisma.placeBoosterRecipient.count({ where: { batchId: batch.id } });
  await prisma.placeBoosterBatch.updateMany({
    where: { id: batch.id, status: 'SENDING' },
    data: { status: 'REGISTERED', reservedAt: new Date(), sentCount: finalCount, scheduledAt: sendAt },
  });
}

/**
 * (A)(B): 활성 캠페인의 미등록(SCHEDULED) + 정체(SENDING) 회차를 등록/재개.
 *
 * 캠페인 단위 배타 잠금(registeringAt)으로 직렬화한다 — 인스턴스가 여러 개(배포 겹침/스케일아웃)여도
 * 한 캠페인은 한 워커만 등록한다. 회차 단위 클레임만으로는 같은 캠페인의 다른 회차가 병렬 등록되어
 * selectRecipients 가 같은 대상을 겹쳐 뽑고(커밋 전이라 제외 불가) 중복 예약/인원 미달이 발생한다.
 */
async function registerPendingBatches() {
  const stuckBefore = new Date(Date.now() - STUCK_MS);

  // 등록 대기(미등록 SCHEDULED + 정체 SENDING) 회차를 가진 캠페인 목록
  const pending = await prisma.placeBoosterBatch.findMany({
    where: {
      OR: [{ status: 'SCHEDULED' }, { status: 'SENDING', updatedAt: { lt: stuckBefore } }],
      campaign: { deletedAt: null, paymentStatus: 'PAID', status: { in: ['SCHEDULED', 'RUNNING'] } },
    },
    select: { campaignId: true },
    distinct: ['campaignId'],
    take: 20,
  });

  const staleClaim = new Date(Date.now() - REGISTERING_STALE_MS);
  for (const { campaignId } of pending) {
    // 캠페인 배타 클레임 (다른 워커가 등록 중이면 건너뜀). stale 이면 회수.
    const claim = await prisma.placeBoosterCampaign.updateMany({
      where: { id: campaignId, OR: [{ registeringAt: null }, { registeringAt: { lt: staleClaim } }] },
      data: { registeringAt: new Date() },
    });
    if (claim.count === 0) continue; // 다른 워커가 등록 중

    try {
      // 이 캠페인의 미등록/정체 회차를 weekNo 순서로 순차 등록 (주차 간 수신자 중복제외 유지)
      const batches = await prisma.placeBoosterBatch.findMany({
        where: {
          campaignId,
          OR: [{ status: 'SCHEDULED' }, { status: 'SENDING', updatedAt: { lt: stuckBefore } }],
        },
        orderBy: { weekNo: 'asc' },
        select: { id: true, status: true },
      });
      for (const b of batches) {
        if (b.status === 'SCHEDULED') {
          await prisma.placeBoosterBatch.updateMany({
            where: { id: b.id, status: 'SCHEDULED' },
            data: { status: 'SENDING' },
          });
        }
        try {
          await registerBatch(b.id);
        } catch (error) {
          console.error(`[PlaceBoosterWorker] batch ${b.id} 등록 실패:`, error);
          // SENDING 잔류 → 다음 클레임/STUCK 재개 (청크 커밋 + Recipient unique 로 중복 0)
        }
      }
    } finally {
      // 잠금 해제 (실패해도 반드시) — 미처리 잔여는 다음 틱에서 재클레임
      await prisma.placeBoosterCampaign.updateMany({
        where: { id: campaignId },
        data: { registeringAt: null },
      });
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

/**
 * (D): 발송이 끝난(SENT) 회차의 알리고 결과를 수집해 영구 차단 수신자를 부스터에서 영구 제외.
 * 결과 적재 지연을 감안해 발송 후 RESULT_LAG_MS 경과한 회차만, failureSyncedAt 미설정 건만 처리한다.
 */
async function syncSentBatchFailures() {
  const lagBefore = new Date(Date.now() - RESULT_LAG_MS);
  const due = await prisma.placeBoosterBatch.findMany({
    where: {
      status: 'SENT',
      scheduledAt: { lt: lagBefore },
      failureSyncedAt: null,
      aligoMids: { isEmpty: false },
    },
    select: { id: true },
    take: FAILURE_SYNC_BATCH_LIMIT,
  });
  for (const b of due) {
    try {
      const { checked, suppressed } = await syncBatchFailures(b.id);
      if (suppressed > 0) {
        console.log(`[PlaceBoosterWorker] batch ${b.id} 차단 회수: checked=${checked}, suppressed=${suppressed}`);
      }
    } catch (error) {
      console.error(`[PlaceBoosterWorker] batch ${b.id} 결과 수집 실패:`, error);
      // failureSyncedAt 미설정 → 다음 틱에서 재시도
    }
  }
}

/**
 * (E): 알리고 시절 예약(숫자 mid) 이관 — "태그히어플레이스" 채널 정지로 알리고 예약은 발송돼도 실패한다.
 * 발송 6분 이상 남은 예약 회차는 알리고 예약을 취소하고, 수신자는 그대로 둔 채(outboxId 없음 → 재발송 대상)
 * 다시 등록 대기(SCHEDULED)로 돌려 솔라피로 같은 손님에게 원래 시각에 예약한다.
 */
const ALIGO_CANCEL_LEAD_MS = 6 * 60 * 1000;
async function migrateAligoReservations() {
  const due = await prisma.placeBoosterBatch.findMany({
    where: {
      status: { in: ['REGISTERED', 'SENDING'] },
      scheduledAt: { gt: new Date(Date.now() + ALIGO_CANCEL_LEAD_MS) },
      campaign: { deletedAt: null, paymentStatus: 'PAID', status: { in: ['SCHEDULED', 'RUNNING'] }, registeringAt: null },
    },
    select: { id: true, aligoMids: true, ownerAligoMid: true },
    take: 50,
  });
  for (const b of due) {
    const legacy = [...b.aligoMids, ...(b.ownerAligoMid ? [b.ownerAligoMid] : [])].filter((m) => /^\d+$/.test(m));
    if (legacy.length === 0) continue;
    let ok = true;
    for (const mid of legacy) {
      const r = await cancelBoosterReservation(mid);
      if (!r.success) {
        ok = false;
        console.error(`[PlaceBoosterWorker] 알리고 예약 취소 실패 batch=${b.id} mid=${mid}: ${r.error ?? 'unknown'}`);
      }
    }
    if (!ok) continue; // 다음 틱 재시도 (취소된 mid 를 다시 취소해도 무해)
    await prisma.placeBoosterBatch.update({
      where: { id: b.id },
      data: {
        status: 'SCHEDULED',
        aligoMids: b.aligoMids.filter((m) => !/^\d+$/.test(m)),
        ownerAligoMid: b.ownerAligoMid && !/^\d+$/.test(b.ownerAligoMid) ? b.ownerAligoMid : null,
        reservedAt: null,
      },
    });
    console.log(`[PlaceBoosterWorker] 알리고 예약 ${legacy.length}건 취소 → 솔라피 재등록 대기 batch=${b.id}`);
  }
}

let running = false;
async function processTick() {
  if (running) return; // 이전 틱이 길어지면(대량 등록) 중첩 방지
  running = true;
  try {
    await migrateAligoReservations();
    await registerPendingBatches();
    await flipSentBatches();
    await syncSentBatchFailures();
  } finally {
    running = false;
  }
}

export function startPlaceBoosterWorker() {
  console.log('[PlaceBoosterWorker] started (poll 60s, 솔라피 태그히어 채널 예약 발송 등록)');
  processTick().catch((e) => console.error('[PlaceBoosterWorker] initial run error:', e));
  setInterval(() => {
    processTick().catch((e) => console.error('[PlaceBoosterWorker] error:', e));
  }, POLL_INTERVAL_MS);
}
