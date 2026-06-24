/**
 * unique_customers 동기화 (야간 배치)
 *
 * customer(매장별 중복) + external_customer(phone unique)를 전화번호(숫자만)로 dedup하여
 * unique_customers에 적재한다. 플레이스 부스터의 발송 대상/사람 단위 피로도(sentCount/lastSentAt)
 * 의 단일 소스. 피로도 필드는 동기화 시 보존한다.
 *
 * 정규화:
 *  - 시/도: 풀네임 → 줄임명(서울특별시 → 서울)
 *  - 시/군/구: 첫 토큰만(수원시 팔달구 → 수원시, 강남구 → 강남구) = split_part(' ', 1)
 *  - 전화: 숫자만 추출, 010/011… 10~11자리만
 *  - 지역/연령은 external 우선(고객 양쪽에 있으면 external 값으로 덮어씀)
 *
 * 주의(후속): 동의 철회/삭제된 사람의 stale row 정리는 v1 미포함.
 */

import { prisma } from '../lib/prisma.js';
import { SIDO_FULL_TO_SHORT } from '../utils/region.js';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간

/** 시/도 풀네임→줄임 SQL CASE (정적 한글 키라 인젝션 위험 없음) */
function sidoCaseSql(col: string): string {
  const whens = Object.entries(SIDO_FULL_TO_SHORT)
    .map(([full, short]) => `WHEN ${col} = '${full}' THEN '${short}'`)
    .join(' ');
  return `CASE ${whens} ELSE ${col} END`;
}

// 전화 정규화: 숫자만 추출 → 국제표기(+82…)면 선두 '82'를 '0'으로 치환 → 모바일 유효성 검사.
// (customer/external 모두 "+82 10-…"(82…12자리) 형식이 다수)
const phoneDigits = (col: string) => `regexp_replace(${col}, '[^0-9]', '', 'g')`;
const phoneNorm = (col: string) =>
  `(CASE WHEN ${phoneDigits(col)} LIKE '82%' THEN '0' || substring(${phoneDigits(col)} from 3) ELSE ${phoneDigits(col)} END)`;
const phoneValid = (col: string) =>
  `char_length(${phoneNorm(col)}) IN (10, 11) AND ${phoneNorm(col)} LIKE '01%'`;

export async function syncUniqueCustomers(): Promise<{ customer: number; external: number }> {
  // 1) customer → upsert (CUSTOMER). 매장중복은 phone당 최신 1건(DISTINCT ON).
  const customerSql = `
    INSERT INTO unique_customers
      (id, phone, "regionSido", "regionSigungu", "ageGroup", gender, "consentMarketing", source, "syncedAt", "updatedAt")
    SELECT DISTINCT ON (${phoneNorm('c.phone')})
      gen_random_uuid()::text,
      ${phoneNorm('c.phone')},
      ${sidoCaseSql('c."regionSido"')},
      split_part(c."regionSigungu", ' ', 1),
      c."ageGroup",
      c.gender,
      true,
      'CUSTOMER'::"UniqueCustomerSource",
      now(), now()
    FROM customers c
    WHERE c."consentMarketing" = true
      AND c.phone IS NOT NULL
      AND c."regionSido" IS NOT NULL AND c."regionSido" <> ''
      AND c."regionSigungu" IS NOT NULL AND c."regionSigungu" <> ''
      AND ${phoneValid('c.phone')}
    ORDER BY ${phoneNorm('c.phone')}, c."updatedAt" DESC
    ON CONFLICT (phone) DO UPDATE SET
      "regionSido" = EXCLUDED."regionSido",
      "regionSigungu" = EXCLUDED."regionSigungu",
      "ageGroup" = COALESCE(EXCLUDED."ageGroup", unique_customers."ageGroup"),
      gender = COALESCE(EXCLUDED.gender, unique_customers.gender),
      source = CASE WHEN unique_customers.source IN ('EXTERNAL','BOTH') THEN 'BOTH'::"UniqueCustomerSource" ELSE 'CUSTOMER'::"UniqueCustomerSource" END,
      "consentMarketing" = true,
      "syncedAt" = now(),
      "updatedAt" = now();
  `;
  const customer = await prisma.$executeRawUnsafe(customerSql);

  // 2) external → upsert (EXTERNAL). 지역/연령을 덮어써 external 우선 반영.
  // DISTINCT ON: 서로 다른 원본 번호가 정규화(+82→0) 후 동일해질 수 있어, 한 INSERT 내 중복 conflict 대상
  // ("cannot affect row a second time") 방지. phone당 최신 1건만.
  const externalSql = `
    INSERT INTO unique_customers
      (id, phone, "regionSido", "regionSigungu", "ageGroup", gender, "consentMarketing", source, "syncedAt", "updatedAt")
    SELECT DISTINCT ON (${phoneNorm('e.phone')})
      gen_random_uuid()::text,
      ${phoneNorm('e.phone')},
      ${sidoCaseSql('e."regionSido"')},
      split_part(e."regionSigungu", ' ', 1),
      e."ageGroup",
      e.gender,
      true,
      'EXTERNAL'::"UniqueCustomerSource",
      now(), now()
    FROM external_customers e
    WHERE e."consentMarketing" = true
      AND e."regionSido" IS NOT NULL AND e."regionSido" <> ''
      AND e."regionSigungu" IS NOT NULL AND e."regionSigungu" <> ''
      AND ${phoneValid('e.phone')}
    ORDER BY ${phoneNorm('e.phone')}, e."createdAt" DESC
    ON CONFLICT (phone) DO UPDATE SET
      "regionSido" = EXCLUDED."regionSido",
      "regionSigungu" = EXCLUDED."regionSigungu",
      "ageGroup" = COALESCE(EXCLUDED."ageGroup", unique_customers."ageGroup"),
      gender = COALESCE(EXCLUDED.gender, unique_customers.gender),
      source = CASE WHEN unique_customers.source IN ('CUSTOMER','BOTH') THEN 'BOTH'::"UniqueCustomerSource" ELSE 'EXTERNAL'::"UniqueCustomerSource" END,
      "consentMarketing" = true,
      "syncedAt" = now(),
      "updatedAt" = now();
  `;
  const external = await prisma.$executeRawUnsafe(externalSql);

  console.log(`[UniqueCustomerSync] customer upsert=${customer}, external upsert=${external}`);
  return { customer, external };
}

export function startUniqueCustomerSyncWorker() {
  console.log('[UniqueCustomerSync] started (daily)');
  syncUniqueCustomers().catch((e) => console.error('[UniqueCustomerSync] initial run error:', e));
  setInterval(() => {
    syncUniqueCustomers().catch((e) => console.error('[UniqueCustomerSync] error:', e));
  }, SYNC_INTERVAL_MS);
}
