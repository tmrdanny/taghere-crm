import type { Customer } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sidoToShort } from '../utils/address-parser.js';
import { normalizeCustomerKeyDigits } from '../utils/phone.js';

/** 서버 간 적립 경로가 함께 넘길 수 있는 고객 프로필. 모두 선택이며 CRM Customer 컬럼 형태 그대로다. */
export type CustomerProfileInput = {
  name?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  /** MM-DD */
  birthday?: string | null;
  /** YYYY */
  birthYear?: number | null;
};

/**
 * 웹훅 바디(req.body 전체를 넘겨도 됨 — 4개 키만 읽는다)의 프로필 필드를 검증·정규화한다.
 * name/birthday/birthYear 는 routes/customers.ts 대량 등록과 같은 규칙(trim 후 빈값 제외, M-D~MM-DD 2자리 패딩, 1900~2100 정수).
 * gender 는 대량 등록(남/여/M/F 허용)과 달리 V2 계약값 MALE/FEMALE 정확 일치만 허용한다.
 * 유효한 값이 하나도 없으면 null.
 */
export function normalizeCustomerProfile(
  raw: { name?: unknown; gender?: unknown; birthday?: unknown; birthYear?: unknown } | null | undefined,
): CustomerProfileInput | null {
  if (!raw) return null;
  const profile: CustomerProfileInput = {};

  if (typeof raw.name === 'string' && raw.name.trim()) profile.name = raw.name.trim();
  if (raw.gender === 'MALE' || raw.gender === 'FEMALE') profile.gender = raw.gender;
  if (typeof raw.birthday === 'string') {
    const b = raw.birthday.trim();
    if (/^\d{1,2}-\d{1,2}$/.test(b)) {
      const [mm, dd] = b.split('-');
      profile.birthday = `${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  if (raw.birthYear !== undefined && raw.birthYear !== null) {
    const y = typeof raw.birthYear === 'number' ? raw.birthYear : parseInt(String(raw.birthYear), 10);
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) profile.birthYear = y;
  }

  return Object.keys(profile).length > 0 ? profile : null;
}

/** 기존 고객의 비어 있는 프로필 필드만 채운다. 채울 것이 없으면 쓰기 없이 그대로 반환. */
async function backfillMissingProfile(
  customer: Customer,
  profile: CustomerProfileInput | null,
): Promise<Customer> {
  if (!profile) return customer;
  const data = {
    ...(profile.name && !customer.name && { name: profile.name }),
    ...(profile.gender && !customer.gender && { gender: profile.gender }),
    ...(profile.birthday && !customer.birthday && { birthday: profile.birthday }),
    ...(profile.birthYear && !customer.birthYear && { birthYear: profile.birthYear }),
  };
  if (Object.keys(data).length === 0) return customer;
  return prisma.customer.update({ where: { id: customer.id }, data });
}

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
 * - profile(선택): 주문 서비스가 보유한 고객 프로필(네아로 로그인). 신규 생성 시 그대로 쓰고,
 *   기존 고객은 비어 있는 필드만 채운다 — 사장님 수기 입력값·기존 값은 덮어쓰지 않는다.
 */
export async function findOrCreateCustomerByPhone(
  storeId: string,
  phone: string,
  addressSido: string | null,
  addressSigungu: string | null,
  profile: CustomerProfileInput | null = null,
): Promise<{ customer: Customer; isNewCustomer: boolean }> {
  // 전화번호 정규화
  const normalizedDigits = normalizeCustomerKeyDigits(phone);
  const phoneLastDigits = normalizedDigits.slice(-8);

  // 기존 고객 조회
  let customer = await prisma.customer.findFirst({
    where: { storeId, phoneLastDigits },
  });

  if (customer) {
    return { customer: await backfillMissingProfile(customer, profile), isNewCustomer: false };
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
        name: profile?.name ?? null,
        gender: profile?.gender ?? null,
        birthday: profile?.birthday ?? null,
        birthYear: profile?.birthYear ?? null,
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
    return { customer: await backfillMissingProfile(customer, profile), isNewCustomer: false };
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
