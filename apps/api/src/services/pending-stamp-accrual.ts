import { Prisma, StampEarnMethod } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueueStampEarnedAlimTalk } from './solapi.js';
import { buildRewardsFromLegacy, checkMilestoneAndDraw, MilestoneResult, RewardEntry, buildStampUsageRule } from '../utils/random-reward.js';
import { PENDING_ACCRUAL_TTL_HOURS } from './pending-point-accrual.js';

/**
 * 후불 주문 스탬프 "적립 예약" 도메인 로직. 포인트(pending-point-accrual)와 같은 구조다.
 *
 * 고객이 적립을 요청한 시점에는 아직 결제 전이므로 StampLedger 를 쓰지 않고 예약 행만 만든다.
 * 실제 적립(원장 + 잔액 + 마일스톤 추첨 + 알림톡)은 아래 두 경로에서만 일어나며
 * 둘 다 finalizePendingStampAccrual 을 공유한다.
 *   1) POS 결제완료 통보  → POST /api/taghere/webhook/order-paid
 *   2) 12시간 타임아웃    → pending-accrual-worker
 *
 * 방문 기록(VisitOrOrder)·visitCount·lastVisitAt 은 예약 시점에 즉시 처리한다
 * ("스탬프 적립 시 무조건 방문 +1" 현행 규칙 유지).
 */

/**
 * 지연 적립 전환으로 생성된 EARN 원장의 reason 접두사.
 *
 * 이 원장의 `createdAt` 은 "방문 시각"이 아니라 "결제완료 시각"이다. 야간 영업 매장에서
 * 늦은 밤 방문 → 다음 일자 경계를 넘겨 결제완료되면 원장이 다음 날짜로 남아,
 * 원장 기준으로 "오늘 이미 적립했는가"를 판정하는 코드가 그날의 진짜 적립을 막아버린다.
 * 그래서 일일 제한 판정 쿼리에서는 이 접두사를 가진 원장을 제외하고,
 * 지연 적립은 `hasTodayPendingStampAccrual`(예약 생성 시각 = 방문 시각 기준)이 대신 대표한다.
 */
export const DEFERRED_STAMP_REASON_PREFIX = 'TagHere 결제완료 스탬프 적립';

export type PendingStampAccrualSource = 'IN_APP' | 'AUTO_EARN' | 'KAKAO_CALLBACK';
export type FinalizeStampReason = 'PAYMENT' | 'TIMEOUT';

export interface ReservePendingStampAccrualParams {
  storeId: string;
  customerId: string;
  orderId: string;
  /** 예약 시점 스냅샷. 예약이 visitCount 를 +1 하므로 첫 방문 보너스 판정도 여기서 확정된다. */
  stampDelta: number;
  earnMethod?: StampEarnMethod | null;
  tableLabel?: string | null;
  sendAlimtalk: boolean;
  source: PendingStampAccrualSource;
}

export function buildPendingStampAccrualExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PENDING_ACCRUAL_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * 예약 행 생성용 data 객체.
 * 호출부가 기존 $transaction 에 `prisma.pendingStampAccrual.create({ data })` 로 그대로
 * 밀어넣을 수 있도록 data 만 만들어 준다(방문 기록과 같은 트랜잭션으로 묶기 위함).
 */
export function buildPendingStampAccrualData(
  params: ReservePendingStampAccrualParams,
): Prisma.PendingStampAccrualUncheckedCreateInput {
  return {
    storeId: params.storeId,
    customerId: params.customerId,
    orderId: params.orderId,
    stampDelta: params.stampDelta,
    earnMethod: params.earnMethod ?? null,
    tableLabel: params.tableLabel ?? null,
    sendAlimtalk: params.sendAlimtalk,
    source: params.source,
    expiresAt: buildPendingStampAccrualExpiresAt(),
  };
}

/** 해당 주문에 예약이 있는지 조회 (PENDING/ACCRUED/CANCELED 모두). */
export async function findPendingStampAccrual(storeId: string, orderId: string) {
  return prisma.pendingStampAccrual.findUnique({
    where: { storeId_orderId: { storeId, orderId } },
  });
}

/**
 * 지연 예약 트랜잭션에서 난 P2002 가 "예약 유니크(storeId, orderId)" 충돌인지 판정한다.
 *
 * 같은 트랜잭션이 visits_orders 유니크도 건드리므로 코드(P2002)만 보고 흡수하면
 * 방문 기록 충돌까지 "예약 완료"로 삼켜 스탬프가 조용히 유실된다.
 * meta.target 이 인덱스명이면 그것으로 판정하고, 없거나(드라이버 차이) 두 테이블이 같은
 * 컬럼 조합이라 구분이 안 되면 예약이 실제로 존재하는지로 되짚는다(없으면 호출부가 rethrow).
 */
export async function isPendingStampAccrualConflict(
  err: { meta?: { target?: unknown } } | null | undefined,
  storeId: string,
  orderId: string,
): Promise<boolean> {
  const target = err?.meta?.target;
  const targetText = Array.isArray(target)
    ? target.join(',')
    : typeof target === 'string'
      ? target
      : '';

  if (targetText.includes('pending_stamp_accrual')) return true;
  if (targetText.includes('visits_orders')) return false;

  return !!(await findPendingStampAccrual(storeId, orderId));
}

/**
 * 오늘 이 고객의 스탬프 적립 예약이 이미 있는지 — 일일 1회 제한 판정용.
 *
 * 지연 적립은 EARN 원장을 만들지 않으므로 이 조회를 함께 보지 않으면
 * 같은 날 추가주문마다 스탬프를 또 적립할 수 있다.
 *
 * 포인트와 달리 CANCELED 는 제외한다. 스탬프에는 취소 회수(ADJUST) 경로가 없어
 * 주문이 취소되면 그날 적립이 통째로 없어지므로, 같은 날 재적립을 막을 이유가 없다.
 */
export async function hasTodayPendingStampAccrual(
  storeId: string,
  customerId: string,
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const found = await prisma.pendingStampAccrual.findFirst({
    where: {
      storeId,
      customerId,
      status: { in: ['PENDING', 'ACCRUED'] },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true },
  });

  return !!found;
}

export interface FinalizeStampResult {
  finalized: boolean;
  status: 'ACCRUED' | 'NOT_FOUND' | 'ALREADY_ACCRUED' | 'CANCELED';
  earnedStamps: number;
  balance: number | null;
}

/**
 * 예약 → 실제 적립 전환. 결제완료 통보와 타임아웃 워커가 공유하는 유일한 경로다.
 *
 * 멱등성: 상태를 PENDING → ACCRUED 로 바꾸는 updateMany 의 count 를 가드로 쓴다.
 * count === 0 이면 다른 요청(재전송/동시 전송/워커)이 이미 전환했거나 취소된 것이므로 아무것도 하지 않는다.
 *
 * 적립 개수는 예약 시점 스냅샷(stampDelta)을 그대로 쓴다 — 고객 화면이 이미 그 숫자를 약속했기 때문.
 * 반면 마일스톤 추첨은 여기서 수행한다(예약에는 당첨 스냅샷이 없다) — 전환 시점의 매장 보상 설정 기준.
 */
export async function finalizePendingStampAccrual(
  pendingId: string,
  reason: FinalizeStampReason,
): Promise<FinalizeStampResult> {
  const pending = await prisma.pendingStampAccrual.findUnique({ where: { id: pendingId } });

  if (!pending) {
    return { finalized: false, status: 'NOT_FOUND', earnedStamps: 0, balance: null };
  }
  if (pending.status === 'ACCRUED') {
    return { finalized: false, status: 'ALREADY_ACCRUED', earnedStamps: pending.stampDelta, balance: null };
  }
  if (pending.status === 'CANCELED') {
    return { finalized: false, status: 'CANCELED', earnedStamps: 0, balance: null };
  }

  // 추첨은 전환 시점 설정 기준. 알림톡 문구 조립에도 같은 설정을 쓴다.
  const store = await prisma.store.findUnique({
    where: { id: pending.storeId },
    select: {
      name: true,
      stampSetting: true,
      reviewAutomationSetting: { select: { benefitText: true } },
    },
  });

  if (!store?.stampSetting) {
    // 설정이 사라진 매장은 적립 근거가 없다. 예약은 PENDING 으로 남겨 워커가 재시도한다.
    console.error(`[PendingStampAccrual] stampSetting 없음 - pendingId: ${pendingId}, storeId: ${pending.storeId}`);
    return { finalized: false, status: 'NOT_FOUND', earnedStamps: 0, balance: null };
  }

  const stampSetting = store.stampSetting;
  const finalizedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 원자적 상태 전이 가드 — 경합에서 진 쪽은 여기서 걸러진다.
    const claimed = await tx.pendingStampAccrual.updateMany({
      where: { id: pendingId, status: 'PENDING' },
      data: { status: 'ACCRUED', finalizedAt, finalizeReason: reason },
    });
    if (claimed.count === 0) {
      return null;
    }

    const customer = await tx.customer.findUnique({
      where: { id: pending.customerId },
      select: { totalStamps: true },
    });
    const previousStamps = customer?.totalStamps ?? 0;
    const newBalance = previousStamps + pending.stampDelta;

    const milestoneResult = checkMilestoneAndDraw(previousStamps, newBalance, stampSetting);

    const ledger = await tx.stampLedger.create({
      data: {
        storeId: pending.storeId,
        customerId: pending.customerId,
        type: 'EARN',
        delta: pending.stampDelta,
        balance: newBalance,
        ordersheetId: pending.orderId,
        earnMethod: pending.earnMethod,
        tableLabel: pending.tableLabel,
        reason: `${DEFERRED_STAMP_REASON_PREFIX} (${pending.orderId})`,
        drawnReward: milestoneResult?.reward ?? null,
        drawnRewardTier: milestoneResult?.tier ?? null,
      },
    });

    // 스탬프는 모든 경로가 절대값 덮어쓰기다(원장 balance 와 일치 유지). increment 를 섞지 않는다.
    // (전환 도중 다른 경로가 잔액을 바꾸면 lost update 가 나지만, 원장 balance 와 잔액을 일치시키는
    //  기존 관례를 따르고 일일 1회 제한상 동시 전환이 희박하므로 그대로 수용한다)
    await tx.customer.update({
      where: { id: pending.customerId },
      // 방문 통계(visitCount/lastVisitAt)는 예약 시점에 이미 반영했으므로 잔액만 갱신한다.
      data: { totalStamps: newBalance },
    });

    await tx.pendingStampAccrual.update({
      where: { id: pendingId },
      data: { stampLedgerId: ledger.id },
    });

    return { newBalance, stampLedgerId: ledger.id, milestoneResult };
  });

  if (!result) {
    // 경합에서 졌다 — 다른 요청이 전환했거나 주문취소로 파기됐다. 실제 상태를 다시 읽어 알린다.
    const current = await prisma.pendingStampAccrual.findUnique({
      where: { id: pendingId },
      select: { status: true },
    });
    return {
      finalized: false,
      status: current?.status === 'CANCELED' ? 'CANCELED' : 'ALREADY_ACCRUED',
      earnedStamps: current?.status === 'CANCELED' ? 0 : pending.stampDelta,
      balance: null,
    };
  }

  await sendStampAccrualAlimtalk(
    pending,
    store,
    result.newBalance,
    result.stampLedgerId,
    result.milestoneResult,
  );

  console.log(
    `[PendingStampAccrual] 적립 전환 완료 - pendingId: ${pendingId}, orderId: ${pending.orderId}, reason: ${reason}, stampDelta: ${pending.stampDelta}, balance: ${result.newBalance}`,
  );

  return {
    finalized: true,
    status: 'ACCRUED',
    earnedStamps: pending.stampDelta,
    balance: result.newBalance,
  };
}

/**
 * 적립 알림톡 — 예약 시점이 아니라 실제 적립 시점(여기)에서만 발송한다.
 * 게이트/변수 조립은 즉시 적립 경로(/webhook/stamp/earn)와 동일하게 맞춘다.
 *
 * 마일스톤 당첨(milestoneResult)도 여기서 알린다. 즉시 적립은 고객 화면 팝업으로 당첨을 보여주지만
 * 지연 전환은 고객 화면이 없어 이 알림톡이 유일한 당첨 통지 채널이다.
 */
async function sendStampAccrualAlimtalk(
  pending: { storeId: string; customerId: string; stampDelta: number; sendAlimtalk: boolean },
  store: {
    name: string;
    stampSetting: { alimtalkEnabled: boolean; rewards: Prisma.JsonValue | null } | null;
    reviewAutomationSetting: { benefitText: string | null } | null;
  },
  newBalance: number,
  stampLedgerId: string,
  milestoneResult: MilestoneResult | null,
): Promise<void> {
  if (!pending.sendAlimtalk || !store.stampSetting?.alimtalkEnabled) return;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: pending.customerId },
      select: { phone: true },
    });
    const phoneNumber = customer?.phone?.replace(/[^0-9]/g, '');
    if (!phoneNumber) return;

    const rewardsForAlimtalk: RewardEntry[] = store.stampSetting.rewards
      ? (store.stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);
    const stampUsageRule = buildStampUsageRule(rewardsForAlimtalk, milestoneResult);
    const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';

    await enqueueStampEarnedAlimTalk({
      storeId: pending.storeId,
      customerId: pending.customerId,
      stampLedgerId,
      phone: phoneNumber,
      variables: {
        storeName: store.name,
        earnedStamps: pending.stampDelta,
        totalStamps: newBalance,
        stampUsageRule,
        reviewGuide,
      },
    });
  } catch (err) {
    console.error('[PendingStampAccrual] Stamp AlimTalk enqueue failed:', err);
  }
}

/**
 * 주문 취소 시 예약 파기. 적립된 적이 없으므로 회수 원장을 쓰지 않는다.
 * 이미 ACCRUED 된 예약은 건드리지 않는다(원장이 진실원천).
 */
export async function cancelPendingStampAccrualByOrderId(
  orderId: string,
): Promise<Array<{ storeId: string; customerId: string }>> {
  // 파기 대상의 매장/고객을 호출부에 알려야 한다 — 원장이 없어 조기 반환하는 경우에도
  // 기존 취소 흐름과 동일하게 VisitOrOrder 를 지워야 하기 때문.
  const targets = await prisma.pendingStampAccrual.findMany({
    where: { orderId, status: 'PENDING' },
    select: { id: true, storeId: true, customerId: true },
  });

  if (targets.length === 0) return [];

  const canceled = await prisma.pendingStampAccrual.updateMany({
    where: { id: { in: targets.map(t => t.id) }, status: 'PENDING' },
    data: { status: 'CANCELED', finalizedAt: new Date() },
  });

  if (canceled.count === 0) return [];

  console.log(`[PendingStampAccrual] 주문취소로 예약 파기 - orderId: ${orderId}, count: ${canceled.count}`);
  return targets.map(({ storeId, customerId }) => ({ storeId, customerId }));
}
