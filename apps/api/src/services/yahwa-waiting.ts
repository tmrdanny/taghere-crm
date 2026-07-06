import { prisma as prismaClient } from '../lib/prisma.js';
import { getTodayStartEnd } from './waiting.js';

const prisma = prismaClient as any;

/** 외부 채널 식별자 — 야화 연동 웨이팅을 구분 */
export const EXTERNAL_SOURCE = 'YAHWA';

/** 외부 스펙 상태값 */
export type ExternalStatus =
  | 'requested'
  | 'waiting'
  | 'called'
  | 'seated'
  | 'cancelled'
  | 'no_show'
  | 'expired';

/**
 * 내부 WaitingStatus → 외부 스펙 status 매핑
 * - 호출 후 자동취소(AUTO_CANCELLED)는 "시간 만료"이므로 expired 로 노출
 */
export function mapStatus(internalStatus: string, cancelReason?: string | null): ExternalStatus {
  switch (internalStatus) {
    case 'WAITING':
      return 'waiting';
    case 'CALLED':
      return 'called';
    case 'SEATED':
      return 'seated';
    case 'NO_SHOW':
      return 'no_show';
    case 'CANCELLED':
      return cancelReason === 'AUTO_CANCELLED' ? 'expired' : 'cancelled';
    default:
      return 'waiting';
  }
}

export interface ExternalWaitingState {
  status: ExternalStatus;
  position: number; // 내 앞 대기 팀 수 (0 = 맨 앞/호출됨)
  estimated_wait_min: number;
}

/**
 * 특정 웨이팅의 현재 외부 상태(상태/내앞팀수/예상시간) 계산.
 * waiting 레코드는 waitingType 를 include 한 상태여야 한다.
 */
export async function computeWaitingState(waiting: any): Promise<ExternalWaitingState> {
  const status = mapStatus(waiting.status, waiting.cancelReason);

  // 대기 중일 때만 내 앞 팀 수를 계산. 그 외(호출/착석/취소/만료)는 0.
  if (waiting.status === 'WAITING') {
    const { todayStart } = getTodayStartEnd();
    const ahead = await prisma.waitingList.count({
      where: {
        storeId: waiting.storeId,
        waitingTypeId: waiting.waitingTypeId,
        status: { in: ['WAITING', 'CALLED'] },
        createdAt: { gte: todayStart, lt: waiting.createdAt },
      },
    });
    const avg = waiting.waitingType?.avgWaitTimePerTeam ?? 5;
    return { status, position: ahead, estimated_wait_min: ahead * avg };
  }

  return { status, position: 0, estimated_wait_min: 0 };
}

/**
 * 매장의 현재 대기 팀 수 (WAITING + CALLED, 당일 영업일 기준).
 */
export async function getStoreWaitingCount(storeId: string): Promise<number> {
  const { todayStart, todayEnd } = getTodayStartEnd();
  return prisma.waitingList.count({
    where: {
      storeId,
      status: { in: ['WAITING', 'CALLED'] },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  });
}

/**
 * 매장의 현재 예상 대기시간(분) — 유형별 활성 팀 수 × 팀당 평균 대기시간의 합.
 * 대시보드 '예상시간'과 같은 기준. 지금 등록하는 손님이 기다릴 대략치.
 */
export async function getStoreWaitingEta(storeId: string): Promise<number> {
  const { todayStart, todayEnd } = getTodayStartEnd();
  const grouped = await prisma.waitingList.groupBy({
    by: ['waitingTypeId'],
    where: {
      storeId,
      status: { in: ['WAITING', 'CALLED'] },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    _count: { id: true },
  });
  if (grouped.length === 0) return 0;

  const types = await prisma.waitingType.findMany({
    where: { id: { in: grouped.map((g: any) => g.waitingTypeId) } },
    select: { id: true, avgWaitTimePerTeam: true },
  });
  const avgById = new Map<string, number>(types.map((t: any) => [t.id, t.avgWaitTimePerTeam ?? 5]));
  return grouped.reduce(
    (sum: number, g: any) => sum + g._count.id * (avgById.get(g.waitingTypeId) ?? 5),
    0
  );
}

/**
 * 여러 매장의 대기 팀 수를 한 번에 조회 (★지도 bulk 카운트).
 * yahwaEnabled = true 인 매장만 대상으로 하며, 존재하지 않거나 미연동 매장은 결과에서 생략.
 */
export async function getStoreWaitingCounts(
  storeIds: string[]
): Promise<{ store_id: string; waiting_count: number; updated_at: string }[]> {
  if (storeIds.length === 0) return [];

  // 연동(yahwaEnabled) 매장만 노출
  const enabledStores = await prisma.store.findMany({
    where: { id: { in: storeIds }, yahwaEnabled: true },
    select: { id: true },
  });
  const enabledIds: string[] = enabledStores.map((s: any) => s.id);
  if (enabledIds.length === 0) return [];

  const { todayStart, todayEnd } = getTodayStartEnd();
  const grouped = await prisma.waitingList.groupBy({
    by: ['storeId'],
    where: {
      storeId: { in: enabledIds },
      status: { in: ['WAITING', 'CALLED'] },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    _count: { id: true },
    _max: { updatedAt: true },
  });

  const map = new Map<string, { count: number; updatedAt: Date | null }>(
    grouped.map((g: any) => [g.storeId, { count: g._count.id, updatedAt: g._max.updatedAt }])
  );

  const nowIso = new Date().toISOString();
  return enabledIds.map((id) => {
    const entry = map.get(id);
    return {
      store_id: id,
      waiting_count: entry?.count ?? 0,
      updated_at: entry?.updatedAt ? new Date(entry.updatedAt).toISOString() : nowIso,
    };
  });
}

export interface YahwaRegisterParams {
  storeId: string;
  partySize: number;
  idempotencyKey?: string;
  externalCustomerId: string;
  name?: string;
  phone?: string;
}

export type YahwaRegisterResult =
  | { ok: true; replay: boolean; waiting: any }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'store_closed' }
  | { ok: false; error: 'already_waiting'; waitingId: string };

/**
 * 야화 웨이팅 등록.
 * - 멱등 키 재요청 → 기존 웨이팅 반환 (replay=true)
 * - 동일 매장에 같은 외부 사용자의 활성 웨이팅 존재 → already_waiting
 * - 매장 미운영/미연동/정원초과/유형없음 → store_closed
 */
export async function registerYahwaWaiting(
  params: YahwaRegisterParams
): Promise<YahwaRegisterResult> {
  // 연동 매장 확인
  const store = await prisma.store.findFirst({
    where: { id: params.storeId, yahwaEnabled: true },
    select: { id: true },
  });
  if (!store) return { ok: false, error: 'not_found' };

  // 멱등 키 재요청 → 같은 웨이팅 반환
  if (params.idempotencyKey) {
    const existing = await prisma.waitingList.findUnique({
      where: { externalIdempotencyKey: params.idempotencyKey },
      include: { waitingType: true },
    });
    if (existing) return { ok: true, replay: true, waiting: existing };
  }

  // 운영 상태 확인 (ACCEPTING 만 등록 허용)
  const setting = await prisma.waitingSetting.findUnique({
    where: { storeId: params.storeId },
  });
  if (!setting || setting.operationStatus !== 'ACCEPTING') {
    return { ok: false, error: 'store_closed' };
  }

  // 정원 초과 확인 (당일 영업일 기준 활성 팀 수)
  const activeCount = await getStoreWaitingCount(params.storeId);
  if (activeCount >= setting.maxWaitingCount) {
    return { ok: false, error: 'store_closed' };
  }

  // 같은 외부 사용자의 활성 웨이팅 존재 여부
  const existingActive = await prisma.waitingList.findFirst({
    where: {
      storeId: params.storeId,
      externalSource: EXTERNAL_SOURCE,
      externalCustomerId: params.externalCustomerId,
      status: { in: ['WAITING', 'CALLED'] },
    },
    select: { id: true },
  });
  if (existingActive) {
    return { ok: false, error: 'already_waiting', waitingId: existingActive.id };
  }

  // 기본 웨이팅 유형 선택 (정렬 순서 우선)
  const waitingType = await prisma.waitingType.findFirst({
    where: { storeId: params.storeId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!waitingType) return { ok: false, error: 'store_closed' };

  // 당일 웨이팅 번호 발급
  const { todayStart, todayEnd } = getTodayStartEnd();
  const lastWaiting = await prisma.waitingList.findFirst({
    where: { storeId: params.storeId, createdAt: { gte: todayStart, lte: todayEnd } },
    orderBy: { waitingNumber: 'desc' },
    select: { waitingNumber: true },
  });
  const waitingNumber = (lastWaiting?.waitingNumber ?? 0) + 1;

  const phone = params.phone || null;
  const phoneLastDigits = phone ? phone.replace(/[^0-9]/g, '').slice(-4) : null;

  const created = await prisma.waitingList.create({
    data: {
      storeId: params.storeId,
      waitingTypeId: waitingType.id,
      waitingNumber,
      phone,
      phoneLastDigits,
      name: params.name || null,
      partySize: params.partySize,
      source: 'MANUAL',
      status: 'WAITING',
      externalSource: EXTERNAL_SOURCE,
      externalCustomerId: params.externalCustomerId,
      externalIdempotencyKey: params.idempotencyKey || null,
    },
    include: { waitingType: true },
  });

  // 예상 대기시간 기록 (외부 상태 계산과 동일 기준)
  const state = await computeWaitingState(created);
  if (state.estimated_wait_min !== (created.estimatedWaitMinutes ?? -1)) {
    await prisma.waitingList.update({
      where: { id: created.id },
      data: { estimatedWaitMinutes: state.estimated_wait_min },
    });
    created.estimatedWaitMinutes = state.estimated_wait_min;
  }

  return { ok: true, replay: false, waiting: created };
}
