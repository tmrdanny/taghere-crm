/**
 * 프랜차이즈 통합 고객(FranchiseCustomer) 전화번호·뒤 8자리 채우기 (고객 마이페이지 번호 조회용, 1회성)
 *
 * - phone 이 있으면 그 값으로 phoneLastDigits 계산
 * - phone 이 비어 있으면(만들 때만 채워져 비어 있는 경우가 많음) 같은 프랜차이즈 매장에서
 *   카카오ID 가 같은 매장 고객 기록의 번호로 phone 과 phoneLastDigits 를 같이 채운다
 * - 탈퇴한 기록은 건너뛴다. 이미 채워진 행은 건드리지 않는다 (멱등)
 *
 * 실행 방법:
 *   cd apps/api && npx tsx src/scripts/backfill-franchise-customer-phone.ts           # 미리보기
 *   cd apps/api && npx tsx src/scripts/backfill-franchise-customer-phone.ts --apply   # 실제 반영
 */

import '../load-env.js';
import { prisma } from '../lib/prisma.js';
import { toPhoneLastDigits } from '../utils/phone.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const targets = await prisma.franchiseCustomer.findMany({
    where: { phoneLastDigits: null, withdrawnAt: null },
    select: { id: true, franchiseId: true, kakaoId: true, phone: true },
  });
  console.log(`대상 ${targets.length}건 (${APPLY ? '반영' : '미리보기'})`);

  let fromOwnPhone = 0;
  let fromStoreCustomer = 0;
  let unresolved = 0;

  for (const fc of targets) {
    let phone = fc.phone;
    let source: 'own' | 'store' | null = phone ? 'own' : null;

    if (!phone) {
      const storeCustomer = await prisma.customer.findFirst({
        where: {
          kakaoId: fc.kakaoId,
          phone: { not: null },
          withdrawnAt: null,
          store: { franchiseId: fc.franchiseId },
        },
        orderBy: { updatedAt: 'desc' },
        select: { phone: true },
      });
      if (storeCustomer?.phone) {
        phone = storeCustomer.phone;
        source = 'store';
      }
    }

    if (!phone || !source) {
      unresolved++;
      continue;
    }

    if (source === 'own') fromOwnPhone++;
    else fromStoreCustomer++;

    if (APPLY) {
      await prisma.franchiseCustomer.update({
        where: { id: fc.id },
        data: { phone, phoneLastDigits: toPhoneLastDigits(phone) },
      });
    }
  }

  console.log(`자기 번호로 계산: ${fromOwnPhone}건`);
  console.log(`매장 고객 기록 번호로 채움: ${fromStoreCustomer}건`);
  console.log(`번호를 찾지 못함: ${unresolved}건`);
  if (!APPLY) console.log('미리보기만 했습니다. 반영하려면 --apply 를 붙여 실행하세요.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
