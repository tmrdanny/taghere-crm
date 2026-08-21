import type { Customer } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sidoToShort } from '../utils/address-parser.js';
import { normalizeCustomerKeyDigits } from '../utils/phone.js';

/**
 * 전화번호로 매장 고객을 찾거나(없으면) 생성한다.
 *
 * kakaoId 기반 식별을 대체하는 서버-투-서버(주문 서비스) 적립 경로 전용 헬퍼.
 * `taghere-point-webhook.ts` 의 `/customer-search` find-or-create 블록을 추출한 것으로,
 * 동시 첫 거래 경쟁(@@unique([storeId, phoneLastDigits]) P2002)에 대한 재조회를 포함한다.
 *
 * - 전화번호 정규화: 숫자만 추출 → +82 국제번호는 0 으로 치환 → 뒤 8자리를 검색키(phoneLastDigits)로 사용
 * - addressSido/addressSigungu 는 매장 원본값을 그대로 받아 내부에서 sidoToShort 로 축약(기존 create 와 동일)
 * - consent 기본값은 `/customer-search` 생성 경로와 동일(consentMarketing=true, consentAt=now)
 */
export async function findOrCreateCustomerByPhone(
  storeId: string,
  phone: string,
  addressSido: string | null,
  addressSigungu: string | null,
): Promise<{ customer: Customer; isNewCustomer: boolean }> {
  // 전화번호 정규화
  const normalizedDigits = normalizeCustomerKeyDigits(phone);
  const phoneLastDigits = normalizedDigits.slice(-8);

  // 기존 고객 조회
  let customer = await prisma.customer.findFirst({
    where: { storeId, phoneLastDigits },
  });

  if (customer) {
    return { customer, isNewCustomer: false };
  }

  const formattedPhone = normalizedDigits.length === 11
    ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
    : normalizedDigits;

  try {
    customer = await prisma.customer.create({
      data: {
        storeId,
        phone: formattedPhone,
        phoneLastDigits,
        totalPoints: 0,
        visitCount: 0,
        regionSido: sidoToShort(addressSido),
        regionSigungu: addressSigungu || null,
        consentMarketing: true,
        consentAt: new Date(),
      },
    });
    return { customer, isNewCustomer: true };
  } catch (e: any) {
    // 동시 첫 거래 경쟁: customers @@unique([storeId, phoneLastDigits]) 충돌 → 승자 재조회
    if (e?.code === 'P2002') {
      customer = await prisma.customer.findFirst({ where: { storeId, phoneLastDigits } });
    }
    if (!customer) throw e;
    return { customer, isNewCustomer: false };
  }
}

/** 다른 매장에서 복사해 올 고객 프로필 필드 (kakaoId 기반 신규 고객 생성용) */
export type CopiedCustomerProfile = Pick<
  Customer,
  'name' | 'phone' | 'phoneLastDigits' | 'gender' | 'birthday' | 'birthYear'
>;

/**
 * kakaoId 기반 신규 고객 생성 전, 다른 매장의 같은 kakaoId 고객 프로필을 찾아
 * 복사 가능한 형태로 돌려준다.
 *
 * routes/taghere.ts(auto-earn) · services/stamps.ts(stamp-earn) · routes/kakao.ts(콜백)에
 * 동일하게 반복되던 블록을 추출한 것. 고객 생성(create) 자체는 사이트별로 필드 폴백과
 * consent 기본값이 달라 각 호출부에 남긴다.
 *
 * - 다른 매장에서 같은 kakaoId를 가진 고객 조회 (name/phone/phoneLastDigits/gender/birthday/birthYear)
 * - phoneLastDigits 중복 체크: 이미 해당 매장에 같은 전화번호 고객이 있으면 전화번호는 복사하지 않음
 * - fallbackPhone/fallbackPhoneLastDigits: 복사할 프로필에 값이 없을 때 쓸 폴백
 *   (kakao 콜백은 카카오 계정 전화번호를 폴백으로 쓴다). 폴백값도 중복 체크 대상.
 */
export async function findCustomerProfileByKakaoId(params: {
  storeId: string;
  kakaoId: string;
  fallbackPhone?: string | null;
  fallbackPhoneLastDigits?: string | null;
  /** 전화번호 중복으로 복사를 건너뛸 때 호출 (사이트별 로그용) */
  onPhoneConflict?: () => void;
}): Promise<{
  existingCustomer: CopiedCustomerProfile | null;
  phone: string | null;
  phoneLastDigits: string | null;
}> {
  const { storeId, kakaoId, fallbackPhone = null, fallbackPhoneLastDigits = null, onPhoneConflict } = params;

  // 다른 매장에서 같은 kakaoId를 가진 고객 조회
  const existingCustomer = await prisma.customer.findFirst({
    where: {
      kakaoId,
      storeId: { not: storeId },
    },
    select: {
      name: true,
      phone: true,
      phoneLastDigits: true,
      gender: true,
      birthday: true,
      birthYear: true,
    },
  });

  // phoneLastDigits 중복 체크 (이미 해당 매장에 같은 전화번호 고객이 있으면 전화번호는 복사하지 않음)
  let phoneToUse = existingCustomer?.phone ?? fallbackPhone;
  let phoneLastDigitsToUse = existingCustomer?.phoneLastDigits ?? fallbackPhoneLastDigits;

  if (phoneLastDigitsToUse) {
    const existingPhone = await prisma.customer.findFirst({
      where: {
        storeId,
        phoneLastDigits: phoneLastDigitsToUse,
      },
    });
    if (existingPhone) {
      phoneToUse = null;
      phoneLastDigitsToUse = null;
      onPhoneConflict?.();
    }
  }

  return { existingCustomer, phone: phoneToUse, phoneLastDigits: phoneLastDigitsToUse };
}
