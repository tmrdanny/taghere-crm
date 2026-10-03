// 충전금이 모자라 못 나간 알림톡 수 — 매장·KST 날짜·종류별로 센다.
// 지금까지는 콘솔 로그만 남기고 건너뛰어, 사장님도 우리도 손님이 알림을 못 받는 걸 몰랐다.
// 발송 경로를 막지 않도록 실패는 삼킨다.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function recordBalanceSkip(storeId: string, messageType: string): void {
  const date = kstDate();
  prisma
    .$executeRaw(Prisma.sql`
      INSERT INTO alimtalk_skip_daily (id, "storeId", date, "messageType", count, "updatedAt")
      VALUES (${'sk_' + Math.random().toString(36).slice(2) + Date.now().toString(36)}, ${storeId}, ${date}, ${messageType}, 1, now())
      ON CONFLICT ("storeId", date, "messageType") DO UPDATE SET count = alimtalk_skip_daily.count + 1, "updatedAt" = now()`)
    .catch((e) => console.error('[SkipCounter] record failed:', e?.message));
}

/** 최근 N일 동안 충전금 부족으로 못 나간 알림 수 (종류별) */
export async function balanceSkipsSince(storeId: string, days: number): Promise<{ total: number; byType: Record<string, number> }> {
  const since = kstDate(new Date(Date.now() - (days - 1) * 86400000));
  const rows = await prisma.alimtalkSkipDaily.groupBy({ by: ['messageType'], where: { storeId, date: { gte: since } }, _sum: { count: true } });
  const byType: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byType[r.messageType] = r._sum.count ?? 0;
    total += r._sum.count ?? 0;
  }
  return { total, byType };
}
