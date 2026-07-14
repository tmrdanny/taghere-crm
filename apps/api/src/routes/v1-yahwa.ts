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
import { spendYahwaPoints } from '../services/yahwa-points.js';

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
        slug: true,
        address: true,
        addressSido: true,
        addressSigungu: true,
        addressDetail: true,
        businessRegNumber: true,
        waitingSetting: { select: { operationStatus: true, enabled: true } },
        tableLinkSetting: { select: { tables: true } },
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
      // 좌석수 = 테이블 링크 개수 (야화 "N/20명" 표시용)
      const tables = s.tableLinkSetting?.tables;
      const seatCapacity = Array.isArray(tables) ? tables.length : null;
      return {
        store_id: s.id,
        name: s.name,
        slug: s.slug ?? null,  // 야화 원격 웨이팅 링크(/w/{slug}) 자동 연결용
        address,
        biz_no: s.businessRegNumber ?? null,
        active,
        seat_capacity: seatCapacity,
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
 * "현재 착석 추정" 방식: 테이블별로 가장 최근 일행만 집계한다.
 * - 같은 테이블에 새 성별 입력이 들어오면 = 새 일행 착석 = 이전 일행은 퇴장한 것으로 간주 (암묵적 퇴장 신호)
 * - 같은 테이블의 30분 이내 연속 입력은 한 일행으로 묶음 (일행이 각자 폰으로 순차 입력)
 * - 마지막 입력이 window_minutes(최대 체류시간)보다 오래된 테이블은 만료 처리
 *
 * body: { store_ids: string[], window_minutes?: number }  // 최대 체류시간, 기본 180분, 최대 1440분
 * resp: { stats: [{ store_id, male_count, female_count, total_count, male_ratio, female_ratio, window_minutes, updated_at }] }
 */
const SESSION_GROUP_MS = 30 * 60 * 1000; // 같은 테이블에서 한 일행으로 묶는 입력 간격

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

    const logs = await prisma.tableLinkGenderLog.findMany({
      where: {
        storeId: { in: ids },
        createdAt: { gte: since },
      },
      select: { storeId: true, tableNumber: true, gender: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // 매장 → 테이블별 최신 일행(세션)만 집계
    const byStore: Record<string, { male: number; female: number }> = {};
    const latestByTable: Record<string, number> = {}; // storeId|table → 해당 테이블 최신 입력 시각
    for (const log of logs) {
      const tableKey = `${log.storeId}|${log.tableNumber}`;
      const ts = new Date(log.createdAt).getTime();
      if (latestByTable[tableKey] === undefined) {
        latestByTable[tableKey] = ts; // desc 정렬이므로 첫 로그가 그 테이블의 최신
      } else if (latestByTable[tableKey] - ts > SESSION_GROUP_MS) {
        continue; // 최신 일행보다 오래된 이전 일행 → 퇴장 간주
      }
      if (!byStore[log.storeId]) byStore[log.storeId] = { male: 0, female: 0 };
      if (log.gender === 'MALE') byStore[log.storeId].male += 1;
      else if (log.gender === 'FEMALE') byStore[log.storeId].female += 1;
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

/**
 * 6. 포인트 조회 — POST /api/v1/customers/points/lookup
 * 야화 연동(yahwaEnabled) 매장들 중, 전화번호 뒷 8자리가 일치하는 고객의 매장별 포인트 잔액을 반환.
 * 야화 사용자가 연락처를 등록/변경할 때 초기 동기화(pull)에 사용.
 *
 * body: { phone_last_digits: string }  // 숫자 8자리
 * resp: { balances: [{ store_id, balance, updated_at }] }
 */
router.post('/customers/points/lookup', async (req, res) => {
  try {
    const phoneLastDigits = String(req.body?.phone_last_digits ?? '').replace(/\D/g, '');
    if (phoneLastDigits.length !== 8) {
      return res.status(400).json({ error: 'invalid_request', message: 'phone_last_digits는 숫자 8자리여야 합니다.' });
    }

    const customers = await prisma.customer.findMany({
      where: { phoneLastDigits, store: { yahwaEnabled: true } },
      select: { storeId: true, totalPoints: true, updatedAt: true },
    });

    res.status(200).json({
      balances: customers.map((c: any) => ({
        store_id: c.storeId,
        balance: c.totalPoints,
        updated_at: c.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[Yahwa] POST /customers/points/lookup error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * 7. 포인트 차감(사용) — POST /api/v1/customers/points/spend
 * 야화 앱에서 포인트를 소비할 때 호출. 태그히어가 진실원천 — 이 매장들(고객의 야화 연동
 * 매장 잔액) 중에서 잔액이 큰 순으로 차감해 매장 수를 최소화한다. 전액 부족 시 아무것도
 * 차감하지 않고 실패 반환(원자적, 부분 차감 없음). idempotency_key로 재요청 시 최초 결과 재반환.
 *
 * body: { phone_last_digits: string, amount: number, idempotency_key: string }
 * resp 200: { ok:true, spent: number, total_balance: number, stores: [{store_id, balance}] }
 * resp 409: { ok:false, error: 'insufficient_points', available: number }
 * resp 404: { ok:false, error: 'not_found' }  // 야화 연동 매장에 해당 전화번호 고객 없음
 */
router.post('/customers/points/spend', async (req, res) => {
  try {
    const phoneLastDigits = String(req.body?.phone_last_digits ?? '').replace(/\D/g, '');
    const amount = Number(req.body?.amount);
    const idempotencyKey = String(req.body?.idempotency_key ?? '');
    if (phoneLastDigits.length !== 8 || !Number.isInteger(amount) || amount <= 0 || !idempotencyKey) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const result = await spendYahwaPoints({ phoneLastDigits, amount, idempotencyKey });
    if (!result.ok) {
      const statusCode = result.error === 'not_found' ? 404 : 409;
      return res.status(statusCode).json(result);
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('[Yahwa] POST /customers/points/spend error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
