import { Router } from 'express';
import { prisma as prismaClient } from '../lib/prisma.js';
import { yahwaAuthMiddleware } from '../middleware/yahwa-auth.js';
import {
  computeWaitingState,
  getStoreWaitingCounts,
  registerYahwaWaiting,
} from '../services/yahwa-waiting.js';
import { cancelWaiting } from '../services/waiting.js';
import { notifyYahwaStatusChange } from '../services/yahwa-webhook.js';

const prisma = prismaClient as any;

const router = Router();

// 모든 /api/v1 엔드포인트는 고정 API Key 인증 필요
router.use(yahwaAuthMiddleware);

/**
 * 1. 매장 목록 (매핑용) — GET /api/v1/stores
 * yahwaEnabled=true 인 매장만 노출.
 */
router.get('/stores', async (_req, res) => {
  try {
    const stores = await prisma.store.findMany({
      where: { yahwaEnabled: true },
      select: {
        id: true,
        name: true,
        address: true,
        addressSido: true,
        addressSigungu: true,
        addressDetail: true,
        businessRegNumber: true,
        waitingSetting: { select: { operationStatus: true, enabled: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = stores.map((s: any) => {
      const address =
        s.address ||
        [s.addressSido, s.addressSigungu, s.addressDetail].filter(Boolean).join(' ') ||
        null;
      const setting = s.waitingSetting;
      const active = !!setting && setting.enabled && setting.operationStatus !== 'CLOSED';
      return {
        store_id: s.id,
        name: s.name,
        address,
        biz_no: s.businessRegNumber ?? null,
        active,
      };
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('[Yahwa] GET /stores error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 2. 웨이팅 수 일괄 조회 (★지도 핵심) — POST /api/v1/waitings/counts
 */
router.post('/waitings/counts', async (req, res) => {
  try {
    const { store_ids } = req.body || {};
    if (!Array.isArray(store_ids)) {
      return res.status(400).json({ error: 'invalid_request', message: 'store_ids 배열이 필요합니다.' });
    }
    if (store_ids.length > 100) {
      return res.status(400).json({ error: 'invalid_request', message: 'store_ids 는 최대 100개까지 허용됩니다.' });
    }
    const ids = store_ids.filter((x: any) => typeof x === 'string');

    const counts = await getStoreWaitingCounts(ids);
    res.status(200).json({ counts });
  } catch (err) {
    console.error('[Yahwa] POST /waitings/counts error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 2-1. 매장 실시간 성별 비율 일괄 조회 (★지도 핵심) — POST /api/v1/stores/gender-stats
 *
 * 테이블 링크 이용 고객의 성별 선택 데이터를 시간 창(window) 기준으로 집계.
 * body: { store_ids: string[], window_minutes?: number }  // 기본 180분, 최대 1440분
 * resp: { stats: [{ store_id, male_count, female_count, total_count, male_ratio, female_ratio, window_minutes, updated_at }] }
 */
router.post('/stores/gender-stats', async (req, res) => {
  try {
    const { store_ids, window_minutes } = req.body || {};
    if (!Array.isArray(store_ids)) {
      return res.status(400).json({ error: 'invalid_request', message: 'store_ids 배열이 필요합니다.' });
    }
    if (store_ids.length > 100) {
      return res.status(400).json({ error: 'invalid_request', message: 'store_ids 는 최대 100개까지 허용됩니다.' });
    }
    const ids = store_ids.filter((x: any) => typeof x === 'string');

    let windowMin = Number.isInteger(window_minutes) && window_minutes > 0 ? window_minutes : 180;
    windowMin = Math.min(windowMin, 1440);
    const since = new Date(Date.now() - windowMin * 60 * 1000);

    const grouped = await prisma.tableLinkGenderLog.groupBy({
      by: ['storeId', 'gender'],
      where: {
        storeId: { in: ids },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });

    const byStore: Record<string, { male: number; female: number }> = {};
    for (const g of grouped) {
      if (!byStore[g.storeId]) byStore[g.storeId] = { male: 0, female: 0 };
      if (g.gender === 'MALE') byStore[g.storeId].male = g._count._all;
      else if (g.gender === 'FEMALE') byStore[g.storeId].female = g._count._all;
    }

    const now = new Date().toISOString();
    const stats = ids.map((storeId: string) => {
      const c = byStore[storeId] || { male: 0, female: 0 };
      const total = c.male + c.female;
      return {
        store_id: storeId,
        male_count: c.male,
        female_count: c.female,
        total_count: total,
        male_ratio: total > 0 ? Math.round((c.male / total) * 1000) / 10 : null,
        female_ratio: total > 0 ? Math.round((c.female / total) * 1000) / 10 : null,
        window_minutes: windowMin,
        updated_at: now,
      };
    });

    res.status(200).json({ stats });
  } catch (err) {
    console.error('[Yahwa] POST /stores/gender-stats error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 3. 웨이팅 등록 — POST /api/v1/waitings
 */
router.post('/waitings', async (req, res) => {
  try {
    const { store_id, party_size, idempotency_key, customer } = req.body || {};

    if (typeof store_id !== 'string' || !store_id) {
      return res.status(400).json({ error: 'invalid_request', message: 'store_id 가 필요합니다.' });
    }
    if (!Number.isInteger(party_size) || party_size < 1) {
      return res.status(400).json({ error: 'invalid_request', message: 'party_size 는 1 이상 정수여야 합니다.' });
    }
    if (!customer || typeof customer.external_id !== 'string' || !customer.external_id) {
      return res.status(400).json({ error: 'invalid_request', message: 'customer.external_id 가 필요합니다.' });
    }

    const result = await registerYahwaWaiting({
      storeId: store_id,
      partySize: party_size,
      idempotencyKey: typeof idempotency_key === 'string' ? idempotency_key : undefined,
      externalCustomerId: customer.external_id,
      name: typeof customer.name === 'string' ? customer.name : undefined,
      phone: typeof customer.phone === 'string' ? customer.phone : undefined,
    });

    if (!result.ok) {
      if (result.error === 'not_found') {
        return res.status(404).json({ error: 'not_found' });
      }
      if (result.error === 'already_waiting') {
        return res.status(409).json({ error: 'already_waiting', waiting_id: result.waitingId });
      }
      if (result.error === 'store_closed') {
        return res.status(422).json({ error: 'store_closed' });
      }
      return res.status(400).json({ error: 'invalid_request' });
    }

    const waiting = result.waiting;
    const state = await computeWaitingState(waiting);

    // 신규 등록 시 야화로 상태 푸시 (replay는 이미 야화가 알고 있으므로 생략)
    if (!result.replay) {
      void notifyYahwaStatusChange(waiting.id);
    }

    res.status(result.replay ? 200 : 201).json({
      waiting_id: waiting.id,
      status: state.status,
      position: state.position,
      estimated_wait_min: state.estimated_wait_min,
      created_at: new Date(waiting.createdAt).toISOString(),
    });
  } catch (err) {
    console.error('[Yahwa] POST /waitings error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 4. 웨이팅 상태 조회 — GET /api/v1/waitings/:waiting_id
 */
router.get('/waitings/:waitingId', async (req, res) => {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: req.params.waitingId, externalSource: 'YAHWA' },
      include: { waitingType: true },
    });
    if (!waiting) {
      return res.status(404).json({ error: 'not_found' });
    }

    const state = await computeWaitingState(waiting);
    res.status(200).json({
      waiting_id: waiting.id,
      store_id: waiting.storeId,
      status: state.status,
      position: state.position,
      estimated_wait_min: state.estimated_wait_min,
      updated_at: new Date(waiting.updatedAt).toISOString(),
    });
  } catch (err) {
    console.error('[Yahwa] GET /waitings/:id error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 5. 웨이팅 취소 — POST /api/v1/waitings/:waiting_id/cancel
 */
router.post('/waitings/:waitingId/cancel', async (req, res) => {
  try {
    const waiting = await prisma.waitingList.findFirst({
      where: { id: req.params.waitingId, externalSource: 'YAHWA' },
      select: { id: true, storeId: true, status: true, cancelReason: true },
    });
    if (!waiting) {
      return res.status(404).json({ error: 'not_found' });
    }

    // 이미 종료 상태면 취소 불가
    if (!['WAITING', 'CALLED'].includes(waiting.status)) {
      const { mapStatus } = await import('../services/yahwa-waiting.js');
      return res.status(409).json({
        error: 'not_cancellable',
        status: mapStatus(waiting.status, waiting.cancelReason),
      });
    }

    // 알림톡 발송 없이 취소 (야화는 자체 푸시 사용)
    const result = await cancelWaiting(waiting.storeId, waiting.id, 'CUSTOMER_REQUEST', false);
    if (!result.success) {
      return res.status(409).json({ error: 'not_cancellable' });
    }

    res.status(200).json({ waiting_id: waiting.id, status: 'cancelled' });
  } catch (err) {
    console.error('[Yahwa] POST /waitings/:id/cancel error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
