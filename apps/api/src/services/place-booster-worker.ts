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
const REGISTERING_STALE_MS = 10 * 60 * 1000; // 캠페인 등록 잠금 stale 회수(크래시 대비)

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
