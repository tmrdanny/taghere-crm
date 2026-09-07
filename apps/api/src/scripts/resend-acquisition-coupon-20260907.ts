/**
 * 2026-09-07 해피브릿지 신규 고객 타겟 쿠폰 알림톡 재발송 (1회성).
 *
 * 배경: #118 회귀로 같은 번호에 중복 큐잉 → 워커 대기열 50,152건을 관리자 중단(FAILED, failReason '관리자 중단 - 그룹 발송%').
 * 이 스크립트는 중단분의 고유 번호에서 같은 캠페인에서 이미 SENT 된 번호를 제외하고
 * 그룹 발송 서비스(sendAcquisitionCouponAlimtalk)로 다시 보낸다. 쿠폰 내용/유효기간/대표 매장은 원 캠페인 행에서 읽는다.
 *
 * 실행 (프로덕션 env 필요: DATABASE_URL, SOLAPI_API_KEY/SECRET, SOLAPI_PF_ID, SOLAPI_TEMPLATE_ID_RETARGET_COUPON, PUBLIC_APP_URL):
 *   npx tsx src/scripts/resend-acquisition-coupon-20260907.ts            # 대상 집계만 (dry-run)
 *   npx tsx src/scripts/resend-acquisition-coupon-20260907.ts --send     # 실제 발송
 *
 * 선행: 중단분 50,152건 × 100원은 관리자 충전으로 프랜차이즈 지갑에 환불돼 있어야 한다 (재발송 시 정상 차감).
 */
import '../load-env.js';
import { prisma } from '../lib/prisma.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { sendAcquisitionCouponAlimtalk, ACQUISITION_COUPON_COST } from '../services/acquisition-coupon.js';
import { isSendableTime, getNextSendableTime } from '../utils/send-window.js';

const STORE_ID = 'cmtmfpizj0khgp1ufdix5ywwr'; // 국수나무 (대표 매장)
const ORIGINAL_CAMPAIGN_ID = 'cmtqnzdpc003c2ig20ke09rd0';
const CAMPAIGN_CREATED_AFTER = new Date('2026-09-07T02:00:00.000Z');
const STOP_REASON_PREFIX = '관리자 중단 - 그룹 발송';

async function main() {
  const doSend = process.argv.includes('--send');

  const original = await prisma.externalSmsCampaign.findUniqueOrThrow({ where: { id: ORIGINAL_CAMPAIGN_ID } });
  if (!original.franchiseId) throw new Error('원 캠페인에 franchiseId 가 없습니다.');
  const repStore = await prisma.store.findUniqueOrThrow({
    where: { id: STORE_ID },
    select: { id: true, name: true, naverPlaceUrl: true, franchiseId: true },
  });
  if (repStore.franchiseId !== original.franchiseId) throw new Error('대표 매장이 원 캠페인 프랜차이즈 소속이 아닙니다.');

  const rows = await prisma.alimTalkOutbox.findMany({
    where: { messageType: 'RETARGET_COUPON', storeId: STORE_ID, createdAt: { gte: CAMPAIGN_CREATED_AFTER } },
    select: { phone: true, status: true, failReason: true, variables: true },
  });
  const sentPhones = new Set<string>();
  const stoppedByPhone = new Map<string, string>(); // 정규화 번호 → 원본 phone
  let sampleVars: Record<string, string> | null = null;
  for (const r of rows) {
    const key = normalizePhoneNumber(r.phone);
    if (r.status === 'SENT') sentPhones.add(key);
    else if (r.status === 'FAILED' && r.failReason?.startsWith(STOP_REASON_PREFIX)) {
      if (!stoppedByPhone.has(key)) stoppedByPhone.set(key, r.phone);
      if (!sampleVars) sampleVars = r.variables as Record<string, string>;
    }
  }
  const targets = [...stoppedByPhone.entries()].filter(([key]) => !sentPhones.has(key)).map(([, phone]) => ({ phone }));

  const couponContent = original.content;
  const expiryDate = sampleVars?.['#{유효기간}'];
  if (!expiryDate) throw new Error('중단 행에서 유효기간을 읽지 못했습니다.');

  const wallet = await prisma.franchiseWallet.findUniqueOrThrow({ where: { franchiseId: original.franchiseId } });
  const totalCost = targets.length * ACQUISITION_COUPON_COST;

  console.log({
    franchiseId: original.franchiseId,
    repStore: repStore.name,
    couponContent,
    expiryDate,
    rowsToday: rows.length,
    sentPhones: sentPhones.size,
    stoppedPhones: stoppedByPhone.size,
    resendTargets: targets.length,
    totalCost,
    walletBalance: wallet.balance,
    sendableNow: isSendableTime(),
  });

  if (!doSend) {
    console.log('dry-run: --send 를 붙이면 실제 발송합니다.');
    return;
  }
  if (wallet.balance < totalCost) {
    throw new Error(`잔액 부족: ${wallet.balance} < ${totalCost}. 먼저 환불(충전) 처리하세요.`);
  }

  const scheduledAt = isSendableTime() ? undefined : getNextSendableTime();
  const result = await sendAcquisitionCouponAlimtalk({
    franchiseId: original.franchiseId,
    repStore: { id: repStore.id, name: repStore.name, naverPlaceUrl: repStore.naverPlaceUrl },
    targets,
    couponContent,
    expiryDate,
    campaign: {
      title: '신규 고객 유치 (쿠폰 알림톡) - 2026. 9. 7. 재발송',
      filterAgeGroups: JSON.parse(original.filterAgeGroups || '[]'),
      filterGender: original.filterGender,
      filterRegionSido: original.filterRegionSido || '',
      filterRegionSigungu: original.filterRegionSigungu || '',
      filterCategories: original.filterCategories ? JSON.parse(original.filterCategories) : null,
    },
    scheduledAt,
  });
  console.log('done', { ...result, scheduledAt: scheduledAt?.toISOString() });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
