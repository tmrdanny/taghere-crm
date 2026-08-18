import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';

/**
 * 스탬프 스캔 입구 secret 발급/백필.
 *
 * secret 은 QR(shortURL)이 가리키는 토큰 발급 입구 URL의 경로 조각이다
 * (GET /api/taghere/stamp-scan-entry/:slug/:secret). 이게 없으면 어드민에서
 * QR 링크를 만들 수 없어 매장마다 발급 스크립트를 돌려야 했다.
 *
 * 신규 StampSetting 은 스키마 기본값(uuid)으로 자동 발급되고,
 * 기존 매장은 서버 부팅 시 backfillScanEntrySecrets() 가 한 번 채운다(멱등).
 */

/** 128비트 난수 base64url — 회전(재발급) 시 사용 */
export function generateScanEntrySecret(): string {
  return crypto.randomBytes(16).toString('base64url');
}

const CHUNK = 500;

/**
 * secret 이 없는 모든 매장에 secret 을 발급한다. 여러 번 실행해도 안전(멱등).
 *
 * 스탬프 사용 여부와 무관하게 발급한다 — secret 은 토큰 발급 입구의 경로 조각일 뿐
 * 적립을 켜지 않는다. StampSetting 을 새로 만들 때도 enabled 는 false 로 둔다
 * (GET /api/stamp-settings 가 이미 같은 기본값으로 행을 만든다).
 */
export async function backfillScanEntrySecrets(): Promise<{ filled: number; created: number }> {
  // 1) 행은 있는데 secret 만 비어 있는 매장
  const missing = await prisma.stampSetting.findMany({
    where: { scanEntrySecret: null },
    select: { id: true },
  });
  for (const row of missing) {
    await prisma.stampSetting.update({
      where: { id: row.id },
      data: { scanEntrySecret: generateScanEntrySecret() },
    });
  }

  // 2) StampSetting 자체가 없는 매장 — enabled=false 로 행만 만들어 secret 을 실어준다
  const storesWithout = await prisma.store.findMany({
    where: { stampSetting: { is: null } },
    select: { id: true },
  });
  let created = 0;
  for (let i = 0; i < storesWithout.length; i += CHUNK) {
    const chunk = storesWithout.slice(i, i + CHUNK);
    const result = await prisma.stampSetting.createMany({
      data: chunk.map((s) => ({
        storeId: s.id,
        enabled: false,
        alimtalkEnabled: true,
        scanEntrySecret: generateScanEntrySecret(),
      })),
      // 다중 인스턴스가 동시에 부팅해도 storeId 유니크 충돌로 죽지 않게
      skipDuplicates: true,
    });
    created += result.count;
  }

  return { filled: missing.length, created };
}

/** 부팅 시 1회 호출. 실패해도 서버 기동을 막지 않는다. */
export function scheduleScanEntrySecretBackfill(): void {
  backfillScanEntrySecrets()
    .then(({ filled, created }) => {
      if (filled || created) {
        console.log(`[StampScanSecret] 입구 secret 백필 완료 — 기존 행 ${filled}건 채움, 신규 행 ${created}건 생성`);
      }
    })
    .catch((e) => {
      console.error('[StampScanSecret] 입구 secret 백필 실패:', e);
    });
}
