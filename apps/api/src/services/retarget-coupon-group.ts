// 리타겟 쿠폰 알림톡 그룹 발송 — 사장님 매장 / 프랜차이즈 전 가맹점 공용.
//
// 이전에는 아웃박스에 건별로 쌓고 워커(5초/10건)가 1건씩 보내 3,000명에 30분 이상 걸렸고,
// 같은 큐를 쓰는 적립 알림톡까지 밀렸다. 또 라우트가 선차감한 뒤 워커가 건별로 다시 차감했다.
// 지금은 솔라피 그룹 발송(10,000건/1회)으로 직접 접수하고, 접수된 건만 한 번 과금한다.
// 아웃박스 행은 그룹 ID·과금 방식(billing)·건당 금액(unitCost)을 들고 PENDING 으로 남고,
// 최종 상태(SENT/FAILED)와 실패분 환불은 워커의 그룹 단위 조회가 확정한다.
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getSolapiService } from './solapi-instance.js';
import { getOrCreateMonthlyCredit, useCredits } from './credit-service.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { customAlphabet } from 'nanoid';

const CHUNK_SIZE = 10000; // 솔라피 send() 1회 요청 최대 건수 (= 그룹 1개)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

export type CouponBilling =
  | { kind: 'FRANCHISE'; franchiseId: string; unitCost: number; description: string }
  | { kind: 'STORE'; storeId: string; unitCost: number };

export interface CouponRecipient {
  customerId: string | null;
  phone: string;
  storeId: string;
  storeName: string;
  naverPlaceUrl: string | null;
}

export interface CouponGroupResult {
  queued: number;
  dropped: number;
  totalCost: number;
}

export async function sendRetargetCouponGroup(params: {
  recipients: CouponRecipient[];
  couponContent: string;
  expiryDate: string;
  billing: CouponBilling;
  logTag: string;
  /** 마케팅 성과 추적 캠페인 (MarketingCampaign) — 쿠폰 사용을 캠페인별로 센다 */
  campaignId?: string;
  /** 예약 발송 시각 (없으면 즉시) */
  scheduledAt?: Date;
}): Promise<CouponGroupResult> {
  const { recipients, couponContent, expiryDate, billing, logTag, campaignId, scheduledAt } = params;

  const templateId = env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
  if (!templateId) throw new Error('알림톡 템플릿이 설정되지 않았습니다.');
  const pfId = env.SOLAPI_PF_ID;
  if (!pfId) throw new Error('SOLAPI 채널이 설정되지 않았습니다.');
  const solapiService = getSolapiService(`${logTag} No SOLAPI credentials configured`);
  if (!solapiService) throw new Error('SOLAPI service not available');

  const appUrl = env.PUBLIC_APP_URL || 'http://localhost:3999';
  const domain = appUrl.replace(/^https?:\/\//, '');
  const franchiseId = billing.kind === 'FRANCHISE' ? billing.franchiseId : null;

  const codePoolDedup = new Set<string>();
  let queued = 0;
  let dropped = 0;
  let totalCost = 0;

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const slice = recipients.slice(i, i + CHUNK_SIZE);

    const rows = slice.map((r) => {
      let code = generateCouponCode();
      let guard = 0;
      while (codePoolDedup.has(code) && guard < 5) {
        code = generateCouponCode();
        guard++;
      }
      codePoolDedup.add(code);
      return { ...r, code, outboxId: `rtc-${code}` };
    });

    const variablesFor = (r: (typeof rows)[number]) => ({
      '#{상호}': r.storeName,
      '#{쿠폰내용}': couponContent,
      '#{유효기간}': expiryDate,
      '#{네이버플레이스}': (r.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
      '#{직원확인}': `${domain}/coupon/verify/${r.code}`,
    });

    // 1) 쿠폰 + 아웃박스(PROCESSING) 선기록 — 발송된 링크가 항상 유효한 쿠폰을 가리키도록 접수 전에 만든다
    let insertedIds: string[] = [];
    try {
      insertedIds = await prisma.$transaction(async (tx) => {
        await (tx as any).retargetCoupon.createMany({
          data: rows.map((r) => ({
            code: r.code,
            storeId: r.storeId,
            customerId: r.customerId,
            phone: r.phone,
            couponContent,
            expiryDate,
            naverPlaceUrl: r.naverPlaceUrl,
            campaignId: campaignId ?? null,
          })),
          skipDuplicates: true,
        });
        await tx.alimTalkOutbox.createMany({
          data: rows.map((r) => ({
            id: r.outboxId,
            storeId: r.storeId,
            customerId: r.customerId,
            franchiseId,
            phone: r.phone,
            messageType: 'RETARGET_COUPON' as const,
            templateId,
            variables: variablesFor(r) as any,
            idempotencyKey: `retarget-coupon-${r.code}`,
            status: 'PROCESSING' as const,
            sentViaGroup: true,
            unitCost: billing.unitCost,
            scheduledAt: scheduledAt ?? null,
          })),
          skipDuplicates: true,
        });
        const inserted = await tx.alimTalkOutbox.findMany({
          where: { id: { in: rows.map((r) => r.outboxId) } },
          select: { id: true },
        });
        return inserted.map((r) => r.id);
      }, { timeout: 120_000, maxWait: 10_000 }); // 청크 최대 2만 행 insert — 기본 5초 제한 초과
    } catch (chunkErr) {
      console.error(`${logTag} chunk ${i} insert failed:`, chunkErr);
      dropped += slice.length;
      continue;
    }
    const insertedSet = new Set(insertedIds);
    const sendRows = rows.filter((r) => insertedSet.has(r.outboxId));
    dropped += rows.length - sendRows.length;
    if (sendRows.length === 0) continue;

    // 2) 솔라피 그룹 발송 (청크 = 그룹 1개)
    const [result] = await solapiService.sendBulkAlimTalk({
      messages: sendRows.map((r) => ({ to: r.phone, templateId, variables: variablesFor(r) })),
      pfId,
      scheduledAt,
    });

    // 3) 접수 결과 분류 — 접수분은 PENDING + 그룹 ID, 즉시 거절분은 FAILED (과금 없음)
    const failed: Array<{ id: string; reason: string }> = [];
    const acceptedIds: string[] = [];
    for (const r of sendRows) {
      const reason = result.failedPhones.get(normalizePhoneNumber(r.phone)) || (result.groupId ? undefined : 'Group send failed');
      if (reason) failed.push({ id: r.outboxId, reason });
      else acceptedIds.push(r.outboxId);
    }
    for (const f of failed) {
      await prisma.alimTalkOutbox.update({
        where: { id: f.id },
        data: { status: 'FAILED', failReason: f.reason, updatedAt: new Date() },
      });
    }

    // 4) 접수된 건만 과금하고, 행마다 과금 방식을 남긴다 (워커가 실패분을 같은 경로로 환불)
    if (acceptedIds.length > 0) {
      const markPending = (ids: string[], billingKind: string) =>
        ids.length === 0
          ? Promise.resolve()
          : prisma.alimTalkOutbox.updateMany({
              where: { id: { in: ids } },
              data: { status: 'PENDING', solapiMessageId: result.groupId, billing: billingKind, updatedAt: new Date() },
            });

      if (billing.kind === 'FRANCHISE') {
        const chunkCost = acceptedIds.length * billing.unitCost;
        await markPending(acceptedIds, 'FRANCHISE_WALLET');
        if (chunkCost > 0) {
          const wallet = await prisma.franchiseWallet.update({
            where: { franchiseId: billing.franchiseId },
            data: { balance: { decrement: chunkCost } },
          });
          await prisma.franchiseTransaction.create({
            data: {
              walletId: wallet.id,
              amount: -chunkCost,
              type: 'ALIMTALK_SEND',
              description: billing.description,
              meta: { count: acceptedIds.length, unitCost: billing.unitCost, groupId: result.groupId },
            },
          });
        }
        totalCost += chunkCost;
      } else {
        // 무료 크레딧 먼저, 남는 건은 매장 지갑
        const creditUsed = await useCredits(billing.storeId, acceptedIds.length, null, 'RETARGET_COUPON');
        const creditIds = acceptedIds.slice(0, creditUsed);
        const walletIds = acceptedIds.slice(creditUsed);
        await markPending(creditIds, 'STORE_CREDIT');
        await markPending(walletIds, 'STORE_WALLET');
        const chunkCost = walletIds.length * billing.unitCost;
        if (chunkCost > 0) {
          await prisma.wallet.update({
            where: { storeId: billing.storeId },
            data: { balance: { decrement: chunkCost } },
          });
          await prisma.paymentTransaction.create({
            data: {
              storeId: billing.storeId,
              amount: -chunkCost,
              type: 'ALIMTALK_SEND',
              status: 'SUCCESS',
              meta: {
                messageType: 'RETARGET_COUPON_BATCH',
                count: walletIds.length,
                freeCount: creditIds.length,
                unitCost: billing.unitCost,
                groupId: result.groupId,
              } as any,
            },
          });
        }
        totalCost += chunkCost;
      }
    }

    queued += acceptedIds.length;
    dropped += failed.length;
    console.log(`${logTag} chunk ${i}: group=${result.groupId} accepted=${acceptedIds.length} failed=${failed.length}`);
  }

  return { queued, dropped, totalCost };
}

/**
 * 그룹 발송 실패분 환불 — 행에 남긴 과금 방식대로 되돌린다.
 * (billing 이 없는 과거 행은 호출하는 쪽에서 기존 경로로 처리)
 */
export async function refundGroupCouponFailures(
  failures: Array<{ billing: string; storeId: string; franchiseId: string | null; unitCost: number }>,
  reason: string,
): Promise<void> {
  const franchiseRefund = new Map<string, number>();
  const storeRefund = new Map<string, number>();
  const creditRelease = new Map<string, number>();
  for (const f of failures) {
    if (f.billing === 'FRANCHISE_WALLET' && f.franchiseId) {
      franchiseRefund.set(f.franchiseId, (franchiseRefund.get(f.franchiseId) || 0) + f.unitCost);
    } else if (f.billing === 'STORE_WALLET') {
      storeRefund.set(f.storeId, (storeRefund.get(f.storeId) || 0) + f.unitCost);
    } else if (f.billing === 'STORE_CREDIT') {
      creditRelease.set(f.storeId, (creditRelease.get(f.storeId) || 0) + 1);
    }
  }

  for (const [franchiseId, amount] of franchiseRefund) {
    if (amount <= 0) continue;
    const wallet = await prisma.franchiseWallet.update({
      where: { franchiseId },
      data: { balance: { increment: amount } },
    });
    await prisma.franchiseTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'ALIMTALK_SEND',
        description: '쿠폰 알림톡 발송 실패 환불',
        meta: { refund: true, reason },
      },
    });
  }
  for (const [storeId, amount] of storeRefund) {
    if (amount <= 0) continue;
    await prisma.wallet.update({ where: { storeId }, data: { balance: { increment: amount } } });
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount,
        type: 'ALIMTALK_SEND',
        status: 'SUCCESS',
        meta: { messageType: 'RETARGET_COUPON_BATCH', refund: true, reason } as any,
      },
    });
  }
  for (const [storeId, count] of creditRelease) {
    const credit = await getOrCreateMonthlyCredit(storeId);
    if (credit.usedCredits <= 0) continue;
    await prisma.monthlyCredit.update({
      where: { id: credit.id },
      data: { usedCredits: { decrement: Math.min(count, credit.usedCredits) } },
    });
  }
}
