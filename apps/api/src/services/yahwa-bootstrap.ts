// 야화 연동 부트스트랩 — 서버 기동 시 1회 실행.
// 배포 환경(Render)의 프로덕션 DB에는 CLI 스크립트(scripts/enable-yahwa-stores.ts)를
// 직접 실행할 수단이 없었어서, 매장명에 "야화"가 들어간 매장을 자동으로
// yahwaEnabled=true 로 켠다. 멱등 — 이미 켜진 매장은 건드리지 않고, OFF인
// 매장만 켠다(과거에 의도적으로 꺼둔 매장을 되돌리지 않도록 대상은 이름 매칭만).
import { prisma as prismaClient } from '../lib/prisma.js';

const prisma = prismaClient as any;

export async function bootstrapEnableYahwaStoresByName(): Promise<void> {
  try {
    const targets = await prisma.store.findMany({
      where: { name: { contains: '야화' }, yahwaEnabled: false },
      select: { id: true, name: true },
    });
    if (targets.length === 0) return;

    await prisma.store.updateMany({
      where: { id: { in: targets.map((s: any) => s.id) } },
      data: { yahwaEnabled: true },
    });

    console.log(`[YahwaBootstrap] 매장명에 '야화' 포함 ${targets.length}곳 yahwaEnabled=true 로 전환:`);
    for (const s of targets) console.log(`  - ${s.id} ${s.name}`);
  } catch (err) {
    console.error('[YahwaBootstrap] failed:', err);
  }
}
