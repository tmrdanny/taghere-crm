import { prisma as prismaClient } from '../lib/prisma.js';
import { enqueueAlimTalk } from './solapi.js';

const prisma = prismaClient as any;

type WaitingStatus = 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
type WaitingSource = 'QR' | 'TABLET' | 'MANUAL';
type CancelReason = 'CUSTOMER_REQUEST' | 'STORE_REASON' | 'OUT_OF_STOCK' | 'NO_SHOW' | 'AUTO_CANCELLED';

export interface WaitingRegistrationParams {
  storeId: string;
  waitingTypeId: string;
  phone?: string;
  name?: string;
  partySize: number;
  memo?: string;
  source: WaitingSource;
  consentMarketing?: boolean;
}

export interface WaitingStats {
  totalWaiting: number;
  totalPartySize: number;
  estimatedMinutes: number;
  byType: {
    typeId: string;
    typeName: string;
    waitingCount: number;
    estimatedMinutes: number;
  }[];
}

export interface TodayStats {
  totalRegistered: number;
  totalSeated: number;
  totalCancelled: number;
  totalNoShow: number;
  avgWaitTime: number;
}

export function getTodayStartEnd() {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstDateStr = kstNow.toISOString().split('T')[0];
  const todayStart = new Date(kstDateStr + 'T00:00:00+09:00');
  const todayEnd = new Date(kstDateStr + 'T23:59:59.999+09:00');
  return { todayStart, todayEnd };
}

export async function getNextWaitingNumber(storeId: string): Promise<number> {
  const { todayStart, todayEnd } = getTodayStartEnd();

  const lastWaiting = await prisma.waitingList.findFirst({
    where: {
      storeId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { waitingNumber: 'desc' },
    select: { waitingNumber: true },
  });

  return (lastWaiting?.waitingNumber ?? 0) + 1;
}

export async function calculateEstimatedWaitTime(
  storeId: string,
  waitingTypeId: string
): Promise<number> {
  const waitingType = await prisma.waitingType.findUnique({
    where: { id: waitingTypeId },
    select: { avgWaitTimePerTeam: true },
  });

  if (!waitingType) return 0;

  const waitingAhead = await prisma.waitingList.count({
    where: {
      storeId,
      waitingTypeId,
      status: { in: ['WAITING', 'CALLED'] },
    },
  });

  return waitingAhead * waitingType.avgWaitTimePerTeam;
}

export async function registerWaiting(
  params: WaitingRegistrationParams
): Promise<{
  success: boolean;
  waitingId?: string;
  waitingNumber?: number;
  position?: number;
  estimatedMinutes?: number;
  error?: string;
}> {
  try {
    const setting = await prisma.waitingSetting.findUnique({
      where: { storeId: params.storeId },
    });

    if (!setting || setting.operationStatus === 'CLOSED') {
      return { success: false, error: '현재 웨이팅 접수가 종료되었습니다.' };
    }

    if (setting.operationStatus === 'PAUSED') {
      return { success: false, error: '현재 웨이팅 접수가 일시 중지되었습니다.' };
    }

    if (setting.operationStatus === 'WALK_IN') {
      return { success: false, error: '현재 바로 입장 가능합니다. 웨이팅이 필요하지 않습니다.' };
    }

    const currentWaitingCount = await prisma.waitingList.count({
      where: {
        storeId: params.storeId,
        status: { in: ['WAITING', 'CALLED'] },
      },
    });

    if (currentWaitingCount >= setting.maxWaitingCount) {
      return { success: false, error: '최대 대기 인원을 초과했습니다.' };
    }

    const waitingType = await prisma.waitingType.findFirst({
      where: { id: params.waitingTypeId, storeId: params.storeId, isActive: true },
    });

    if (!waitingType) {
      return { success: false, error: '유효하지 않은 웨이팅 유형입니다.' };
    }

    if (params.phone) {
      const { todayStart, todayEnd } = getTodayStartEnd();
      const existingWaiting = await prisma.waitingList.findFirst({
        where: {
          storeId: params.storeId,
          phone: params.phone,
          status: { in: ['WAITING', 'CALLED'] },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (existingWaiting) {
        return { success: false, error: '이미 웨이팅 중인 전화번호입니다.' };
      }
    }

    const waitingNumber = await getNextWaitingNumber(params.storeId);
    const estimatedMinutes = await calculateEstimatedWaitTime(params.storeId, params.waitingTypeId);

    const position = await prisma.waitingList.count({
      where: {
        storeId: params.storeId,
        waitingTypeId: params.waitingTypeId,
        status: { in: ['WAITING', 'CALLED'] },
      },
    }) + 1;

    const phoneLastDigits = params.phone ? params.phone.slice(-4) : null;

    const waiting = await prisma.waitingList.create({
      data: {
        storeId: params.storeId,
        waitingTypeId: params.waitingTypeId,
        waitingNumber,
        phone: params.phone,
        phoneLastDigits,
        name: params.name,
        partySize: params.partySize,
        memo: params.memo,
        source: params.source,
        consentMarketing: params.consentMarketing ?? false,
        estimatedWaitMinutes: estimatedMinutes,
        status: 'WAITING',
      },
    });

    if (params.phone) {
      const store = await prisma.store.findUnique({
        where: { id: params.storeId },
        select: { name: true, slug: true },
      });

      await sendWaitingRegisteredAlimTalk({
        storeId: params.storeId,
        waitingId: waiting.id,
        phone: params.phone,
        storeName: store?.name ?? '',
        storeSlug: store?.slug ?? '',
        waitingNumber,
        position,
        partySize: params.partySize,
        waitingNote: setting?.waitingNote ?? '',
      });
    }

    return {
      success: true,
      waitingId: waiting.id,
      waitingNumber,
      position,
      estimatedMinutes,
    };
  } catch (error: any) {
    console.error('[Waiting] Register error:', error);
    return { success: false, error: error.message || '웨이팅 등록 중 오류가 발생했습니다.' };
  }
}

export async function callWaiting(
  storeId: string,
  waitingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
      include: { waitingType: true },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (waiting.status !== 'WAITING') {
      return { success: false, error: '대기 중인 웨이팅만 호출할 수 있습니다.' };
    }

    const setting = await prisma.waitingSetting.findUnique({
      where: { storeId },
    });

    const callTimeoutMinutes = setting?.callTimeoutMinutes ?? 3;
    const callExpireAt = new Date(Date.now() + callTimeoutMinutes * 60 * 1000);

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        status: 'CALLED',
        calledAt: new Date(),
        calledCount: 1,
        callExpireAt,
      },
    });

    if (waiting.phone) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, slug: true },
      });

      await sendWaitingCalledAlimTalk({
        storeId,
        waitingId,
        phone: waiting.phone,
        storeSlug: store?.slug ?? '',
        waitingNumber: waiting.waitingNumber,
        timeoutMinutes: callTimeoutMinutes,
        waitingCallNote: setting?.waitingCallNote ?? '',
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Waiting] Call error:', error);
    return { success: false, error: error.message || '호출 중 오류가 발생했습니다.' };
  }
}

export async function recallWaiting(
  storeId: string,
  waitingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (waiting.status !== 'CALLED') {
      return { success: false, error: '호출 중인 웨이팅만 재호출할 수 있습니다.' };
    }

    const setting = await prisma.waitingSetting.findUnique({
      where: { storeId },
    });

    const maxCallCount = setting?.maxCallCount ?? 2;

    if (waiting.calledCount >= maxCallCount) {
      return { success: false, error: `최대 호출 횟수(${maxCallCount}회)를 초과했습니다.` };
    }

    const callTimeoutMinutes = setting?.callTimeoutMinutes ?? 3;
    const callExpireAt = new Date(Date.now() + callTimeoutMinutes * 60 * 1000);

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        calledCount: waiting.calledCount + 1,
        callExpireAt,
      },
    });

    if (waiting.phone) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });

      await sendWaitingRecalledAlimTalk({
        storeId,
        waitingId,
        phone: waiting.phone,
        storeName: store?.name ?? '',
        waitingNumber: waiting.waitingNumber,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Waiting] Recall error:', error);
    return { success: false, error: error.message || '재호출 중 오류가 발생했습니다.' };
  }
}

export async function seatWaiting(
  storeId: string,
  waitingId: string
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (!['WAITING', 'CALLED'].includes(waiting.status)) {
      return { success: false, error: '대기 중이거나 호출 중인 웨이팅만 착석 처리할 수 있습니다.' };
    }

    let customerId = waiting.customerId;

    if (waiting.phone && !customerId) {
      const normalizedPhone = waiting.phone.replace(/[^0-9]/g, '');
      const phoneLastDigits = normalizedPhone.slice(-8);

      let customer = await prisma.customer.findFirst({
        where: {
          storeId,
          phoneLastDigits,
        },
      });

      if (!customer) {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { addressSido: true, addressSigungu: true },
        });

        customer = await prisma.customer.create({
          data: {
            storeId,
            phone: normalizedPhone,
            phoneLastDigits,
            name: waiting.name,
            consentMarketing: waiting.consentMarketing,
            visitCount: 1,
            lastVisitAt: new Date(),
            regionSido: store?.addressSido,
            regionSigungu: store?.addressSigungu,
          },
        });
      } else {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            visitCount: { increment: 1 },
            lastVisitAt: new Date(),
          },
        });
      }

      customerId = customer.id;
    }

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        status: 'SEATED',
        seatedAt: new Date(),
        customerId,
      },
    });

    return { success: true, customerId: customerId ?? undefined };
  } catch (error: any) {
    console.error('[Waiting] Seat error:', error);
    return { success: false, error: error.message || '착석 처리 중 오류가 발생했습니다.' };
  }
}

export async function cancelWaiting(
  storeId: string,
  waitingId: string,
  reason: CancelReason,
  sendAlimTalk: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (!['WAITING', 'CALLED'].includes(waiting.status)) {
      return { success: false, error: '대기 중이거나 호출 중인 웨이팅만 취소할 수 있습니다.' };
    }

    const newStatus: WaitingStatus = reason === 'NO_SHOW' ? 'NO_SHOW' : 'CANCELLED';

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        status: newStatus,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    if (sendAlimTalk && waiting.phone) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });

      const setting = await prisma.waitingSetting.findUnique({
        where: { storeId },
        select: { callTimeoutMinutes: true },
      });

      await sendWaitingCancelledAlimTalk({
        storeId,
        waitingId,
        phone: waiting.phone,
        storeName: store?.name ?? '',
        waitingNumber: waiting.waitingNumber,
        reason,
        callTimeoutMinutes: setting?.callTimeoutMinutes ?? 3,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Waiting] Cancel error:', error);
    return { success: false, error: error.message || '취소 처리 중 오류가 발생했습니다.' };
  }
}

export async function deferWaiting(
  storeId: string,
  waitingId: string
): Promise<{ success: boolean; newPosition?: number; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (!['WAITING', 'CALLED'].includes(waiting.status)) {
      return { success: false, error: '대기 중이거나 호출 중인 웨이팅만 순서를 미룰 수 있습니다.' };
    }

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        status: 'WAITING',
        calledAt: null,
        calledCount: 0,
        callExpireAt: null,
        isDeferred: true,
        createdAt: new Date(),
      },
    });

    const newPosition = await prisma.waitingList.count({
      where: {
        storeId,
        waitingTypeId: waiting.waitingTypeId,
        status: { in: ['WAITING', 'CALLED'] },
      },
    });

    return { success: true, newPosition };
  } catch (error: any) {
    console.error('[Waiting] Defer error:', error);
    return { success: false, error: error.message || '순서 미루기 중 오류가 발생했습니다.' };
  }
}

export async function restoreWaiting(
  storeId: string,
  waitingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: waitingId, storeId },
    });

    if (!waiting) {
      return { success: false, error: '웨이팅을 찾을 수 없습니다.' };
    }

    if (!['SEATED', 'CANCELLED', 'NO_SHOW'].includes(waiting.status)) {
      return { success: false, error: '착석, 취소, 노쇼 상태의 웨이팅만 되돌릴 수 있습니다.' };
    }

    const completedAt = waiting.seatedAt || waiting.cancelledAt;
    if (completedAt) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      if (completedAt < thirtyMinutesAgo) {
        return { success: false, error: '30분이 지난 웨이팅은 되돌릴 수 없습니다.' };
      }
    }

    await prisma.waitingList.update({
      where: { id: waitingId },
      data: {
        status: 'WAITING',
        seatedAt: null,
        cancelledAt: null,
        cancelReason: null,
        calledAt: null,
        calledCount: 0,
        callExpireAt: null,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Waiting] Restore error:', error);
    return { success: false, error: error.message || '되돌리기 중 오류가 발생했습니다.' };
  }
}

export async function getWaitingStats(storeId: string): Promise<WaitingStats> {
  const waitingTypes = await prisma.waitingType.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  const waitingCounts = await prisma.waitingList.groupBy({
    by: ['waitingTypeId'],
    where: {
      storeId,
      status: { in: ['WAITING', 'CALLED'] },
    },
    _count: { id: true },
    _sum: { partySize: true },
  });

  const countMap = new Map<string, { count: number; partySize: number }>(
    waitingCounts.map((c: any) => [c.waitingTypeId, { count: c._count.id, partySize: c._sum.partySize ?? 0 }])
  );

  let totalWaiting = 0;
  let totalPartySize = 0;
  let totalEstimatedMinutes = 0;

  const byType = waitingTypes.map((type: any) => {
    const stats = countMap.get(type.id) || { count: 0, partySize: 0 };
    const estimatedMinutes = stats.count * type.avgWaitTimePerTeam;

    totalWaiting += stats.count;
    totalPartySize += stats.partySize;
    totalEstimatedMinutes = Math.max(totalEstimatedMinutes, estimatedMinutes);

    return {
      typeId: type.id,
      typeName: type.name,
      waitingCount: stats.count,
      estimatedMinutes,
    };
  });

  return {
    totalWaiting,
    totalPartySize,
    estimatedMinutes: totalEstimatedMinutes,
    byType,
  };
}

export async function getTodayStats(storeId: string): Promise<TodayStats> {
  const { todayStart, todayEnd } = getTodayStartEnd();

  const stats = await prisma.waitingList.groupBy({
    by: ['status'],
    where: {
      storeId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    _count: { id: true },
  });

  const statusMap = new Map<string, number>(stats.map((s: any) => [s.status, s._count.id]));

  const seatedWaitings = await prisma.waitingList.findMany({
    where: {
      storeId,
      status: 'SEATED',
      createdAt: { gte: todayStart, lte: todayEnd },
      seatedAt: { not: null },
    },
    select: { createdAt: true, seatedAt: true },
  });

  let avgWaitTime = 0;
  if (seatedWaitings.length > 0) {
    const totalWaitTime = seatedWaitings.reduce((sum: number, w: any) => {
      if (w.seatedAt) {
        return sum + (w.seatedAt.getTime() - w.createdAt.getTime());
      }
      return sum;
    }, 0);
    avgWaitTime = Math.round(totalWaitTime / seatedWaitings.length / 60000);
  }

  return {
    totalRegistered:
      (statusMap.get('WAITING') ?? 0) +
      (statusMap.get('CALLED') ?? 0) +
      (statusMap.get('SEATED') ?? 0) +
      (statusMap.get('CANCELLED') ?? 0) +
      (statusMap.get('NO_SHOW') ?? 0),
    totalSeated: statusMap.get('SEATED') ?? 0,
    totalCancelled: statusMap.get('CANCELLED') ?? 0,
    totalNoShow: statusMap.get('NO_SHOW') ?? 0,
    avgWaitTime,
  };
}

export async function processAutoCancel(): Promise<number> {
  const now = new Date();

  const expiredWaitings = await prisma.waitingList.findMany({
    where: {
      status: 'CALLED',
      callExpireAt: { lte: now },
    },
  });

  let cancelledCount = 0;

  for (const waiting of expiredWaitings) {
    const setting = await prisma.waitingSetting.findUnique({
      where: { storeId: waiting.storeId },
    });

    if (!setting?.autoCancel) continue;

    if (waiting.calledCount >= (setting.maxCallCount ?? 2)) {
      await cancelWaiting(waiting.storeId, waiting.id, 'AUTO_CANCELLED', true);
      cancelledCount++;
    }
  }

  return cancelledCount;
}

async function sendWaitingRegisteredAlimTalk(params: {
  storeId: string;
  waitingId: string;
  phone: string;
  storeName: string;
  storeSlug: string;
  waitingNumber: number;
  position: number;
  partySize: number;
  waitingNote: string;
}): Promise<void> {
  const templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_REGISTERED;
  if (!templateId) return;

  // 솔라피에서 https://를 자동 추가하므로 프로토콜 제거
  const publicUrl = (process.env.PUBLIC_URL || 'https://taghere-crm-web-dev.onrender.com').replace(/^https?:\/\//, '');
  const statusPageUrl = `${publicUrl}/w/${params.storeSlug}/status/${params.phone}`;
  const cancelPageUrl = `${publicUrl}/w/${params.storeSlug}/cancel?phone=${params.phone}`;

  try {
    await enqueueAlimTalk({
      storeId: params.storeId,
      phone: params.phone,
      messageType: 'WAITING_REGISTERED',
      templateId,
      variables: {
        '#{상호명}': params.storeName,
        '#{내순서}': `${params.position}번째`,
        '#{대기번호}': `${params.waitingNumber}번`,
        '#{인원}': `${params.partySize}명`,
        '#{매장안내}': params.waitingNote,
        '#{실시간순서확인페이지}': statusPageUrl,
        '#{웨이팅취소페이지}': cancelPageUrl,
      },
      idempotencyKey: `waiting_registered:${params.waitingId}`,
    });
  } catch (error) {
    console.error('[Waiting] Failed to send registered alimtalk:', error);
  }
}

async function sendWaitingCalledAlimTalk(params: {
  storeId: string;
  waitingId: string;
  phone: string;
  storeSlug: string;
  waitingNumber: number;
  timeoutMinutes: number;
  waitingCallNote: string;
}): Promise<void> {
  const templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_CALLED;
  if (!templateId) return;

  // 솔라피에서 https://를 자동 추가하므로 프로토콜 제거
  const publicUrl = (process.env.PUBLIC_URL || 'https://taghere-crm-web-dev.onrender.com').replace(/^https?:\/\//, '');
  const cancelPageUrl = `${publicUrl}/w/${params.storeSlug}/cancel?phone=${params.phone}`;

  try {
    await enqueueAlimTalk({
      storeId: params.storeId,
      phone: params.phone,
      messageType: 'WAITING_CALLED',
      templateId,
      variables: {
        '#{대기번호}': String(params.waitingNumber),
        '#{제한시간}': String(params.timeoutMinutes),
        '#{매장유의사항}': params.waitingCallNote,
        '#{웨이팅취소페이지}': cancelPageUrl,
      },
      idempotencyKey: `waiting_called:${params.waitingId}:${Date.now()}`,
    });
  } catch (error) {
    console.error('[Waiting] Failed to send called alimtalk:', error);
  }
}

async function sendWaitingRecalledAlimTalk(params: {
  storeId: string;
  waitingId: string;
  phone: string;
  storeName: string;
  waitingNumber: number;
}): Promise<void> {
  const templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_RECALLED;
  if (!templateId) return;

  try {
    await enqueueAlimTalk({
      storeId: params.storeId,
      phone: params.phone,
      messageType: 'WAITING_CALLED',
      templateId,
      variables: {
        '#{매장명}': params.storeName,
        '#{대기번호}': String(params.waitingNumber),
      },
      idempotencyKey: `waiting_recalled:${params.waitingId}:${Date.now()}`,
    });
  } catch (error) {
    console.error('[Waiting] Failed to send recalled alimtalk:', error);
  }
}

async function sendWaitingCancelledAlimTalk(params: {
  storeId: string;
  waitingId: string;
  phone: string;
  storeName: string;
  waitingNumber: number;
  reason: CancelReason;
  callTimeoutMinutes: number;
}): Promise<void> {
  let templateId: string | undefined;
  let variables: Record<string, string>;

  switch (params.reason) {
    case 'CUSTOMER_REQUEST':
      // 고객님 사정으로 웨이팅 취소
      templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_CUSTOMER;
      variables = {
        '#{매장명}': params.storeName,
      };
      break;

    case 'NO_SHOW':
    case 'AUTO_CANCELLED':
      // 웨이팅 지각으로 인한 취소 알림
      templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_TIMEOUT;
      variables = {
        '#{제한시간}': String(params.callTimeoutMinutes),
        '#{매장명}': params.storeName,
      };
      break;

    case 'STORE_REASON':
    case 'OUT_OF_STOCK':
      // 매장 사정으로 인한 웨이팅 취소 알림
      templateId = process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_STORE;
      variables = {
        '#{매장명}': params.storeName,
      };
      break;

    default:
      return;
  }

  if (!templateId) return;

  try {
    await enqueueAlimTalk({
      storeId: params.storeId,
      phone: params.phone,
      messageType: 'WAITING_CANCELLED',
      templateId,
      variables,
      idempotencyKey: `waiting_cancelled:${params.waitingId}:${Date.now()}`,
    });
  } catch (error) {
    console.error('[Waiting] Failed to send cancelled alimtalk:', error);
  }
}
