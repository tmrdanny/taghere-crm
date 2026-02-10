/**
 * 마케팅 자동화 Worker
 *
 * 1시간마다 폴링하여 활성화된 자동화 규칙을 처리합니다.
 * - BIRTHDAY: 생일 D-N일 전 고객에게 쿠폰 + 알림톡 자동 발송
 * - CHURN_PREVENTION: N일 이상 미방문 고객에게 재방문 쿠폰 자동 발송
 *
 * 실제 발송은 AlimTalkOutbox 큐에 위임 (기존 alimtalk-worker가 처리)
 */

import { prisma } from '../lib/prisma.js';
import { customAlphabet } from 'nanoid';
import { calculateCostWithCredits, useCredits } from './credit-service.js';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1시간
const AUTOMATION_COST_PER_MESSAGE = 50; // 건당 50원

// 쿠폰 코드 생성기 (10자리, 헷갈리는 문자 제외)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

interface TriggerConfig {
  daysBefore?: number;
  daysInactive?: number;
}

/**
 * 생일 자동화 처리
 */
async function processBirthdayRule(rule: any): Promise<number> {
  const config = rule.triggerConfig as TriggerConfig;
  const daysBefore = config.daysBefore || 3;

  // 현재 시각이 설정된 발송 시각인지 확인
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour !== rule.sendTimeHour) {
    return 0;
  }

  // 타겟 날짜 계산 (D-daysBefore일 후의 생일)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBefore);
  const targetMM = String(targetDate.getMonth() + 1).padStart(2, '0');
  const targetDD = String(targetDate.getDate()).padStart(2, '0');
  const birthdayPattern = `${targetMM}-${targetDD}`;

  // 올해 이미 발송한 고객 ID 조회
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  const alreadySent = await prisma.automationLog.findMany({
    where: {
      automationRuleId: rule.id,
      sentAt: { gte: yearStart, lt: yearEnd },
    },
    select: { customerId: true },
  });
  const sentCustomerIds = new Set(alreadySent.map((l) => l.customerId));

  // 대상 고객 조회
  const customers = await prisma.customer.findMany({
    where: {
      storeId: rule.storeId,
      birthday: birthdayPattern,
      consentMarketing: true,
      phone: { not: null },
    },
    select: { id: true, name: true, phone: true },
  });

  // 이미 발송한 고객 제외
  const targets = customers.filter((c) => !sentCustomerIds.has(c.id));

  if (targets.length === 0) return 0;

  // 월 상한 체크
  if (rule.monthlyMaxSends) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSent = await prisma.automationLog.count({
      where: {
        automationRuleId: rule.id,
        sentAt: { gte: startOfMonth },
      },
    });
    if (monthSent >= rule.monthlyMaxSends) {
      console.log(`[AutoWorker] Rule ${rule.id} monthly limit reached (${monthSent}/${rule.monthlyMaxSends})`);
      return 0;
    }
  }

  return await sendAutomationMessages(rule, targets, 'AUTO_BIRTHDAY');
}

/**
 * 이탈 방지 자동화 처리
 */
async function processChurnRule(rule: any): Promise<number> {
  const config = rule.triggerConfig as TriggerConfig;
  const daysInactive = config.daysInactive || 30;

  // 현재 시각이 설정된 발송 시각인지 확인
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour !== rule.sendTimeHour) {
    return 0;
  }

  // 쿨다운 기간 내 이미 발송한 고객 제외
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - rule.cooldownDays);

  const alreadySent = await prisma.automationLog.findMany({
    where: {
      automationRuleId: rule.id,
      sentAt: { gte: cooldownDate },
    },
    select: { customerId: true },
  });
  const sentCustomerIds = new Set(alreadySent.map((l) => l.customerId));

  // 이탈 위험 고객 조회
  const inactiveDate = new Date();
  inactiveDate.setDate(inactiveDate.getDate() - daysInactive);

  const customers = await prisma.customer.findMany({
    where: {
      storeId: rule.storeId,
      visitCount: { gte: 2 },
      lastVisitAt: { lt: inactiveDate },
      consentMarketing: true,
      phone: { not: null },
    },
    select: { id: true, name: true, phone: true },
  });

  // 쿨다운 내 이미 발송한 고객 제외
  const targets = customers.filter((c) => !sentCustomerIds.has(c.id));

  if (targets.length === 0) return 0;

  // 월 상한 체크
  if (rule.monthlyMaxSends) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSent = await prisma.automationLog.count({
      where: {
        automationRuleId: rule.id,
        sentAt: { gte: startOfMonth },
      },
    });
    if (monthSent >= rule.monthlyMaxSends) {
      console.log(`[AutoWorker] Rule ${rule.id} monthly limit reached (${monthSent}/${rule.monthlyMaxSends})`);
      return 0;
    }
  }

  return await sendAutomationMessages(rule, targets, 'AUTO_CHURN');
}

/**
 * 자동화 메시지 발송 (쿠폰 생성 + AlimTalkOutbox 큐잉)
 */
async function sendAutomationMessages(
  rule: any,
  targets: Array<{ id: string; name: string | null; phone: string | null }>,
  messageType: 'AUTO_BIRTHDAY' | 'AUTO_CHURN'
): Promise<number> {
  // 매장 정보 조회
  const store = await prisma.store.findUnique({
    where: { id: rule.storeId },
    select: { name: true, naverPlaceUrl: true },
  });

  if (!store) return 0;

  // 환경변수
  const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3999';
  const domain = appUrl.replace(/^https?:\/\//, '');
  const templateId = messageType === 'AUTO_BIRTHDAY'
    ? (process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON || '')
    : (process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON || '');
  const pfId = process.env.SOLAPI_PF_ID;

  if (!templateId || !pfId) {
    console.error(`[AutoWorker] Missing template or pfId for ${messageType}`);
    return 0;
  }

  // 비용 계산 (무료 크레딧 적용)
  const creditResult = await calculateCostWithCredits(
    rule.storeId,
    targets.length,
    AUTOMATION_COST_PER_MESSAGE,
    true // 자동화 메시지도 무료 크레딧 적용
  );

  // 잔액 확인
  if (creditResult.paidCount > 0) {
    const wallet = await prisma.wallet.findUnique({
      where: { storeId: rule.storeId },
    });

    if (!wallet || wallet.balance < creditResult.totalCost) {
      console.log(`[AutoWorker] Insufficient balance for store ${rule.storeId}, needed: ${creditResult.totalCost}, have: ${wallet?.balance || 0}`);
      return 0;
    }
  }

  // 쿠폰 유효기간 계산
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (rule.couponValidDays || 14));
  const expiryStr = `${expiryDate.getFullYear()}.${String(expiryDate.getMonth() + 1).padStart(2, '0')}.${String(expiryDate.getDate()).padStart(2, '0')}`;

  let sentCount = 0;

  for (const customer of targets) {
    try {
      const couponCode = rule.couponEnabled ? generateCouponCode() : null;
      const couponContent = rule.couponContent || (messageType === 'AUTO_BIRTHDAY' ? '생일 축하 특별 할인' : '다시 만나서 반가워요! 특별 할인');
      let couponId: string | null = null;

      // 쿠폰 생성
      if (rule.couponEnabled && couponCode) {
        const coupon = await (prisma as any).retargetCoupon.create({
          data: {
            code: couponCode,
            storeId: rule.storeId,
            customerId: customer.id,
            phone: customer.phone!,
            couponContent,
            expiryDate: expiryStr,
            naverPlaceUrl: store.naverPlaceUrl || null,
          },
        });
        couponId = coupon.id;
      }

      const verifyUrl = couponCode ? `${domain}/coupon/verify/${couponCode}` : '';
      const idempotencyKey = `auto-${messageType.toLowerCase()}-${rule.storeId}-${customer.id}-${Date.now()}`;

      // AlimTalkOutbox에 큐잉
      const outbox = await prisma.alimTalkOutbox.create({
        data: {
          storeId: rule.storeId,
          customerId: customer.id,
          phone: customer.phone!,
          messageType,
          templateId,
          variables: {
            '#{상호}': store.name,
            '#{쿠폰내용}': couponContent,
            '#{유효기간}': expiryStr,
            '#{네이버플레이스}': store.naverPlaceUrl || '',
            '#{직원확인}': verifyUrl,
          },
          idempotencyKey,
          status: 'PENDING',
        },
      });

      // AutomationLog 기록
      await prisma.automationLog.create({
        data: {
          automationRuleId: rule.id,
          storeId: rule.storeId,
          customerId: customer.id,
          alimtalkOutboxId: outbox.id,
          couponId,
          couponCode,
        },
      });

      sentCount++;
    } catch (error) {
      console.error(`[AutoWorker] Failed to send to customer ${customer.id}:`, error);
    }
  }

  // 무료 크레딧 사용 처리
  if (sentCount > 0 && creditResult.freeCount > 0) {
    const freeToUse = Math.min(creditResult.freeCount, sentCount);
    await useCredits(rule.storeId, freeToUse, null, messageType);
  }

  console.log(`[AutoWorker] ${messageType} for store ${rule.storeId}: ${sentCount}/${targets.length} messages queued`);
  return sentCount;
}

/**
 * 배치 처리: 모든 활성화된 규칙 실행
 */
async function processBatch(): Promise<number> {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true },
  });

  if (rules.length === 0) return 0;

  let totalSent = 0;

  for (const rule of rules) {
    try {
      let sent = 0;
      if (rule.type === 'BIRTHDAY') {
        sent = await processBirthdayRule(rule);
      } else if (rule.type === 'CHURN_PREVENTION') {
        sent = await processChurnRule(rule);
      }
      totalSent += sent;
    } catch (error) {
      console.error(`[AutoWorker] Error processing rule ${rule.id} (${rule.type}):`, error);
    }
  }

  return totalSent;
}

/**
 * Worker 시작
 */
export function startAutomationWorker(): void {
  if (isRunning) {
    console.log('[AutoWorker] Automation worker already running');
    return;
  }

  isRunning = true;
  console.log('[AutoWorker] Starting automation worker (1h interval)...');

  const poll = async () => {
    if (!isRunning) return;

    try {
      const processed = await processBatch();
      if (processed > 0) {
        console.log(`[AutoWorker] Queued ${processed} automation messages`);
      }
    } catch (error) {
      console.error('[AutoWorker] Error in poll cycle:', error);
    }
  };

  // 서버 시작 후 1분 뒤에 첫 실행 (다른 worker와 겹치지 않도록)
  setTimeout(poll, 60 * 1000);

  // 1시간마다 폴링
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

/**
 * Worker 중지
 */
export function stopAutomationWorker(): void {
  if (!isRunning) return;

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log('[AutoWorker] Automation worker stopped');
}
