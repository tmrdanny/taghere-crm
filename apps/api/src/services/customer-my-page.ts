// 고객 마이페이지 — 로그인한 고객의 기록 찾기, 수신 동의 철회, 탈퇴
//
// 내 기록 판정 규칙
//  ① 전화번호: 뒤 8자리(phoneLastDigits)로 후보를 찾고, 그 기록의 번호를 정규화한 값이 토큰 번호와 같을 때만 인정
//     → 뒤 8자리만 보면 유선 02-1234-5678 / 옛 10자리 011-123-4567 같은 다른 사람 번호가 섞인다
//  ② 카카오ID 일치 (카카오 로그인일 때)
//  탈퇴한 기록(withdrawnAt)은 항상 제외

import { prisma } from '../lib/prisma.js';
import { toMobileOrEmpty, toPhoneLastDigits } from '../utils/phone.js';
import type { CustomerTokenPayload } from '../utils/customer-token.js';

type Identity = Pick<CustomerTokenPayload, 'phone' | 'kakaoId'>;

function ownsPhone(rowPhone: string | null, tokenPhone: string): boolean {
  return !!rowPhone && toMobileOrEmpty(rowPhone) === tokenPhone;
}

/** 내 매장별 고객 기록 id 목록 */
export async function findMyCustomerIds(identity: Identity): Promise<string[]> {
  const ids = new Set<string>();

  if (identity.phone) {
    const candidates = await prisma.customer.findMany({
      where: { phoneLastDigits: toPhoneLastDigits(identity.phone), withdrawnAt: null },
      select: { id: true, phone: true },
    });
    for (const c of candidates) {
      if (ownsPhone(c.phone, identity.phone)) ids.add(c.id);
    }
  }

  if (identity.kakaoId) {
    const byKakao = await prisma.customer.findMany({
      where: { kakaoId: identity.kakaoId, withdrawnAt: null },
      select: { id: true },
    });
    for (const c of byKakao) ids.add(c.id);
  }

  return [...ids];
}

/** 내 프랜차이즈 통합 고객 기록 id 목록 */
export async function findMyFranchiseCustomerIds(identity: Identity): Promise<string[]> {
  const ids = new Set<string>();

  if (identity.phone) {
    const candidates = await prisma.franchiseCustomer.findMany({
      where: { phoneLastDigits: toPhoneLastDigits(identity.phone), withdrawnAt: null },
      select: { id: true, phone: true },
    });
    for (const c of candidates) {
      if (ownsPhone(c.phone, identity.phone)) ids.add(c.id);
    }
  }

  if (identity.kakaoId) {
    const byKakao = await prisma.franchiseCustomer.findMany({
      where: { kakaoId: identity.kakaoId, withdrawnAt: null },
      select: { id: true },
    });
    for (const c of byKakao) ids.add(c.id);
  }

  return [...ids];
}

/** 01012345678 → 외부 고객 명부에 섞여 저장된 표기 3종 */
function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone]);
  if (phone.length === 11) {
    variants.add(`${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`);
    variants.add(`+82 ${phone.slice(1, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`);
  } else if (phone.length === 10) {
    variants.add(`${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`);
    variants.add(`+82 ${phone.slice(1, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`);
  }
  return [...variants];
}

/**
 * 광고 차단 대상 번호.
 * 토큰에 번호가 있으면 그 번호만 쓴다 — 카카오ID 로만 연결된 기록에는 가족 번호 등 다른 사람 번호가 있을 수 있다.
 * 번호 없이 카카오 로그인한 경우에만 그 카카오 계정 기록들에 남은 번호를 쓴다.
 */
async function collectMyPhones(identity: Identity, customerIds: string[], franchiseCustomerIds: string[]) {
  if (identity.phone) return [identity.phone];
  const phones = new Set<string>();

  const [customers, franchiseCustomers] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { phone: true } }),
    prisma.franchiseCustomer.findMany({ where: { id: { in: franchiseCustomerIds } }, select: { phone: true } }),
  ]);
  for (const row of [...customers, ...franchiseCustomers]) {
    const normalized = toMobileOrEmpty(row.phone);
    if (normalized) phones.add(normalized);
  }
  return [...phones];
}

/**
 * 광고 발송 명부에서 번호를 차단한다.
 * - 플레이스 부스터 명부(unique_customers): suppressed=true 로 upsert.
 *   update 만 하면 명부에 아직 없는 번호가 밤 동기화 때 외부 고객 명부에서 새로 들어와 광고가 나간다.
 *   suppressed 는 밤 동기화가 건드리지 않는다.
 * - 외부 고객 명부(external_customers): 지역 캠페인이 직접 읽고 suppressed 를 보지 않으므로 동의를 끈다.
 */
async function blockMarketingByPhones(phones: string[]) {
  const now = new Date();
  for (const phone of phones) {
    await prisma.uniqueCustomer.upsert({
      where: { phone },
      create: {
        phone,
        regionSido: '',
        regionSigungu: '',
        source: 'CUSTOMER',
        consentMarketing: false,
        suppressed: true,
        suppressedReason: 'customer_opt_out',
        suppressedAt: now,
      },
      update: {
        consentMarketing: false,
        suppressed: true,
        suppressedReason: 'customer_opt_out',
        suppressedAt: now,
      },
    });
    await prisma.externalCustomer.updateMany({
      where: { phone: { in: phoneVariants(phone) } },
      data: { consentMarketing: false },
    });
  }
}

/** 마케팅 수신 동의 철회 — 내 모든 매장 기록의 동의를 끄고 광고 명부에서 차단 */
export async function withdrawMarketingConsent(identity: Identity) {
  const customerIds = await findMyCustomerIds(identity);
  const franchiseCustomerIds = await findMyFranchiseCustomerIds(identity);
  const phones = await collectMyPhones(identity, customerIds, franchiseCustomerIds);

  const updated = await prisma.customer.updateMany({
    where: { id: { in: customerIds } },
    data: { consentMarketing: false, consentSms: false, consentKakao: false },
  });
  await blockMarketingByPhones(phones);

  return { updatedCustomers: updated.count };
}

/**
 * 탈퇴 — 탈퇴 표시 + 개인정보 비우기.
 * 적립·사용 내역, 쿠폰 코드·사용 여부, 발송 이력은 보존한다.
 */
export async function withdrawCustomer(identity: Identity) {
  const customerIds = await findMyCustomerIds(identity);
  const franchiseCustomerIds = await findMyFranchiseCustomerIds(identity);
  // 개인정보를 비우기 전에 번호를 모아 먼저 광고 명부에서 차단한다.
  // (비운 뒤에 차단하다 실패하면, 다시 시도해도 기록이 없어 번호를 다시 찾을 수 없다)
  const phones = await collectMyPhones(identity, customerIds, franchiseCustomerIds);
  await blockMarketingByPhones(phones);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (customerIds.length > 0) {
      await tx.customer.updateMany({
        where: { id: { in: customerIds } },
        data: {
          withdrawnAt: now,
          consentMarketing: false,
          consentSms: false,
          consentKakao: false,
          phone: null,
          phoneLastDigits: null,
          name: null,
          kakaoId: null,
          naverId: null,
          naverNickname: null,
          gender: null,
          ageGroup: null,
          birthday: null,
          birthYear: null,
          memo: null,
          feedbackText: null,
          metacityCustId: null,
          metacityCustCd: null,
        },
      });

      // 결제완료를 기다리는 적립 예약 — 그냥 두면 탈퇴한 기록에 나중에 포인트·스탬프가 쌓인다
      await tx.pendingPointAccrual.updateMany({
        where: { customerId: { in: customerIds }, status: 'PENDING' },
        data: { status: 'CANCELED', finalizedAt: now, finalizeReason: 'customer_withdrawn' },
      });
      await tx.pendingStampAccrual.updateMany({
        where: { customerId: { in: customerIds }, status: 'PENDING' },
        data: { status: 'CANCELED', finalizedAt: now, finalizeReason: 'customer_withdrawn' },
      });
      await tx.stampApprovalRequest.updateMany({
        where: { customerId: { in: customerIds }, status: 'PENDING' },
        data: { status: 'REJECTED', decidedAt: now },
      });

      // 아직 솔라피에 넘기지 않은 알림톡만 취소. 지갑 차감은 워커가 보내는 순간에 하므로 환불할 것이 없다.
      // (요청이 실패해 RETRY 가 된 건은 워커가 이미 환불함. 솔라피 메시지ID 가 있는 건은 이미 넘어간 것이라 건드리지 않음)
      await tx.alimTalkOutbox.updateMany({
        where: {
          customerId: { in: customerIds },
          sentViaGroup: false,
          solapiMessageId: null,
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: { status: 'FAILED', failReason: '고객 탈퇴' },
      });

      // 고객에 연결된 업무 기록의 개인정보
      await tx.retargetCoupon.updateMany({ where: { customerId: { in: customerIds } }, data: { phone: '' } });
      await tx.waitingList.updateMany({
        where: { customerId: { in: customerIds } },
        data: { phone: null, phoneLastDigits: null, name: null, memo: null },
      });
      await tx.reviewRequestLog.updateMany({ where: { customerId: { in: customerIds } }, data: { phone: null } });
      await tx.customerFeedback.updateMany({ where: { customerId: { in: customerIds } }, data: { text: null } });
      await tx.surveyAnswer.updateMany({ where: { customerId: { in: customerIds } }, data: { valueText: null } });
    }

    if (franchiseCustomerIds.length > 0) {
      for (const id of franchiseCustomerIds) {
        // kakaoId 는 빈값이 안 되는 칸이고 (franchiseId, kakaoId) 유니크라 행마다 고유한 값으로 바꾼다
        await tx.franchiseCustomer.update({
          where: { id },
          data: { withdrawnAt: now, phone: null, phoneLastDigits: null, name: null, kakaoId: `withdrawn:${id}` },
        });
      }
      await tx.rewardClaim.updateMany({
        where: { franchiseCustomerId: { in: franchiseCustomerIds } },
        data: { customerName: null, customerPhone: null },
      });
    }
  });

  return { withdrawnCustomers: customerIds.length, withdrawnFranchiseCustomers: franchiseCustomerIds.length };
}
