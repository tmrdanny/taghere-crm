/**
 * V2 인바운드 웹훅의 매장 식별 헬퍼.
 *
 * 연결 키 재설계(Phase 2): V2가 자기 storeId 를 보내오면 stores.v2StoreId 로 먼저 찾고,
 * 없거나 미매칭이면 기존 slug 로 폴백한다. 어느 키가 쓰였는지 로그로 남겨
 * 폴백이 0으로 수렴하는지 관찰한다(수렴 후 Phase 4에서 slug 폴백 제거).
 */
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

interface V2StoreRef {
  storeId?: string | null;  // V2 internal.stores.id (SR...)
  storeSlug?: string | null; // CRM stores.slug (레거시 키)
}

export async function findStoreByV2Ref<S extends Prisma.StoreSelect>(
  endpoint: string,
  ref: V2StoreRef,
  select: S
): Promise<Prisma.StoreGetPayload<{ select: S }> | null> {
  const { storeId, storeSlug } = ref;

  if (storeId) {
    const byId = await prisma.store.findUnique({ where: { v2StoreId: storeId }, select });
    if (byId) {
      console.log(`[StoreRef] ${endpoint} key=id storeId=${storeId}`);
      return byId;
    }
    // v2StoreId 미기입 매장(백필 누락/신규) — slug 폴백을 시도하되 반드시 흔적을 남긴다
    console.warn(`[StoreRef] ${endpoint} key=id-miss storeId=${storeId} slug=${storeSlug ?? '-'}`);
  }

  if (!storeSlug) return null;
  const bySlug = await prisma.store.findFirst({ where: { slug: storeSlug }, select });
  if (bySlug) {
    console.log(`[StoreRef] ${endpoint} key=slug slug=${storeSlug}`);
  }
  return bySlug;
}

/** 주문 서비스 매장 ID 형식 — write 경계(admin PATCH·register)에서 오염 저장을 막는다 */
export const V2_STORE_ID_RE = /^SR[0-9A-Z]{26}$/i;
export const V1_STORE_ID_RE = /^[0-9a-f]{24}$/i;
