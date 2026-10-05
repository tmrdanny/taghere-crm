// 매장 좌표 채우기 워커 (고객 마이페이지 매장 지도용)
//
// 주소를 저장하는 곳이 여러 군데(사장님 가입·설정, 외부 생성, 관리자 생성·수정·일괄)라
// 각각 고치는 대신 이 작업 하나가 주기적으로 좌표를 채운다.
//
// 처리 대상 (CRM 켠 매장, 전체 주소 있음)
//  (가) 좌표가 없고, 지금 주소를 아직 시도하지 않은 매장 (geocodedAddress ≠ address)
//  (나) 이 작업이 좌표를 넣었던 매장(geocodedAddress 있음) 중 주소가 바뀐 매장
// 원칙
//  - 관리자가 위치 확인 기능용으로 넣은 기존 좌표(geocodedAddress 없음 + 좌표 있음)는 건드리지 않는다
//  - 실패해도 기존 좌표는 그대로 두고 geocodedAddress 만 기록한다 (같은 주소로 계속 재시도하지 않음)
import { prisma } from '../lib/prisma.js';
import { geocodeAddress } from './geocode.js';
import { clearStoreMapCache } from './store-map.js';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10분
const BATCH_SIZE = 50; // 하루 약 7,200곳 — 카카오 로컬 API 하루 한도 안
const MIN_ATTEMPTS_TO_SUSPECT_API = 5;

let intervalId: NodeJS.Timeout | null = null;
let running = false;

export async function runStoreGeocodeTick(): Promise<{ attempted: number; succeeded: number }> {
  // 키가 없으면 geocodeAddress 가 모두 실패로 돌아와 전부 "시도함"으로 기록되므로 아예 건너뛴다
  if (!process.env.KAKAO_REST_API_KEY && !process.env.KAKAO_CLIENT_ID) {
    return { attempted: 0, succeeded: 0 };
  }

  const targets = await prisma.$queryRaw<Array<{ id: string; address: string }>>`
    SELECT id, address
    FROM stores
    WHERE "crmEnabled" = true
      AND address IS NOT NULL AND btrim(address) <> ''
      AND (
        (latitude IS NULL AND ("geocodedAddress" IS NULL OR "geocodedAddress" <> address))
        OR ("geocodedAddress" IS NOT NULL AND "geocodedAddress" <> address)
      )
    ORDER BY "updatedAt" DESC
    LIMIT ${BATCH_SIZE}
  `;

  let succeeded = 0;
  const failed: Array<{ id: string; address: string }> = [];
  for (const store of targets) {
    const geo = await geocodeAddress(store.address);
    if (geo) {
      await prisma.store.update({
        where: { id: store.id },
        data: { latitude: geo.latitude, longitude: geo.longitude, geocodedAddress: store.address },
      });
      succeeded++;
    } else {
      failed.push(store);
    }
  }

  // 여러 곳을 시도했는데 하나도 성공하지 못했으면 주소 문제가 아니라 카카오 API 문제(키·로컬 API 비활성 등)로 본다.
  // 이때 "시도함"으로 기록하면 API 를 고친 뒤에도 같은 주소를 다시 시도하지 않으므로 기록하지 않는다.
  if (succeeded === 0 && failed.length >= MIN_ATTEMPTS_TO_SUSPECT_API) {
    console.error(`[StoreGeocode] ${failed.length}곳 모두 좌표 변환 실패 — 카카오 로컬 API 설정을 확인하세요. 기록하지 않고 다음에 다시 시도합니다.`);
    return { attempted: targets.length, succeeded };
  }
  for (const store of failed) {
    await prisma.store.update({
      where: { id: store.id },
      data: { geocodedAddress: store.address },
    });
    console.warn(`[StoreGeocode] 좌표 변환 실패: store=${store.id}, address=${store.address}`);
  }

  if (succeeded > 0) clearStoreMapCache();
  if (targets.length > 0) {
    console.log(`[StoreGeocode] attempted ${targets.length}, succeeded ${succeeded}`);
  }
  return { attempted: targets.length, succeeded };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await runStoreGeocodeTick();
  } catch (err) {
    console.error('[StoreGeocode] Tick error:', err);
  } finally {
    running = false;
  }
}

export function startStoreGeocodeWorker() {
  if (intervalId) return;
  void tick();
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  console.log(`[StoreGeocode] started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopStoreGeocodeWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
