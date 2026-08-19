import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { enqueuePointsEarnedAlimTalk } from './solapi.js';

/**
 * 후불 주문 일반 포인트 "적립 예약" 도메인 로직.
 *
 * 고객이 적립을 요청한 시점에는 아직 결제 전이므로 PointLedger 를 쓰지 않고 예약 행만 만든다.
 * 실제 적립(원장 + 잔액 + 알림톡)은 아래 두 경로에서만 일어나며 둘 다 finalizePendingAccrual 을 공유한다.
 *   1) POS 결제완료 통보  → POST /api/taghere/webhook/order-paid
 *   2) 12시간 타임아웃    → pending-accrual-worker
 */

/** 예약 유효기간. 이 시간까지 결제 신호가 없으면 워커가 자동 적립한다. */
export const PENDING_ACCRUAL_TTL_HOURS = 12;

/**
 * 지연 적립 전환으로 생성된 EARN 원장의 reason 접두사.
 *
 * 이 원장의 `createdAt` 은 "방문 시각"이 아니라 "결제완료 시각"이다. 야간 영업 매장에서
 * 늦은 밤 방문 → 다음 일자 경계를 넘겨 결제완료되면 원장이 다음 날짜로 남아, 원장 기준으로 "오늘 첫 방문"을
 * 판정하는 코드가 그날의 진짜 방문을 첫 방문이 아니라고 오판한다.
 * 그래서 방문/적립 빈도 판정 쿼리에서는 이 접두사를 가진 원장을 제외하고,
 * 지연 방문은 `hasTodayPendingAccrual`(예약 생성 시각 = 방문 시각 기준)이 대신 대표한다.
 */
export const DEFERRED_ACCRUAL_REASON_PREFIX = 'TagHere 결제완료 적립';

export type PendingAccrualSource = 'IN_APP' | 'AUTO_EARN' | 'KAKAO_CALLBACK';
export type FinalizeReason = 'PAYMENT' | 'TIMEOUT';

export interface ReservePendingAccrualParams {
  storeId: string;
  customerId: string;
  orderId: string;
  purAmt: number;
  ratePercent: number;
  earnPoints: number;
  tableLabel?: string | null;
  sendAlimtalk: boolean;
  source: PendingAccrualSource;
}

export function buildPendingAccrualExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PENDING_ACCRUAL_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * 예약 행 생성용 data 객체.
 * 호출부가 기존 $transaction([...]) 배열에 `prisma.pendingPointAccrual.create({ data })` 로
 * 그대로 밀어넣을 수 있도록 data 만 만들어 준다(방문 기록/포인트 사용과 같은 트랜잭션으로 묶기 위함).
 */
export function buildPendingAccrualData(
  params: ReservePendingAccrualParams,
): Prisma.PendingPointAccrualUncheckedCreateInput {
  return {
    storeId: params.storeId,
    customerId: params.customerId,
    orderId: params.orderId,
    purAmt: params.purAmt,
    ratePercent: params.ratePercent,
    earnPoints: params.earnPoints,
    tableLabel: params.tableLabel ?? null,
    sendAlimtalk: params.sendAlimtalk,
    source: params.source,
    expiresAt: buildPendingAccrualExpiresAt(),
  };
}

/** 해당 주문에 살아있는(PENDING) 예약이 있는지 조회. */
export async function findPendingAccrual(storeId: string, orderId: string) {
  return prisma.pendingPointAccrual.findUnique({
    where: { storeId_orderId: { storeId, orderId } },
  });
}

/**
 * 오늘 이 고객의 적립 예약이 이미 있는지.
 *
 * "오늘 첫 방문" 판정은 원래 PointLedger EARN 존재 여부로만 했는데, 지연 적립은 EARN 을
 * 만들지 않으므로 이 조회를 함께 보지 않으면 같은 날 추가주문마다 visitCount 가 다시 증가한다.
 */
export async function hasTodayPendingAccrual(storeId: string, customerId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // CANCELED 도 포함한다. 즉시 적립 경로는 주문이 취소돼도 EARN 원장이 남고 ADJUST 만 추가되므로
  // 같은 날 재주문에서 visitCount 가 다시 오르지 않는다. 예약만 파기하고 원장이 없는 지연 경로를
  // 제외해 버리면 그 대칭이 깨져 방문 횟수가 이중 증가한다(취소로 visitCount 를 되돌리지도 않는다).
  const found = await prisma.pendingPointAccrual.findFirst({
    where: {
      storeId,
      customerId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true },
  });

  return !!found;
}

/**
 * 오늘 이 고객에게 이미 적립 원장이 생겼는지 — 적립 알림톡 `FIRST_ONLY` 빈도 판정용.
 *
 * 방문 판정(`hasTodayPendingAccrual`)과 달리 **지연 전환분도 제외하지 않는다.**
 * 기준이 "오늘 이미 적립 알림톡이 나갔는가" 이고, 지연 전환도 전환 시점에 한 통을 보내기 때문이다.
 * (전환이 날짜 경계를 넘기면 그 발송이 다음 날의 1통을 소진한다 — 매장이 설정한 "하루 1통" 문자 그대로.)
 */
export async function hasTodayEarnLedger(storeId: string, customerId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const found = await prisma.pointLedger.findFirst({
    where: {
      customerId,
      storeId,
      type: 'EARN',
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true },
  });

  return !!found;
}

export interface FinalizeResult {
  finalized: boolean;
  status: 'ACCRUED' | 'NOT_FOUND' | 'ALREADY_ACCRUED' | 'CANCELED';
  savedPoint: number;
  balance: number | null;
}

/**
 * 예약 → 실제 적립 전환. 결제완료 통보와 타임아웃 워커가 공유하는 유일한 경로다.
 *
 * 멱등성: 상태를 PENDING → ACCRUED 로 바꾸는 updateMany 의 count 를 가드로 쓴다.
 * count === 0 이면 다른 요청(재전송/동시 전송/워커)이 이미 전환했거나 취소된 것이므로 아무것도 하지 않는다.
 * 이 가드 덕분에 CRM 이 다중 인스턴스로 떠 있어도 분산 락이 필요 없다.
 *
 * 적립액은 예약 시점 스냅샷(earnPoints)을 그대로 쓴다 — 고객 화면이 이미 그 숫자를 약속했기 때문.
 */
export async function finalizePendingAccrual(
  pendingId: string,
  reason: FinalizeReason,
): Promise<FinalizeResult> {
  const pending = await prisma.pendingPointAccrual.findUnique({ where: { id: pendingId } });

  if (!pending) {
    return { finalized: false, status: 'NOT_FOUND', savedPoint: 0, balance: null };
  }
  if (pending.status === 'ACCRUED') {
    return { finalized: false, status: 'ALREADY_ACCRUED', savedPoint: pending.earnPoints, balance: null };
  }
  if (pending.status === 'CANCELED') {
    return { finalized: false, status: 'CANCELED', savedPoint: 0, balance: null };
  }

  const finalizedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 원자적 상태 전이 가드 — 경합에서 진 쪽은 여기서 걸러진다.
    const claimed = await tx.pendingPointAccrual.updateMany({
      where: { id: pendingId, status: 'PENDING' },
      data: { status: 'ACCRUED', finalizedAt, finalizeReason: reason },
    });
    if (claimed.count === 0) {
      return null;
    }

    const earnPoints = pending.earnPoints;

    if (earnPoints <= 0) {
      return { earnPoints, newBalance: null, pointLedgerId: null };
    }

    // 예약 시점 잔액을 신뢰하지 않는다. 읽고-더해-덮어쓰면 동시 writer(포인트 사용·수기 조정)와
    // lost update 가 나므로 increment 로 원자 갱신하고, 그 결과를 원장 balance 로 쓴다.
    const updatedCustomer = await tx.customer.update({
      where: { id: pending.customerId },
      // 방문 통계(visitCount/lastVisitAt)는 예약 시점에 이미 반영했으므로 잔액만 갱신한다.
      data: { totalPoints: { increment: earnPoints } },
    });
    const newBalance = updatedCustomer.totalPoints;

    const ledger = await tx.pointLedger.create({
      data: {
        storeId: pending.storeId,
        customerId: pending.customerId,
        delta: earnPoints,
        balance: newBalance,
        type: 'EARN',
        reason: `${DEFERRED_ACCRUAL_REASON_PREFIX} (orderId: ${pending.orderId})`,
        orderId: pending.orderId,
        tableLabel: pending.tableLabel,
      },
    });

    await tx.pendingPointAccrual.update({
      where: { id: pendingId },
      data: { pointLedgerId: ledger.id },
    });

    return { earnPoints, newBalance, pointLedgerId: ledger.id };
  });

  if (!result) {
    // 경합에서 졌다 — 다른 요청이 전환했거나 주문취소로 파기됐다. 실제 상태를 다시 읽어 알린다.
    const current = await prisma.pendingPointAccrual.findUnique({
      where: { id: pendingId },
      select: { status: true, earnPoints: true },
    });
    return {
      finalized: false,
      status: current?.status === 'CANCELED' ? 'CANCELED' : 'ALREADY_ACCRUED',
      savedPoint: current?.status === 'CANCELED' ? 0 : pending.earnPoints,
      balance: null,
    };
  }

  await sendAccrualAlimtalk(pending, result.earnPoints, result.newBalance, result.pointLedgerId);

  console.log(
    `[PendingAccrual] 적립 전환 완료 - pendingId: ${pendingId}, orderId: ${pending.orderId}, reason: ${reason}, earnPoints: ${result.earnPoints}, balance: ${result.newBalance}`,
  );

  return {
    finalized: true,
    status: 'ACCRUED',
    savedPoint: result.earnPoints,
    balance: result.newBalance,
  };
}

/**
 * 적립 알림톡 — 예약 시점이 아니라 실제 적립 시점(여기)에서만 발송한다.
 * 게이트는 즉시 적립 경로(/point/transaction, /auto-earn)와 동일하게 맞춘다.
 */
async function sendAccrualAlimtalk(
  pending: {
    id: string;
    storeId: string;
    customerId: string;
    sendAlimtalk: boolean;
    createdAt: Date;
  },
  earnPoints: number,
  newBalance: number | null,
  pointLedgerId: string | null,
): Promise<void> {
  if (!pending.sendAlimtalk || earnPoints <= 0 || !pointLedgerId || newBalance === null) return;

  try {
    const store = await prisma.store.findUnique({
      where: { id: pending.storeId },
      select: { name: true, pointsAlimtalkEnabled: true, pointsAlimtalkFrequency: true },
    });
    if (!store?.pointsAlimtalkEnabled) return;

    const customer = await prisma.customer.findUnique({
      where: { id: pending.customerId },
      select: { phone: true },
    });
    const phoneNumber = customer?.phone?.replace(/[^0-9]/g, '');
    if (!phoneNumber) return;

    // FIRST_ONLY 판정의 "하루"는 발송 시각이 아니라 **예약이 생성된 날(= 실제 방문일)** 이다.
    // 발송 시각으로 잡으면 일자 경계를 넘긴 전환(밤 방문 → 다음 날 결제/타임아웃 전환)이
    // 다음날 방문의 알림톡을 대신 소진해 버린다. 즉시 적립 경로의 판정 기준과도 어긋난다.
    const frequency = store.pointsAlimtalkFrequency || 'EVERY_ORDER';
    if (frequency === 'FIRST_ONLY') {
      const visitDayStart = new Date(pending.createdAt);
      visitDayStart.setHours(0, 0, 0, 0);
      const visitDayEnd = new Date(pending.createdAt);
      visitDayEnd.setHours(23, 59, 59, 999);

      // 그 날 즉시 적립된 원장이 있으면 이미 한 통 나갔다.
      // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다 → OR 로 명시.
      const earlierImmediateEarn = await prisma.pointLedger.findFirst({
        where: {
          customerId: pending.customerId,
          storeId: pending.storeId,
          type: 'EARN',
          createdAt: { gte: visitDayStart, lte: visitDayEnd },
          id: { not: pointLedgerId },
          OR: [
            { reason: null },
            { reason: { not: { startsWith: DEFERRED_ACCRUAL_REASON_PREFIX } } },
          ],
        },
      });
      if (earlierImmediateEarn) return;

      // 같은 날 방문한 다른 예약이 이미 전환됐다면 그때 한 통 나갔다.
      const earlierConvertedReservation = await prisma.pendingPointAccrual.findFirst({
        where: {
          storeId: pending.storeId,
          customerId: pending.customerId,
          status: 'ACCRUED',
          createdAt: { gte: visitDayStart, lte: visitDayEnd },
          id: { not: pending.id },
          pointLedgerId: { not: null },
        },
        select: { id: true },
      });
      if (earlierConvertedReservation) return;
    }

    await enqueuePointsEarnedAlimTalk({
      storeId: pending.storeId,
      customerId: pending.customerId,
      pointLedgerId,
      phone: phoneNumber,
      variables: {
        storeName: store.name,
        points: earnPoints,
        totalPoints: newBalance,
      },
    });
  } catch (err) {
    console.error('[PendingAccrual] Points AlimTalk enqueue failed:', err);
  }
}

/**
 * 주문 취소 시 예약 파기. 적립된 적이 없으므로 ADJUST 원장을 쓰지 않는다.
 * 이미 ACCRUED 된 예약은 건드리지 않는다(원장이 진실원천이고 기존 ADJUST 회수 로직이 처리).
 */
export async function cancelPendingAccrualByOrderId(
  orderId: string,
): Promise<Array<{ storeId: string; customerId: string }>> {
  // 파기 대상의 매장/고객을 호출부에 알려야 한다 — 원장이 없어 조기 반환하는 경우에도
  // 기존 취소 흐름과 동일하게 VisitOrOrder 를 지워야 하기 때문.
  const targets = await prisma.pendingPointAccrual.findMany({
    where: { orderId, status: 'PENDING' },
    select: { id: true, storeId: true, customerId: true },
  });

  if (targets.length === 0) return [];

  const canceled = await prisma.pendingPointAccrual.updateMany({
    where: { id: { in: targets.map(t => t.id) }, status: 'PENDING' },
    data: { status: 'CANCELED', finalizedAt: new Date() },
  });

  if (canceled.count === 0) return [];

  console.log(`[PendingAccrual] 주문취소로 예약 파기 - orderId: ${orderId}, count: ${canceled.count}`);
  return targets.map(({ storeId, customerId }) => ({ storeId, customerId }));
}
