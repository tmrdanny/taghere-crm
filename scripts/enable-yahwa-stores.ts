/**
 * 야화(외부 파트너) 연동 매장 플래그 설정 스크립트
 *
 * yahwaEnabled=true 인 매장만 /api/v1 외부 API(GET /stores, counts, 등록 등)에 노출됩니다.
 *
 * 사용법:
 *   # slug 또는 store id 로 활성화
 *   npx tsx scripts/enable-yahwa-stores.ts <slug-or-id> [<slug-or-id> ...]
 *
 *   # 비활성화
 *   DISABLE=1 npx tsx scripts/enable-yahwa-stores.ts <slug-or-id> ...
 *
 *   # 현재 활성화된 매장 목록 + store_id 확인 (인자 없이)
 *   npx tsx scripts/enable-yahwa-stores.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const disable = process.env.DISABLE === '1';

  // 인자 없으면 현재 활성화된 매장 목록 출력
  if (args.length === 0) {
    const enabled = await prisma.store.findMany({
      where: { yahwaEnabled: true },
      select: { id: true, name: true, slug: true, businessRegNumber: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`\n현재 야화 연동(yahwaEnabled=true) 매장: ${enabled.length}개\n`);
    for (const s of enabled) {
      console.log(`  store_id=${s.id}  slug=${s.slug ?? '-'}  biz=${s.businessRegNumber ?? '-'}  ${s.name}`);
    }
    console.log('');
    return;
  }

  for (const key of args) {
    const store = await prisma.store.findFirst({
      where: { OR: [{ id: key }, { slug: key }] },
      select: { id: true, name: true, slug: true },
    });
    if (!store) {
      console.warn(`  ⚠️  찾을 수 없음: ${key}`);
      continue;
    }
    await prisma.store.update({
      where: { id: store.id },
      data: { yahwaEnabled: !disable },
    });
    console.log(
      `  ${disable ? '🔕 비활성화' : '✅ 활성화'}: store_id=${store.id}  slug=${store.slug ?? '-'}  ${store.name}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
