// 야화 포인트 연동 — 태그히어가 진실원천. 전화번호(뒷 8자리)로 매칭된 야화 사용자가
// 앱에서 포인트를 소비하면 이 서비스가 매장별 잔액에서 원자적으로 차감한다.
import { prisma as prismaClient } from '../lib/prisma.js';

const prisma = prismaClient as any;

export type SpendYahwaPointsResult =
  | { ok: true; spent: number; total_balance: number; stores: { store_id: string; balance: number }[] }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'insufficient_points'; available: number };

/**
 * idempotency_key 재요청 시 최초 결과를 그대로 재반환하기 위해 PointLedger.reason에
 * `yahwa_spend:<key>` 마커를 남겨 조회한다(전용 컬럼 없이 기존 스키마로 처리).
 */
function idemMarker(key: string): string {
  return `yahwa_spend:${key}`;
}

export async function spendYahwaPoints(params: {
  phoneLastDigits: string;
  amount: number;
  idempotencyKey: string;
}): Promise<SpendYahwaPointsResult> {
  const { phoneLastDigits, amount, idempotencyKey } = params;

  // 멱등 재요청 — 이전에 이 키로 처리된 차감이 있으면 그 결과를 재구성해 반환
  const priorLedgers = await prisma.pointLedger.findMany({
    where: { reason: idemMarker(idempotencyKey) },
    select: { storeId: true, delta: true, balance: true },
  });
  if (priorLedgers.length > 0) {
    const customers = await prisma.customer.findMany({
      where: { phoneLastDigits, store: { yahwaEnabled: true } },
      select: { storeId: true, totalPoints: true },
    });
    return {
      ok: true,
      spent: priorLedgers.reduce((s: number, l: any) => s + Math.abs(l.delta), 0),
      total_balance: customers.reduce((s: number, c: any) => s + c.totalPoints, 0),
      stores: customers.map((c: any) => ({ store_id: c.storeId, balance: c.totalPoints })),
    };
  }

  const customers = await prisma.customer.findMany({
    where: { phoneLastDigits, store: { yahwaEnabled: true } },
    select: { id: true, storeId: true, totalPoints: true },
    orderBy: { totalPoints: 'desc' },
  });
  if (customers.length === 0) return { ok: false, error: 'not_found' };

  const available = customers.reduce((s: number, c: any) => s + c.totalPoints, 0);
  if (available < amount) return { ok: false, error: 'insufficient_points', available };

  // 큰 잔액 매장부터 차감 — 매장 터치 수 최소화. 전부 하나의 트랜잭션으로 원자 처리.
  let remaining = amount;
  const ops: any[] = [];
  const touched: { store_id: string; balance: number }[] = [];
  for (const c of customers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, c.totalPoints);
    if (take <= 0) continue;
    const newBalance = c.totalPoints - take;
    remaining -= take;
    ops.push(
      prisma.customer.update({ where: { id: c.id }, data: { totalPoints: newBalance } }),
      prisma.pointLedger.create({
        data: {
          storeId: c.storeId,
          customerId: c.id,
          delta: -take,
          balance: newBalance,
          type: 'USE',
          reason: idemMarker(idempotencyKey),
        },
      }),
    );
    touched.push({ store_id: c.storeId, balance: newBalance });
  }

  await prisma.$transaction(ops);

  return {
    ok: true,
    spent: amount,
    total_balance: available - amount,
    stores: touched,
  };
}
