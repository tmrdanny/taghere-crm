/**
 * 월별 무료 메시지 크레딧 서비스
 *
 * - 매달 30건 무료 크레딧 제공
 * - /messages 페이지 (리타겟) 발송 시에만 적용
 * - /local-customers 페이지 (신규고객타겟)는 적용 안 함
 * - 매달 1일 자동 리셋 (새 월 첫 접근 시 자동 생성)
 */

import { prisma } from '../lib/prisma.js';

// 기본 월별 무료 크레딧 수
const DEFAULT_MONTHLY_CREDITS = 30;

/**
 * 현재 연월 문자열 반환 (예: "2026-01")
 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 매장의 현재 월 무료 크레딧 조회 또는 생성
 */
export async function getOrCreateMonthlyCredit(storeId: string) {
  const yearMonth = getCurrentYearMonth();

  // 이미 존재하면 반환
  let credit = await prisma.monthlyCredit.findUnique({
    where: {
      storeId_yearMonth: { storeId, yearMonth },
    },
  });

  // 없으면 새로 생성 (새 달 첫 접근)
  if (!credit) {
    credit = await prisma.monthlyCredit.create({
      data: {
        storeId,
        yearMonth,
        totalCredits: DEFAULT_MONTHLY_CREDITS,
        usedCredits: 0,
      },
    });
  }

  return credit;
}

/**
 * 무료 크레딧 잔여 건수 조회
 */
export async function getRemainingCredits(storeId: string): Promise<number> {
  const credit = await getOrCreateMonthlyCredit(storeId);
  return Math.max(0, credit.totalCredits - credit.usedCredits);
}

/**
 * 무료 크레딧 상태 조회 (전체 정보)
 */
export async function getCreditStatus(storeId: string) {
  const credit = await getOrCreateMonthlyCredit(storeId);
  const remaining = Math.max(0, credit.totalCredits - credit.usedCredits);

  return {
    yearMonth: credit.yearMonth,
    totalCredits: credit.totalCredits,
    usedCredits: credit.usedCredits,
    remainingCredits: remaining,
  };
}

/**
 * 무료 크레딧 사용 (발송 성공 시 호출)
 *
 * @param storeId 매장 ID
 * @param count 사용할 크레딧 수
 * @param campaignId 캠페인 ID
 * @param messageType 메시지 타입 (SMS, LMS, MMS, KAKAO_TEXT, KAKAO_IMAGE)
 * @returns 실제 사용된 무료 크레딧 수
 */
export async function useCredits(
  storeId: string,
  count: number,
  campaignId: string | null,
  messageType: string
): Promise<number> {
  const credit = await getOrCreateMonthlyCredit(storeId);
  const remaining = Math.max(0, credit.totalCredits - credit.usedCredits);

  // 사용 가능한 무료 크레딧 계산
  const creditsToUse = Math.min(remaining, count);

  if (creditsToUse <= 0) {
    return 0;
  }

  // 크레딧 사용 처리
  await prisma.$transaction([
    // MonthlyCredit 업데이트
    prisma.monthlyCredit.update({
      where: { id: credit.id },
      data: {
        usedCredits: { increment: creditsToUse },
      },
    }),
    // 사용 내역 기록
    prisma.creditUsageLog.create({
      data: {
        monthlyCreditId: credit.id,
        campaignId,
        messageType,
        usedCount: creditsToUse,
      },
    }),
  ]);

  return creditsToUse;
}

/**
 * 발송 비용 계산 (무료 크레딧 적용 후)
 *
 * @param storeId 매장 ID
 * @param targetCount 발송 대상 수
 * @param costPerMessage 건당 비용
 * @param isRetarget 리타겟 발송 여부 (true면 무료 크레딧 적용)
 * @returns { freeCount, paidCount, totalCost }
 */
export async function calculateCostWithCredits(
  storeId: string,
  targetCount: number,
  costPerMessage: number,
  isRetarget: boolean
): Promise<{
  freeCount: number;
  paidCount: number;
  totalCost: number;
  remainingCredits: number;
}> {
  // 리타겟이 아니면 모두 유료
  if (!isRetarget) {
    const credit = await getOrCreateMonthlyCredit(storeId);
    const remaining = Math.max(0, credit.totalCredits - credit.usedCredits);

    return {
      freeCount: 0,
      paidCount: targetCount,
      totalCost: targetCount * costPerMessage,
      remainingCredits: remaining,
    };
  }

  // 리타겟이면 무료 크레딧 적용
  const remaining = await getRemainingCredits(storeId);

  const freeCount = Math.min(remaining, targetCount);
  const paidCount = targetCount - freeCount;
  const totalCost = paidCount * costPerMessage;

  return {
    freeCount,
    paidCount,
    totalCost,
    remainingCredits: remaining,
  };
}

/**
 * 크레딧 사용 내역 조회
 */
export async function getCreditUsageHistory(
  storeId: string,
  yearMonth?: string,
  limit = 50
) {
  const targetYearMonth = yearMonth || getCurrentYearMonth();

  const credit = await prisma.monthlyCredit.findUnique({
    where: {
      storeId_yearMonth: { storeId, yearMonth: targetYearMonth },
    },
    include: {
      usageLogs: {
        orderBy: { createdAt: 'desc' },
        take: limit,
      },
    },
  });

  return credit?.usageLogs || [];
}

/**
 * 관리자: 특정 매장의 무료 크레딧 조정
 */
export async function adjustCredits(
  storeId: string,
  yearMonth: string,
  newTotalCredits: number
) {
  return prisma.monthlyCredit.upsert({
    where: {
      storeId_yearMonth: { storeId, yearMonth },
    },
    create: {
      storeId,
      yearMonth,
      totalCredits: newTotalCredits,
      usedCredits: 0,
    },
    update: {
      totalCredits: newTotalCredits,
    },
  });
}
