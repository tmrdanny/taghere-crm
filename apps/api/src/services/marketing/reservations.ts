// 예약 발송 목록 · 예약 취소 — 문자 / 카카오 쿠폰(알림톡) / 프리미엄 카카오톡 공용.
//
// 모든 마케팅 발송은 MarketingCampaign 으로 남고 예약 발송이면 sentAt 이 예약 시각이다.
// 취소는 ① 솔라피 예약 그룹을 취소하고 ② 발송 기록을 “예약 취소”로 바꾸고 ③ 차감했던 금액을
// 원래 경로(무료 크레딧 / 매장 지갑 / 프랜차이즈 지갑)로 돌려준다.
import { prisma } from '../../lib/prisma.js';
import { getSolapiService } from '../solapi-instance.js';
import { getOrCreateMonthlyCredit } from '../credit-service.js';
import { refundGroupCouponFailures } from '../retarget-coupon-group.js';
import { deleteBrandTemplate } from '../premium-kakao/solapi-bms.js';
import { CHANNEL_LABELS } from './performance.js';

const CANCEL_LEAD_MS = 2 * 60 * 1000; // 발송 2분 전까지만 취소
const CHUNK = 5000;
const CANCEL_REASON = '예약 취소';

export type Scope = { storeId?: string; franchiseId?: string };
const scopeWhere = (s: Scope) => (s.franchiseId ? { franchiseId: s.franchiseId } : { storeId: s.storeId });

export async function listReservations(scope: Scope) {
  const rows = await prisma.marketingCampaign.findMany({
    where: { ...scopeWhere(scope), canceledAt: null, sentAt: { gt: new Date() } },
    orderBy: { sentAt: 'asc' },
    take: 50,
    select: { id: true, channel: true, title: true, targetLabel: true, sentAt: true, recipientCount: true, cost: true },
  });
  return rows.map((r) => ({
    ...r,
    sentAt: r.sentAt.toISOString(),
    channelLabel: CHANNEL_LABELS[r.channel] ?? r.channel,
    cancelable: r.sentAt.getTime() - Date.now() > CANCEL_LEAD_MS,
  }));
}

class CancelError extends Error {
  status = 400;
}

async function outboxRowsFor(campaign: { channel: string; sourceId: string | null; id: string }) {
  const select = { id: true, storeId: true, franchiseId: true, billing: true, unitCost: true, solapiMessageId: true } as const;
  if (campaign.channel === 'PREMIUM_KAKAO' && campaign.sourceId) {
    return prisma.alimTalkOutbox.findMany({ where: { id: { startsWith: `pk_${campaign.sourceId}_` }, status: 'PENDING' }, select });
  }
  // 카카오 쿠폰: 캠페인 쿠폰 코드 → 발송 기록 (idempotencyKey = retarget-coupon-{code})
  const coupons = await prisma.retargetCoupon.findMany({ where: { campaignId: campaign.id }, select: { code: true } });
  const out: Array<{ id: string; storeId: string; franchiseId: string | null; billing: string | null; unitCost: number | null; solapiMessageId: string | null }> = [];
  for (let i = 0; i < coupons.length; i += CHUNK) {
    const keys = coupons.slice(i, i + CHUNK).map((c) => `retarget-coupon-${c.code}`);
    out.push(...(await prisma.alimTalkOutbox.findMany({ where: { idempotencyKey: { in: keys }, status: 'PENDING' }, select })));
  }
  return out;
}

async function cancelGroups(groupIds: string[]) {
  const solapi = getSolapiService('[Reservation] No SOLAPI credentials configured');
  if (!solapi) throw new CancelError('발송 설정을 확인할 수 없어 취소하지 못했어요.');
  for (const g of groupIds) {
    const r = await solapi.cancelReservation(g);
    if (!r.success) throw new CancelError(`예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요. (${r.error})`);
  }
}

export async function cancelReservation(scope: Scope, id: string): Promise<{ refunded: number; canceledCount: number }> {
  const campaign = await prisma.marketingCampaign.findFirst({ where: { id, ...scopeWhere(scope) } });
  if (!campaign) throw new CancelError('예약을 찾을 수 없어요.');
  if (campaign.canceledAt) throw new CancelError('이미 취소된 예약이에요.');
  if (campaign.sentAt.getTime() - Date.now() <= CANCEL_LEAD_MS) throw new CancelError('곧 발송되거나 이미 발송된 메시지라 취소할 수 없어요.');

  let refunded = 0;
  let canceledCount = 0;

  if (campaign.channel === 'SMS' && campaign.storeId && campaign.sourceId) {
    // 사장님 문자 — 메시지마다 차감액(무료 크레딧이면 0)이 남아 있다
    const messages = await prisma.smsMessage.findMany({ where: { campaignId: campaign.sourceId, status: 'PENDING' }, select: { id: true, cost: true, solapiGroupId: true } });
    await cancelGroups([...new Set(messages.map((m) => m.solapiGroupId).filter((g): g is string => !!g))]);
    await prisma.smsMessage.updateMany({ where: { campaignId: campaign.sourceId, status: 'PENDING' }, data: { status: 'FAILED', failReason: CANCEL_REASON, cost: 0 } });
    const paid = messages.reduce((s, m) => s + m.cost, 0);
    const freeCount = messages.filter((m) => m.cost === 0).length;
    if (paid > 0) {
      await prisma.wallet.update({ where: { storeId: campaign.storeId }, data: { balance: { increment: paid } } });
      await prisma.paymentTransaction.create({
        data: { storeId: campaign.storeId, amount: paid, type: 'ALIMTALK_SEND', status: 'SUCCESS', meta: { campaignId: campaign.sourceId, type: 'SMS', reason: 'send_failed_refund', note: CANCEL_REASON } as any },
      });
    }
    if (freeCount > 0) {
      const credit = await getOrCreateMonthlyCredit(campaign.storeId);
      await prisma.monthlyCredit.update({ where: { id: credit.id }, data: { usedCredits: { decrement: Math.min(freeCount, credit.usedCredits) } } });
    }
    await prisma.smsCampaign.update({ where: { id: campaign.sourceId }, data: { status: 'CANCELLED', totalCost: 0, completedAt: new Date() } });
    refunded = paid;
    canceledCount = messages.length;
  } else if (campaign.channel === 'SMS' && campaign.franchiseId && campaign.sourceId) {
    // 프랜차이즈 문자 — 캠페인 총액이 프랜차이즈 지갑에서 선차감됐다
    const fc = await prisma.franchiseSmsCampaign.findUnique({ where: { id: campaign.sourceId } });
    if (!fc) throw new CancelError('예약을 찾을 수 없어요.');
    if (fc.status === 'CANCELLED') throw new CancelError('이미 취소된 예약이에요.');
    const groups = Array.isArray(fc.solapiGroupIds) ? (fc.solapiGroupIds as string[]) : [];
    if (groups.length === 0) throw new CancelError('아직 발송 접수 중이에요. 잠시 후 다시 시도해 주세요.');
    await cancelGroups(groups);
    await prisma.franchiseSmsMessage.updateMany({ where: { campaignId: fc.id }, data: { status: 'FAILED', cost: 0 } });
    await prisma.franchiseSmsCampaign.update({ where: { id: fc.id }, data: { status: 'CANCELLED' } });
    if (fc.totalCost > 0) {
      const wallet = await prisma.franchiseWallet.update({ where: { franchiseId: campaign.franchiseId }, data: { balance: { increment: fc.totalCost } } });
      await prisma.franchiseTransaction.create({
        data: { walletId: wallet.id, amount: fc.totalCost, type: 'ALIMTALK_SEND', description: '문자 예약 취소 환불', meta: { refund: true, campaignId: fc.id, reason: CANCEL_REASON } },
      });
    }
    refunded = fc.totalCost;
    canceledCount = fc.targetCount;
  } else {
    // 카카오 쿠폰(알림톡) · 프리미엄 카카오톡 — 발송 기록마다 과금 방식이 남아 있다
    const rows = await outboxRowsFor(campaign);
    await cancelGroups([...new Set(rows.map((r) => r.solapiMessageId).filter((g): g is string => !!g))]);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.alimTalkOutbox.updateMany({
        where: { id: { in: rows.slice(i, i + CHUNK).map((r) => r.id) }, status: 'PENDING' },
        data: { status: 'FAILED', failReason: CANCEL_REASON, updatedAt: new Date() },
      });
    }
    const billed = rows.filter((r) => r.billing).map((r) => ({ billing: r.billing!, storeId: r.storeId, franchiseId: r.franchiseId, unitCost: r.unitCost ?? 0 }));
    await refundGroupCouponFailures(billed, CANCEL_REASON);
    refunded = billed.filter((b) => b.billing !== 'STORE_CREDIT' && b.billing !== 'FREE').reduce((s, b) => s + b.unitCost, 0);
    canceledCount = rows.length;
    if (campaign.channel === 'PREMIUM_KAKAO' && campaign.sourceId) {
      const pk = await prisma.premiumKakaoCampaign.update({ where: { id: campaign.sourceId }, data: { status: 'CANCELED', completedAt: new Date(), totalCost: 0 } });
      if (pk.solapiTemplateId) await deleteBrandTemplate(pk.solapiTemplateId).catch(() => {});
    }
  }

  // 쓰이지 않은 직원 확인 쿠폰은 지운다 (링크가 더 이상 유효하지 않게)
  await prisma.retargetCoupon.deleteMany({ where: { campaignId: campaign.id, usedAt: null } });
  await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { canceledAt: new Date(), cost: 0 } });
  return { refunded, canceledCount };
}

export function isCancelError(e: unknown): e is CancelError {
  return e instanceof CancelError;
}
