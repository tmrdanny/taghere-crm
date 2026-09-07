// 프랜차이즈 신규 고객 타겟 — 쿠폰 알림톡 그룹 발송.
//
// 이전에는 아웃박스에 건별로 쌓고 워커(5초/10건)가 1건씩 보내 5만 건에 7시간이 걸렸고,
// 워커가 매장 지갑/크레딧까지 다시 차감했다(프랜차이즈 지갑과 이중 과금).
// 지금은 솔라피 그룹 발송(1,000건/1회)으로 직접 접수하고, 아웃박스 행은 그룹 ID 를 들고
// PENDING 으로 남긴다. 최종 상태(SENT/FAILED)와 실패분 환불은 워커의 그룹 단위 조회가 확정한다.
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getSolapiService } from './solapi-instance.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { customAlphabet } from 'nanoid';

export const ACQUISITION_COUPON_COST = 100;
const CHUNK_SIZE = 1000; // 솔라피 그룹 1회 호출 단위와 동일
const generateAcqCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

export interface AcquisitionCouponSendParams {
  franchiseId: string;
  repStore: { id: string; name: string; naverPlaceUrl: string | null };
  targets: Array<{ phone: string }>;
  couponContent: string;
  expiryDate: string;
  campaign: {
    title: string;
    filterAgeGroups: string[];
    filterGender: string | null;
    filterRegionSido: string;
    filterRegionSigungu: string;
    filterCategories: string[] | null;
  };
  scheduledAt?: Date;
}

export interface AcquisitionCouponSendResult {
  campaignId: string;
  queued: number;
  dropped: number;
  totalCost: number;
}

export async function sendAcquisitionCouponAlimtalk(
  params: AcquisitionCouponSendParams
): Promise<AcquisitionCouponSendResult> {
  const { franchiseId, repStore, targets, couponContent, expiryDate, campaign, scheduledAt } = params;

  const templateId = env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
  if (!templateId) throw new Error('알림톡 템플릿이 설정되지 않았습니다.');
  const pfId = env.SOLAPI_PF_ID;
  if (!pfId) throw new Error('카카오 비즈니스 채널 설정이 필요합니다.');
  const solapiService = getSolapiService('[AcquisitionCoupon] No SOLAPI credentials configured');
  if (!solapiService) throw new Error('SOLAPI service not available');

  const appUrl = env.PUBLIC_APP_URL || 'http://localhost:3999';
  const domain = appUrl.replace(/^https?:\/\//, '');
  const naverForTemplate = (repStore.naverPlaceUrl || '').replace(/^https?:\/\//, '');

  const campaignRow = await prisma.externalSmsCampaign.create({
    data: {
      franchiseId,
      title: campaign.title,
      content: couponContent,
      filterAgeGroups: JSON.stringify(campaign.filterAgeGroups),
      filterGender: campaign.filterGender,
      filterRegionSido: campaign.filterRegionSido,
      filterRegionSigungu: campaign.filterRegionSigungu,
      filterCategories: campaign.filterCategories && campaign.filterCategories.length > 0 ? JSON.stringify(campaign.filterCategories) : null,
      targetCount: targets.length,
      costPerMessage: ACQUISITION_COUPON_COST,
      status: 'SENDING',
    },
  });

  const codePoolDedup = new Set<string>();
  let queued = 0;
  let dropped = 0;

  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const slice = targets.slice(i, i + CHUNK_SIZE);

    const rows = slice.map((t) => {
      let code = generateAcqCouponCode();
      let guard = 0;
      while (codePoolDedup.has(code) && guard < 5) {
        code = generateAcqCouponCode();
        guard++;
      }
      codePoolDedup.add(code);
      return { code, phone: t.phone, outboxId: `acq-${code}` };
    });

    const variablesFor = (code: string) => ({
      '#{상호}': repStore.name,
      '#{쿠폰내용}': couponContent,
      '#{유효기간}': expiryDate,
      '#{네이버플레이스}': naverForTemplate,
      '#{직원확인}': `${domain}/coupon/verify/${code}`,
    });

    // 1) 쿠폰 + 아웃박스(PROCESSING) 선기록 — 발송된 링크가 항상 유효한 쿠폰을 가리키도록 접수 전에 만든다
    let insertedIds: string[] = [];
    try {
      insertedIds = await prisma.$transaction(async (tx) => {
        await (tx as any).retargetCoupon.createMany({
          data: rows.map((r) => ({
            code: r.code,
            storeId: repStore.id,
            customerId: null,
            phone: r.phone,
            couponContent,
            expiryDate,
            naverPlaceUrl: repStore.naverPlaceUrl || null,
          })),
          skipDuplicates: true,
        });
        await tx.alimTalkOutbox.createMany({
          data: rows.map((r) => ({
            id: r.outboxId,
            storeId: repStore.id,
            customerId: null,
            franchiseId,
            phone: r.phone,
            messageType: 'RETARGET_COUPON' as const,
            templateId,
            variables: variablesFor(r.code) as any,
            idempotencyKey: `retarget-coupon-${r.code}`,
            status: 'PROCESSING' as const,
            sentViaGroup: true,
            scheduledAt: scheduledAt ?? null,
          })),
          skipDuplicates: true,
        });
        const inserted = await tx.alimTalkOutbox.findMany({
          where: { id: { in: rows.map((r) => r.outboxId) } },
          select: { id: true },
        });
        return inserted.map((r) => r.id);
      });
    } catch (chunkErr) {
      console.error(`[AcquisitionCoupon] chunk ${i} insert failed:`, chunkErr);
      dropped += slice.length;
      continue;
    }
    const insertedSet = new Set(insertedIds);
    const sendRows = rows.filter((r) => insertedSet.has(r.outboxId));
    dropped += rows.length - sendRows.length;
    if (sendRows.length === 0) continue;

    // 2) 솔라피 그룹 발송 (청크 = 그룹 1개)
    const [result] = await solapiService.sendBulkAlimTalk({
      messages: sendRows.map((r) => ({ to: r.phone, templateId, variables: variablesFor(r.code) })),
      pfId,
      scheduledAt,
    });

    // 3) 접수 결과 반영 — 접수분은 PENDING + 그룹 ID, 즉시 거절분은 FAILED
    const failedIds: Array<{ id: string; reason: string }> = [];
    const acceptedIds: string[] = [];
    for (const r of sendRows) {
      const reason = result.groupId ? result.failedPhones.get(normalizePhoneNumber(r.phone)) : (result.failedPhones.get(normalizePhoneNumber(r.phone)) || 'Group send failed');
      if (reason) failedIds.push({ id: r.outboxId, reason });
      else acceptedIds.push(r.outboxId);
    }

    if (acceptedIds.length > 0) {
      await prisma.alimTalkOutbox.updateMany({
        where: { id: { in: acceptedIds } },
        data: { status: 'PENDING', solapiMessageId: result.groupId, updatedAt: new Date() },
      });
    }
    for (const f of failedIds) {
      await prisma.alimTalkOutbox.update({
        where: { id: f.id },
        data: { status: 'FAILED', failReason: f.reason, updatedAt: new Date() },
      });
    }

    // 4) 접수 성공분만 프랜차이즈 지갑 차감
    const chunkCost = acceptedIds.length * ACQUISITION_COUPON_COST;
    if (chunkCost > 0) {
      const wallet = await prisma.franchiseWallet.update({
        where: { franchiseId },
        data: { balance: { decrement: chunkCost } },
      });
      await prisma.franchiseTransaction.create({
        data: {
          walletId: wallet.id,
          amount: -chunkCost,
          type: 'ALIMTALK_SEND',
          description: '신규 고객 타겟 쿠폰 알림톡 발송',
          meta: { campaignId: campaignRow.id, count: acceptedIds.length, unitCost: ACQUISITION_COUPON_COST, groupId: result.groupId },
        },
      });
    }
    queued += acceptedIds.length;
    dropped += failedIds.length;
  }

  await prisma.externalSmsCampaign.update({
    where: { id: campaignRow.id },
    data: { status: queued > 0 ? 'SENDING' : 'COMPLETED', failedCount: dropped },
  });

  return { campaignId: campaignRow.id, queued, dropped, totalCost: queued * ACQUISITION_COUPON_COST };
}

/**
 * 그룹 발송 실패분 환불 — 프랜차이즈 지갑으로 되돌리고 원장을 남긴다.
 */
export async function refundAcquisitionCoupons(franchiseId: string, count: number, reason: string): Promise<void> {
  if (count <= 0) return;
  const amount = count * ACQUISITION_COUPON_COST;
  const wallet = await prisma.franchiseWallet.update({
    where: { franchiseId },
    data: { balance: { increment: amount } },
  });
  await prisma.franchiseTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: 'ALIMTALK_SEND',
      description: '신규 고객 타겟 쿠폰 알림톡 발송 실패 환불',
      meta: { refund: true, count, unitCost: ACQUISITION_COUPON_COST, reason },
    },
  });
}
