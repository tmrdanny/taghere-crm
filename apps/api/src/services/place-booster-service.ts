/**
 * 네이버 플레이스 부스터 - 공용 서비스
 *
 * 사장님(store-scoped) 라우트와 운영자(admin) 라우트가 함께 사용한다. (중복 구현 금지)
 * 발송 자체는 기존 AlimTalkOutbox + alimtalk-worker에 위임 (worker가 enqueue).
 */

import { prisma } from '../lib/prisma.js';
import {
  parseNaverPlaceId,
  generateTrackingCode,
} from '../utils/naver-place.js';
import { parseStoreRegion, expandRegions, TargetRegion } from '../utils/region.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import type { Prisma, PlaceBoosterCampaign } from '@prisma/client';

/** 결제 금액 (VAT 포함) / ROI 분모 광고비 (VAT 제외) */
export const BOOSTER_PRICE = 544500;
export const BOOSTER_AD_COST = 495000;

/** 허용 프리셋 (회차당 인원 × 총 주차) — 둘 다 총 5,000명 */
export const BOOSTER_PRESETS = [
  { perBatchCount: 1000, totalWeeks: 5 },
  { perBatchCount: 500, totalWeeks: 10 },
];

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const KST_OFFSET = 9 * 60 * 60 * 1000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
// 알리고에 등록된 부스터 알림톡 템플릿 코드. env 미설정 시에도 실제 템플릿(UG_5628)으로 폴백.
const BOOSTER_TPL_CODE = process.env.ALIGO_PLACE_BOOSTER_TPL_CODE || 'UG_5628';

/** 알리고 등록 템플릿(UG_5628)용 알림톡 페이로드 — 워커/테스트발송 공유 */
export interface BoosterAlimtalk {
  tplCode: string;
  subject: string;
  message: string;
  buttonName: string;
  buttonUrl: string;
}

function formatBoosterValidUntil(date: Date | null): string {
  if (!date) return '';
  const kst = new Date(date.getTime() + KST_OFFSET);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 유효기간 표기 뒤에 고정으로 따라붙는 네이버 쿠폰 수령 안내문.
 * 알리고 승인 템플릿(UG_5628) 본문은 그대로 두고 #{유효기간} 변수 값에 포함시켜 발송한다.
 * (고정 텍스트를 본문에 추가하면 템플릿 매칭에서 어긋나 발송이 거절되므로 변수 값에 넣는다)
 */
const BOOSTER_COUPON_GUIDE =
  '쿠폰 다운받기 > 네이버 길찾기 앱 진입 후 하단 스크롤 > 네이버 쿠폰 다운로드 > 매장 방문시 직원에게 보여주세요.';

/** 캠페인 → 알리고 알림톡 페이로드(등록 템플릿 본문과 정확히 일치) */
export function buildBoosterAlimtalk(
  campaign: Pick<PlaceBoosterCampaign, 'trackingCode' | 'couponContent' | 'couponCode' | 'couponAmount' | 'couponValidUntil'>,
  weekNo: number
): BoosterAlimtalk {
  // 알리고 템플릿 UG_5628의 4개 변수 = 쿠폰 내용 / 쿠폰 코드 / 쿠폰 금액 / 유효기간 (각각 1:1 매핑)
  // 유효기간 표기 뒤에 고정 안내문을 줄바꿈과 함께 덧붙인다(변수 값에 포함 → 템플릿 매칭 유지).
  const validText = campaign.couponValidUntil
    ? `${formatBoosterValidUntil(campaign.couponValidUntil)}까지\n\n${BOOSTER_COUPON_GUIDE}`
    : BOOSTER_COUPON_GUIDE;
  const message = [
    `${campaign.couponContent} 쿠폰이 도착했어요.`,
    '',
    `▶ 쿠폰 코드: ${campaign.couponCode ?? ''}`,
    `▶ 쿠폰: ${campaign.couponAmount ?? ''}`,
    `▶ 유효기간: ${validText}`,
    '',
    '[태그히어 플레이스] 이 메시지는 고객님이 참여한 이벤트 당첨으로 지급된 쿠폰 안내 메시지입니다.',
  ].join('\n');
  return {
    tplCode: BOOSTER_TPL_CODE,
    subject: '쿠폰 발급 완료',
    message,
    buttonName: '쿠폰 받기',
    buttonUrl: `${PUBLIC_BASE_URL}/r/${campaign.trackingCode}/${weekNo}`,
  };
}

export interface CreateCampaignInput {
  keyword: string;
  naverPlaceUrl: string;
  couponContent: string;
  couponCode: string;
  couponAmount: string;
  couponValidUntil: string | Date;
  ownerPhone: string; // 점주 핸드폰 — 회차마다 점주에게도 동일 알림톡 발송
  weekday: number; // 0=일 ~ 6=토 (KST)
  sendTime: string; // "HH:mm" (KST)
  perBatchCount: number;
  totalWeeks: number;
  placeAddress?: string | null; // 외부 캠페인: 네이버 플레이스 확인 주소(지역 파싱용)
}

export class BoosterError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** weekday/sendTime 기준 다음 해당 요일부터 주 단위 N개 발송시각(UTC) 생성 */
export function computeBatchSchedules(
  weekday: number,
  sendTime: string,
  totalWeeks: number
): Date[] {
  const [hh, mm] = sendTime.split(':').map((v) => parseInt(v, 10));
  // KST 벽시계를 UTC 필드에 담은 Date (비교/연산용)
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const dayDiff = (weekday - nowKst.getUTCDay() + 7) % 7;
  let firstKst = new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate() + dayDiff,
      hh,
      mm,
      0,
      0
    )
  );
  // 오늘이 해당 요일이지만 시간이 지났으면 다음 주
  if (firstKst.getTime() <= nowKst.getTime()) {
    firstKst = new Date(firstKst.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const week = 7 * 24 * 60 * 60 * 1000;
  const result: Date[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const kst = new Date(firstKst.getTime() + i * week);
    result.push(new Date(kst.getTime() - KST_OFFSET)); // 실제 UTC 순간
  }
  return result;
}

/** 'YYYY-MM-DD'는 KST 자정으로 해석(off-by-one 방지). 그 외는 그대로 파싱. */
function parseCouponValidUntil(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+09:00`);
  }
  return new Date(value);
}

function validatePreset(perBatchCount: number, totalWeeks: number) {
  const ok = BOOSTER_PRESETS.some(
    (p) => p.perBatchCount === perBatchCount && p.totalWeeks === totalWeeks
  );
  if (!ok) {
    throw new BoosterError(
      '발송 방식은 제공된 프리셋(1,000명×5주 또는 500명×10주)만 선택할 수 있습니다.'
    );
  }
}

async function generateUniqueTrackingCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateTrackingCode();
    const exists = await prisma.placeBoosterCampaign.findUnique({
      where: { trackingCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new BoosterError('추적 코드 생성에 실패했습니다. 다시 시도해주세요.', 500);
}

/** 캠페인 생성 (DRAFT/UNPAID). 회차도 함께 생성. */
export async function createCampaign(
  input: CreateCampaignInput,
  ctx: { storeId?: string | null; campaignName?: string; createdByAdmin: boolean }
): Promise<PlaceBoosterCampaign> {
  const isExternal = !ctx.storeId;
  if (isExternal && !ctx.campaignName?.trim()) {
    throw new BoosterError('외부 캠페인은 캠페인명을 입력해주세요.');
  }
  validatePreset(input.perBatchCount, input.totalWeeks);

  // 알림톡 템플릿(UG_5628)은 4개 변수 슬롯이 모두 채워져야 발송되므로 전부 필수
  if (!input.couponContent?.trim()) throw new BoosterError('쿠폰 내용을 입력해주세요.');
  if (!input.couponCode?.trim()) throw new BoosterError('쿠폰 코드를 입력해주세요.');
  if (!input.couponAmount?.trim()) throw new BoosterError('쿠폰 금액을 입력해주세요.');
  if (!input.couponValidUntil) throw new BoosterError('유효기간을 입력해주세요.');
  if (!input.ownerPhone?.trim()) throw new BoosterError('사장님 번호를 입력해주세요.');

  if (input.weekday < 0 || input.weekday > 6) {
    throw new BoosterError('발송 요일이 올바르지 않습니다.');
  }
  if (!/^\d{2}:\d{2}$/.test(input.sendTime)) {
    throw new BoosterError('발송 시각 형식이 올바르지 않습니다. (HH:mm)');
  }

  const placeId = parseNaverPlaceId(input.naverPlaceUrl);
  if (!placeId) {
    throw new BoosterError(
      '플레이스 상세 URL을 붙여넣어 주세요. (단축링크/검색 링크에는 매장 ID가 없습니다)'
    );
  }

  // 가입 매장이면 존재 확인 (소유권/대상 검증)
  if (ctx.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: ctx.storeId },
      select: { id: true },
    });
    if (!store) throw new BoosterError('매장을 찾을 수 없습니다.', 404);
  }
  // 지역은 매장 주소가 아니라 등록한 플레이스 URL 주소(placeAddress)에서 파싱 (가입/외부 공통)
  const region = parseStoreRegion(input.placeAddress);
  if (!region) {
    throw new BoosterError(
      '플레이스 주소에서 지역(시/군/구)을 확인할 수 없습니다. 매장 정보 확인을 다시 시도해주세요.'
    );
  }
  const targetRegions: TargetRegion = expandRegions(region.sido, region.sigungu);

  const trackingCode = await generateUniqueTrackingCode();
  const totalTargetCount = input.perBatchCount * input.totalWeeks;
  const schedules = computeBatchSchedules(
    input.weekday,
    input.sendTime,
    input.totalWeeks
  );

  return prisma.placeBoosterCampaign.create({
    data: {
      storeId: ctx.storeId ?? null,
      campaignName: isExternal ? ctx.campaignName!.trim() : null,
      keyword: input.keyword.trim(),
      naverPlaceUrl: input.naverPlaceUrl.trim(),
      placeId,
      trackingCode,
      couponContent: input.couponContent.trim(),
      couponCode: input.couponCode.trim(),
      couponAmount: input.couponAmount.trim(),
      couponValidUntil: parseCouponValidUntil(input.couponValidUntil),
      ownerPhone: normalizePhoneNumber(input.ownerPhone.trim()),
      targetRegions: targetRegions as unknown as Prisma.InputJsonValue,
      weekday: input.weekday,
      sendTime: input.sendTime,
      perBatchCount: input.perBatchCount,
      totalWeeks: input.totalWeeks,
      totalTargetCount,
      paidAmount: BOOSTER_PRICE,
      adCost: BOOSTER_AD_COST,
      createdByAdmin: ctx.createdByAdmin,
      // 운영자 대행 생성(매장/외부 공통)은 계좌이체 승인 대기로 시작 → 목록에서 '승인' 한 번으로 발송.
      // (사장님 직접 생성은 기존대로 미결제 → 사장님이 결제)
      ...(ctx.createdByAdmin
        ? { paymentMethod: 'BANK_TRANSFER' as const, paymentStatus: 'PENDING_APPROVAL' as const }
        : {}),
      batches: {
        create: schedules.map((scheduledAt, idx) => ({
          weekNo: idx + 1,
          scheduledAt,
        })),
      },
    },
  });
}

/** 활성화: 결제/승인 완료 → 발송 예약 시작 */
async function activate(
  campaignId: string,
  method: 'CARD' | 'CREDIT' | 'BANK_TRANSFER',
  extra: Prisma.PlaceBoosterCampaignUpdateInput = {}
) {
  await prisma.placeBoosterCampaign.update({
    where: { id: campaignId },
    data: {
      paymentStatus: 'PAID',
      status: 'SCHEDULED',
      paymentMethod: method,
      ...extra,
    },
  });
}

async function getActivatableCampaign(campaignId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign || campaign.deletedAt) {
    throw new BoosterError('캠페인을 찾을 수 없습니다.', 404);
  }
  return campaign;
}

/** 크레딧(지갑) 차감 결제 — 단일 트랜잭션 내 원자적 클레임(동시 결제·음수 잔액 방지) */
export async function payWithCredit(campaignId: string) {
  const campaign = await getActivatableCampaign(campaignId);
  if (campaign.paymentStatus === 'PAID') return campaign; // 빠른 멱등 경로
  if (!campaign.storeId) {
    throw new BoosterError('외부 캠페인은 운영자 승인으로만 활성화됩니다.');
  }
  const storeId = campaign.storeId; // 가드 이후 트랜잭션 콜백에서 사용(내로잉 유지용)

  await prisma.$transaction(async (tx) => {
    // 1) 상태 전이를 원자적으로 클레임 (동시 요청 중 1건만 성공)
    const claim = await tx.placeBoosterCampaign.updateMany({
      where: { id: campaignId, paymentStatus: { not: 'PAID' }, deletedAt: null },
      data: { paymentStatus: 'PAID', status: 'SCHEDULED', paymentMethod: 'CREDIT' },
    });
    if (claim.count === 0) return; // 이미 다른 요청이 결제 완료 → 멱등 종료
    // 2) 잔액이 충분할 때만 차감 (음수 방지). 부족하면 throw → 트랜잭션 롤백
    const dec = await tx.wallet.updateMany({
      where: { storeId, balance: { gte: campaign.paidAmount } },
      data: { balance: { decrement: campaign.paidAmount } },
    });
    if (dec.count === 0) {
      throw new BoosterError('잔액이 부족합니다. 충전 후 다시 시도해주세요.', 402);
    }
    // 3) 회계 원장
    await tx.paymentTransaction.create({
      data: {
        storeId,
        amount: -campaign.paidAmount,
        type: 'PLACE_BOOSTER',
        status: 'SUCCESS',
        meta: { reason: 'place_booster_credit', campaignId } as Prisma.InputJsonValue,
      },
    });
  });

  return getActivatableCampaign(campaignId);
}

/** 카드 직접 결제 confirm (TossPayments). 지갑 미경유. */
export async function confirmCardPayment(params: {
  campaignId: string;
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  const campaign = await getActivatableCampaign(params.campaignId);
  if (campaign.paymentStatus === 'PAID') return campaign; // 멱등
  if (!campaign.storeId) {
    throw new BoosterError('외부 캠페인은 운영자 승인으로만 활성화됩니다.');
  }
  const storeId = campaign.storeId; // 트랜잭션 콜백에서 사용

  // 반드시 startCardPayment로 이 캠페인에 발급된 orderId와 일치해야 함.
  // (캠페인별 orderId가 고유 → 타 캠페인 paymentKey/orderId 재사용 차단. Toss가 paymentKey↔orderId↔amount를 바인딩)
  if (!campaign.paymentOrderId || campaign.paymentOrderId !== params.orderId) {
    throw new BoosterError('주문 정보가 일치하지 않습니다.');
  }
  if (params.amount !== campaign.paidAmount) {
    throw new BoosterError('결제 금액이 올바르지 않습니다.');
  }

  // TossPayments 결제 승인 (동일 paymentKey에 멱등)
  const encryptedSecretKey = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encryptedSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      amount: params.amount,
    }),
  });
  const data = (await resp.json()) as { status?: string; message?: string };
  if (!resp.ok || data.status !== 'DONE') {
    throw new BoosterError(data.message || '카드 결제 승인에 실패했습니다.', 402);
  }

  // 캠페인 행을 락으로 사용해 원장 단일 적재 보장 (동시 confirm 시 1건만 기록)
  await prisma.$transaction(async (tx) => {
    const claim = await tx.placeBoosterCampaign.updateMany({
      where: { id: params.campaignId, paymentStatus: { not: 'PAID' }, deletedAt: null },
      data: {
        paymentStatus: 'PAID',
        status: 'SCHEDULED',
        paymentMethod: 'CARD',
        paymentKey: params.paymentKey,
      },
    });
    if (claim.count === 0) return; // 이미 PAID → 원장 중복 방지
    await tx.paymentTransaction.create({
      data: {
        storeId,
        amount: campaign.paidAmount,
        type: 'PLACE_BOOSTER',
        status: 'SUCCESS',
        meta: {
          reason: 'place_booster_card',
          campaignId: params.campaignId,
          paymentKey: params.paymentKey,
          orderId: params.orderId,
        } as Prisma.InputJsonValue,
      },
    });
  });

  return getActivatableCampaign(params.campaignId);
}

/** 카드 결제 개시: orderId 발급·저장 (프론트 Toss requestPayment용) */
export async function startCardPayment(campaignId: string): Promise<{ orderId: string; amount: number }> {
  const campaign = await getActivatableCampaign(campaignId);
  if (campaign.paymentStatus === 'PAID') {
    throw new BoosterError('이미 결제된 캠페인입니다.');
  }
  if (campaign.paymentOrderId) {
    return { orderId: campaign.paymentOrderId, amount: campaign.paidAmount };
  }
  // 동시 호출 경쟁 방지: paymentOrderId가 비어 있을 때만 세팅 후 재읽기
  const orderId = `PB${campaign.id.slice(-12)}${generateTrackingCode().slice(0, 6)}`;
  await prisma.placeBoosterCampaign.updateMany({
    where: { id: campaignId, paymentOrderId: null },
    data: { paymentOrderId: orderId },
  });
  const fresh = await getActivatableCampaign(campaignId);
  return { orderId: fresh.paymentOrderId || orderId, amount: fresh.paidAmount };
}

/** 계좌이체 요청 → 승인 대기 */
export async function requestBankTransfer(campaignId: string) {
  const campaign = await getActivatableCampaign(campaignId);
  if (campaign.paymentStatus === 'PAID') return campaign;
  await prisma.placeBoosterCampaign.update({
    where: { id: campaignId },
    data: { paymentStatus: 'PENDING_APPROVAL', paymentMethod: 'BANK_TRANSFER' },
  });
  return getActivatableCampaign(campaignId);
}

/** 계좌이체 승인 (운영자) → 활성화 */
export async function approveBankTransfer(campaignId: string) {
  const campaign = await getActivatableCampaign(campaignId);
  if (campaign.paymentStatus === 'PAID') return campaign;
  await activate(campaignId, 'BANK_TRANSFER');
  return getActivatableCampaign(campaignId);
}

/**
 * 발송 직전 대상자 산정 (unique_customers 단일 풀, 계단식으로 perBatchCount 채움):
 *   1순위 매장 시군구 → 2순위 인접 구(데이터 있을 때) → 3순위 동일 시/도 나머지.
 * 각 단계는 동의·캠페인 기발송 제외·사람 단위 피로도순(덜/오래전 받은 순)으로 채우고, 부족분만 다음 단계로 넘어간다.
 * unique_customers는 동기화 시 시/도(줄임)·시군구(시 단위)가 정규화돼 있어 정확일치로 매칭한다.
 */
export async function selectRecipients(
  campaign: Pick<PlaceBoosterCampaign, 'id' | 'perBatchCount' | 'targetRegions'>
) {
  const region = campaign.targetRegions as unknown as TargetRegion;
  const need = campaign.perBatchCount;
  const picked: { id: string; phone: string }[] = [];
  const pickedIds: string[] = [];

  const base = {
    consentMarketing: true,
    regionSido: region.sido,
    boosterRecipients: { none: { campaignId: campaign.id } },
  };
  const orderBy = [
    { sentCount: 'asc' as const },
    { lastSentAt: { sort: 'asc' as const, nulls: 'first' as const } },
  ];

  const fill = async (extraWhere: Record<string, unknown>) => {
    if (picked.length >= need) return;
    const rows = await prisma.uniqueCustomer.findMany({
      where: {
        ...base,
        ...extraWhere,
        ...(pickedIds.length ? { id: { notIn: pickedIds } } : {}),
      },
      orderBy,
      take: need - picked.length,
      select: { id: true, phone: true },
    });
    for (const r of rows) {
      picked.push(r);
      pickedIds.push(r.id);
    }
  };

  // 1순위: 매장 시군구 (정규화된 시 단위 — "수원시"가 수원시 전체)
  if (region.sigungu) await fill({ regionSigungu: region.sigungu });
  // 2순위: 인접 구 (인접 데이터가 있을 때만)
  if (region.adjacent?.length) await fill({ regionSigungu: { in: region.adjacent } });
  // 3순위: 동일 시/도 나머지 (시군구 무관)
  await fill({});

  return picked;
}

/** 가용 인원 카운트 (생성 전 검증용) — 최종적으로 동일 시/도 전체에서 채우므로 시/도 풀 기준 */
export async function countAvailable(region: TargetRegion): Promise<number> {
  return prisma.uniqueCustomer.count({
    where: {
      consentMarketing: true,
      regionSido: region.sido,
    },
  });
}

/** 회차 수동 결과 입력 (쿠폰 사용 횟수 / 평균 객단) */
export async function setBatchResults(
  batchId: string,
  data: { couponUsedCount?: number | null; avgTicket?: number | null }
) {
  return prisma.placeBoosterBatch.update({
    where: { id: batchId },
    data: {
      couponUsedCount: data.couponUsedCount ?? null,
      avgTicket: data.avgTicket ?? null,
    },
  });
}

/** 캠페인 취소(중지): 미발송 회차 취소, 발송분 보존. 환불은 운영자 수동. */
export async function cancelCampaign(campaignId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign || campaign.deletedAt) {
    throw new BoosterError('캠페인을 찾을 수 없습니다.', 404);
  }
  // 이 캠페인 배치들의 미발송(PENDING/RETRY) 알림톡 outbox도 취소 → 취소 후 잔여 발송 방지
  const batches = await prisma.placeBoosterBatch.findMany({
    where: { campaignId },
    select: { id: true },
  });
  const outboxConds = batches.flatMap((b) => [
    { idempotencyKey: { startsWith: `place_booster:${b.id}:` } },
    { idempotencyKey: `place_booster_owner:${b.id}` },
  ]);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.placeBoosterBatch.updateMany({
      where: { campaignId, status: { in: ['SCHEDULED', 'SENDING'] } },
      data: { status: 'CANCELLED' },
    }),
    prisma.placeBoosterCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    }),
  ];
  if (outboxConds.length > 0) {
    ops.push(
      prisma.alimTalkOutbox.updateMany({
        where: { messageType: 'PLACE_BOOSTER', status: { in: ['PENDING', 'RETRY'] }, OR: outboxConds },
        data: { status: 'FAILED', failReason: '캠페인 취소로 발송 취소' },
      })
    );
  }
  await prisma.$transaction(ops);
}

/** 소프트 삭제 (운영자). 진행 중이면 먼저 중지. */
export async function softDeleteCampaign(campaignId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new BoosterError('캠페인을 찾을 수 없습니다.', 404);
  if (campaign.deletedAt) return;

  if (campaign.status !== 'CANCELLED' && campaign.status !== 'COMPLETED') {
    await prisma.placeBoosterBatch.updateMany({
      where: { campaignId, status: { in: ['SCHEDULED', 'SENDING'] } },
      data: { status: 'CANCELLED' },
    });
    await prisma.placeBoosterCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });
  }
  await prisma.placeBoosterCampaign.update({
    where: { id: campaignId },
    data: { deletedAt: new Date() },
  });
}

export interface BatchReportRow {
  batchId: string;
  weekNo: number;
  scheduledAt: Date;
  status: string;
  sentCount: number;
  clickCount: number;
  clickRate: number; // %
  couponUsedCount: number | null;
  avgTicket: number | null;
  revenue: number; // 쿠폰사용 × 평균객단
}

/** 캠페인 리포트 (주차별 + 누적 + ROI) */
export async function getReport(campaignId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({
    where: { id: campaignId },
    include: { batches: { orderBy: { weekNo: 'asc' } } },
  });
  if (!campaign || campaign.deletedAt) {
    throw new BoosterError('캠페인을 찾을 수 없습니다.', 404);
  }

  // PG 민감 필드 제거 (소유 매장에게도 노출하지 않음)
  const { paymentKey: _pk, paymentOrderId: _po, ...safeCampaign } = campaign;

  const clickGroups = await prisma.placeBoosterClick.groupBy({
    by: ['weekNo'],
    where: { campaignId },
    _count: { _all: true },
  });
  const clicksByWeek = new Map<number, number>();
  for (const g of clickGroups) {
    if (g.weekNo != null) clicksByWeek.set(g.weekNo, g._count._all);
  }

  const rows: BatchReportRow[] = campaign.batches.map((b) => {
    const clickCount = clicksByWeek.get(b.weekNo) ?? 0;
    const revenue = (b.couponUsedCount ?? 0) * (b.avgTicket ?? 0);
    return {
      batchId: b.id,
      weekNo: b.weekNo,
      scheduledAt: b.scheduledAt,
      status: b.status,
      sentCount: b.sentCount,
      clickCount,
      clickRate: b.sentCount > 0 ? (clickCount / b.sentCount) * 100 : 0,
      couponUsedCount: b.couponUsedCount,
      avgTicket: b.avgTicket,
      revenue,
    };
  });

  const totalSent = rows.reduce((s, r) => s + r.sentCount, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clickCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return {
    campaign: safeCampaign,
    rows,
    totals: {
      sentCount: totalSent,
      clickCount: totalClicks,
      clickRate: totalSent > 0 ? (totalClicks / totalSent) * 100 : 0,
      revenue: totalRevenue,
      adCost: campaign.adCost,
      roi: campaign.adCost > 0 ? (totalRevenue / campaign.adCost) * 100 : null,
    },
  };
}
