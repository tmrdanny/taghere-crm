/**
 * 메시지(문자/카카오) 선불 과금 공용 서비스
 *
 * 구조: 발송(=SOLAPI에 접수되어 PENDING 생성) 시점에 미리 차감하고,
 *       워커가 발송 실패(FAILED)를 확인하면 환불한다.
 *
 * - 무료 크레딧(월 30건)을 먼저 적용하고 남은 유료분만 지갑에서 차감
 * - 결제 트랜잭션 타입은 ALIMTALK_SEND로 통일 (금액 부호로 차감/환불 구분)
 *   → wallet.ts 의 충전내역 조회에서 ALIMTALK_SEND 는 제외되므로 충전내역을 오염시키지 않음
 */

import { prisma } from '../lib/prisma.js';
import { getOrCreateMonthlyCredit } from './credit-service.js';

export type MessageMetaType = 'SMS' | 'BRAND_MESSAGE';

/**
 * 캠페인 단위로 PENDING 건수만큼 선불 차감한다.
 *
 * - 무료 크레딧을 우선 소진하고, 남은 유료분(paidCount)만 지갑에서 일괄 차감
 * - 무료 크레딧 소진 + 지갑 차감 + 결제 로그를 하나의 트랜잭션으로 처리
 *
 * @returns freeCount: 무료 처리된 건수, paidCount: 유료 처리된 건수, charged: 실제 차감액(원)
 */
export async function chargeCampaignUpfront(params: {
  storeId: string;
  campaignId: string;
  pendingCount: number; // SOLAPI에 접수되어 PENDING으로 생성될 건수
  costPerMessage: number;
  messageType: string; // 크레딧 로그용 (SMS/LMS/MMS/KAKAO_TEXT/KAKAO_IMAGE)
  metaType: MessageMetaType; // 결제 로그 meta 구분용
  allowFreeCredits: boolean;
}): Promise<{ freeCount: number; paidCount: number; charged: number }> {
  const { storeId, campaignId, pendingCount, costPerMessage, messageType, metaType, allowFreeCredits } = params;

  if (pendingCount <= 0) {
    return { freeCount: 0, paidCount: 0, charged: 0 };
  }

  const credit = await getOrCreateMonthlyCredit(storeId);
  const remainingFree = allowFreeCredits ? Math.max(0, credit.totalCredits - credit.usedCredits) : 0;
  const freeCount = Math.min(remainingFree, pendingCount);
  const paidCount = pendingCount - freeCount;
  const charged = paidCount * costPerMessage;

  await prisma.$transaction(async (tx) => {
    // 1. 무료 크레딧 소진
    if (freeCount > 0) {
      await tx.monthlyCredit.update({
        where: { id: credit.id },
        data: { usedCredits: { increment: freeCount } },
      });
      await tx.creditUsageLog.create({
        data: { monthlyCreditId: credit.id, campaignId, messageType, usedCount: freeCount },
      });
    }

    // 2. 유료분 지갑 차감 + 결제 로그
    if (charged > 0) {
      await tx.wallet.update({
        where: { storeId },
        data: { balance: { decrement: charged } },
      });
      await tx.paymentTransaction.create({
        data: {
          storeId,
          amount: -charged,
          type: 'ALIMTALK_SEND',
          status: 'SUCCESS',
          meta: { campaignId, type: metaType, paidCount, costPerMessage, reason: 'prepaid_charge' } as any,
        },
      });
    }
  });

  return { freeCount, paidCount, charged };
}

/**
 * 발송 실패한 단건을 환불한다. (워커에서 FAILED 확인 시 호출)
 *
 * - 유료 건(cost > 0): 지갑에 환불(+cost) + 결제 로그
 * - 무료 건(cost === 0): 사용했던 무료 크레딧 1건 복구
 *
 * 멱등성: 호출 측에서 메시지를 PENDING -> FAILED 로 전이시킨 직후에만 1회 호출해야 한다.
 */
export async function refundFailedMessage(params: {
  storeId: string;
  campaignId: string;
  messageId: string;
  cost: number; // 발송 시 이 메시지에 실제 차감되었던 금액 (무료였으면 0)
  messageType: string;
  metaType: MessageMetaType;
}): Promise<void> {
  const { storeId, campaignId, messageId, cost, messageType, metaType } = params;

  if (cost > 0) {
    // 유료 건 환불
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { storeId },
        data: { balance: { increment: cost } },
      });
      await tx.paymentTransaction.create({
        data: {
          storeId,
          amount: cost,
          type: 'ALIMTALK_SEND',
          status: 'SUCCESS',
          meta: { campaignId, messageId, type: metaType, reason: 'send_failed_refund' } as any,
        },
      });
    });
    return;
  }

  // 무료 건이었으면 무료 크레딧 1건 복구 (당월 기준)
  const credit = await getOrCreateMonthlyCredit(storeId);
  if (credit.usedCredits > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyCredit.update({
        where: { id: credit.id },
        data: { usedCredits: { decrement: 1 } },
      });
      await tx.creditUsageLog.create({
        data: { monthlyCreditId: credit.id, campaignId, messageType, usedCount: -1 },
      });
    });
  }
}

/**
 * 예약 발송 등 단건 발송 시 즉시 선불 차감한다.
 *
 * @returns charged: 이 건에 실제 차감된 금액(원). 무료 크레딧으로 처리되면 0.
 *          insufficient: 잔액/크레딧 부족으로 과금 불가하면 true (호출 측에서 발송 보류 처리)
 */
export async function chargeSinglePending(params: {
  storeId: string;
  campaignId: string;
  costPerMessage: number;
  messageType: string;
  metaType: MessageMetaType;
  allowFreeCredits: boolean;
}): Promise<{ charged: number; free: boolean; insufficient: boolean }> {
  const { storeId, campaignId, costPerMessage, messageType, metaType, allowFreeCredits } = params;

  const credit = await getOrCreateMonthlyCredit(storeId);
  const remainingFree = allowFreeCredits ? Math.max(0, credit.totalCredits - credit.usedCredits) : 0;

  if (remainingFree > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyCredit.update({
        where: { id: credit.id },
        data: { usedCredits: { increment: 1 } },
      });
      await tx.creditUsageLog.create({
        data: { monthlyCreditId: credit.id, campaignId, messageType, usedCount: 1 },
      });
    });
    return { charged: 0, free: true, insufficient: false };
  }

  const wallet = await prisma.wallet.findUnique({ where: { storeId } });
  if (!wallet || wallet.balance < costPerMessage) {
    return { charged: 0, free: false, insufficient: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { storeId },
      data: { balance: { decrement: costPerMessage } },
    });
    await tx.paymentTransaction.create({
      data: {
        storeId,
        amount: -costPerMessage,
        type: 'ALIMTALK_SEND',
        status: 'SUCCESS',
        meta: { campaignId, type: metaType, paidCount: 1, costPerMessage, reason: 'prepaid_charge' } as any,
      },
    });
  });

  return { charged: costPerMessage, free: false, insufficient: false };
}
