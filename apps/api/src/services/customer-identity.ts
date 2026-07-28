import type { Customer } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sidoToShort } from '../utils/address-parser.js';

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
  const phoneDigits = phone.replace(/[^0-9]/g, '');
  let normalizedDigits = phoneDigits;
  if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
    normalizedDigits = '0' + normalizedDigits.slice(2);
  }
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
