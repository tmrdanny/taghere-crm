// 사장님 안내 워커 — 충전금 부족 안내 + 주간 매장 리포트 알림톡.
//
// 왜: 매장 충전은 대부분 "적립 알림이 멈춘 뒤"에야 일어나는데(첫 충전 매장 86곳 중 43곳),
// 멈췄다는 사실을 사장님에게 알려주는 장치가 없었다. 또 CRM 에 쌓이는 손님 기록을 사장님이
// 로그인하지 않으면 볼 수 없어서, 매주 숫자를 알림톡으로 보내고 버튼 하나로(로그인 없이) 리포트·충전을 열게 한다.
//
// 안전장치
//  - OWNER_NOTICE_ENABLED=true 인 서버에서만 돈다 (개발 API 도 운영 DB 를 보므로 운영에만 켠다).
//  - (매장, 종류, 기간) 유니크 행을 먼저 만든 쪽만 보낸다 → 서버가 둘이어도 한 번만 나간다.
//  - 휴대폰 번호(010)로 등록된 매장에만, 낮 시간(KST)에만 보낸다.
//  - 사장님 안내는 무료(OWNER_NOTICE) — 매장 충전금에서 빠지지 않는다.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { enqueueAlimTalk } from '../alimtalk-templates.js';
import { createOwnerLink } from './links.js';
import { buildOwnerReport, walletStatus, OwnerReport, WalletStatus } from './report.js';

export const OWNER_NOTICE_TEMPLATES = {
  LOW_BALANCE: process.env.OWNER_NOTICE_TEMPLATE_LOW_BALANCE || 'KA01TP261003130552697xNyUXPVd7CD',
  WEEKLY_REPORT: process.env.OWNER_NOTICE_TEMPLATE_WEEKLY || 'KA01TP2610031305529674hAmxvEI1Y1',
};

export type NoticeKind = 'LOW_BALANCE_SOON' | 'LOW_BALANCE_EMPTY' | 'WEEKLY_REPORT';

const TICK_MS = 5 * 60 * 1000;
const BATCH = 30; // 한 번에 처리할 매장 수 (리포트 계산이 무거워 나눠서)
const DAY = 86400000;

const won = (v: number) => v.toLocaleString('ko-KR');
/** 받침이 있으면 '을', 없으면 '를' */
const eulReul = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
};

/** KST 시각 정보 */
function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600000);
  return { hour: k.getUTCHours(), dow: k.getUTCDay(), date: k.toISOString().slice(0, 10), k };
}

/** 그 주 월요일 날짜 (KST) — 주 단위 중복 방지 키 */
export function weekKey(now = new Date()): string {
  const { k } = kstNow(now);
  const monday = new Date(k.getTime() - ((k.getUTCDay() + 6) % 7) * DAY);
  return monday.toISOString().slice(0, 10);
}

/** 휴대폰 번호만 (알림톡은 유선 번호로 갈 수 없다) */
export function mobileOf(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

// ---------- 문구 ----------

export function lowBalanceVariables(storeName: string, w: WalletStatus, token: string, kind: NoticeKind): Record<string, string> {
  const state =
    kind === 'LOW_BALANCE_EMPTY'
      ? w.skipped7d > 0
        ? `최근 7일 동안 손님 알림 ${won(w.skipped7d)}건이 충전금 부족으로 발송되지 못했습니다.`
        : '충전금이 부족해 손님 알림이 발송되지 않고 있습니다.'
      : `지금 사용 속도(하루 약 ${won(w.dailySpend)}원)면 약 ${Math.max(1, w.daysLeft ?? 1)}일 뒤 모두 소진됩니다.`;
  return {
    '#{매장명}': storeName,
    '#{잔액}': won(w.balance),
    '#{상태}': state,
    '#{링크}': token,
  };
}

const md = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

/** 리포트 한 줄 안내 — 가장 급한 것 하나만 */
export function reportHeadline(r: OwnerReport): string {
  const w = r.wallet;
  if (w.state === 'EMPTY') {
    return w.skipped7d > 0
      ? `충전금이 부족해 손님 알림 ${won(w.skipped7d)}건이 발송되지 못했습니다.`
      : '충전금이 부족해 손님 알림이 발송되지 않고 있습니다.';
  }
  if (w.state === 'LOW') return `충전금이 약 ${Math.max(1, w.daysLeft ?? 1)}일 뒤 모두 소진됩니다.`;
  const off = r.automation.items.filter((i) => !i.enabled && i.audience > 0).sort((a, b) => b.audience - a.audience)[0];
  if (r.automation.enabledCount === 0 && off) {
    return `자동 마케팅이 꺼져 있습니다. '${off.label}'${eulReul(off.label)} 켜면 최근 30일 기준 손님 ${won(off.audience)}명에게 자동으로 발송됩니다.`;
  }
  if (r.marketing.revisited > 0) {
    return `최근 30일 메시지를 받은 손님 ${won(r.marketing.recipients)}명 중 ${won(r.marketing.revisited)}명이 14일 안에 다시 방문했습니다.`;
  }
  return '이번 주도 손님 기록이 꾸준히 쌓이고 있습니다.';
}

export function weeklyVariables(r: OwnerReport, token: string): Record<string, string> {
  const diff = r.thisWeek.visitors - r.lastWeek.visitors;
  const change = diff > 0 ? `지난주보다 ${won(diff)}명 늘었어요` : diff < 0 ? `지난주보다 ${won(-diff)}명 줄었어요` : '지난주와 같아요';
  const endDay = new Date(new Date(r.thisWeek.to).getTime() - 1);
  return {
    '#{매장명}': r.store.name,
    '#{기간}': `${md(r.thisWeek.from)}~${md(endDay.toISOString())}`,
    '#{적립손님}': won(r.thisWeek.visitors),
    '#{증감}': change,
    '#{다시온손님}': won(r.thisWeek.returning),
    '#{처음온손님}': won(r.thisWeek.newCustomers),
    '#{메시지효과}': won(r.marketing.revisited),
    '#{잔액}': won(r.wallet.balance),
    '#{안내}': reportHeadline(r),
    '#{링크}': token,
  };
}

// ---------- 발송 ----------

/** 안내 행을 먼저 만들고(중복이면 건너뜀) 링크·알림톡을 보낸다 */
async function sendNotice(p: {
  storeId: string;
  kind: NoticeKind;
  periodKey: string;
  phone: string;
  build: (token: string) => Record<string, string>;
  payload: Prisma.InputJsonValue;
  /** 시험 발송 — 중복 방지 키를 따로 쓰고 기록만 남긴다 */
  test?: boolean;
}): Promise<{ sent: boolean; reason?: string; noticeId?: string }> {
  let notice;
  try {
    notice = await prisma.ownerNotice.create({
      data: { storeId: p.storeId, kind: p.kind, periodKey: p.test ? `test:${Date.now()}` : p.periodKey, phone: p.phone, payload: p.payload },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { sent: false, reason: 'already_sent' };
    throw e;
  }
  try {
    const { token } = await createOwnerLink({ storeId: p.storeId, purpose: p.kind === 'WEEKLY_REPORT' ? 'REPORT' : 'TOPUP', noticeId: notice.id });
    const result = await enqueueAlimTalk({
      storeId: p.storeId,
      phone: p.phone,
      messageType: 'OWNER_NOTICE',
      templateId: p.kind === 'WEEKLY_REPORT' ? OWNER_NOTICE_TEMPLATES.WEEKLY_REPORT : OWNER_NOTICE_TEMPLATES.LOW_BALANCE,
      variables: p.build(token),
      idempotencyKey: `owner_notice:${notice.id}`,
    });
    await prisma.ownerNotice.update({
      where: { id: notice.id },
      data: result.success ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', error: result.error ?? 'enqueue failed' },
    });
    return { sent: result.success, reason: result.error, noticeId: notice.id };
  } catch (e: any) {
    await prisma.ownerNotice.update({ where: { id: notice.id }, data: { status: 'FAILED', error: String(e?.message ?? e).slice(0, 500) } }).catch(() => {});
    return { sent: false, reason: e?.message, noticeId: notice.id };
  }
}

// ---------- 대상 고르기 ----------

export interface LowBalanceCandidate {
  storeId: string;
  storeName: string;
  phone: string | null;
  kind: NoticeKind;
  wallet: WalletStatus;
}

/**
 * 충전금 안내 대상
 *  - EMPTY: 잔액 20원 미만 + 최근 3일 안에 충전금 부족으로 못 나간 알림이 있음
 *  - SOON : 최근 14일 하루 평균 사용액이 있고, 지금 속도면 3일 안에 바닥
 * 같은 주에 EMPTY 를 받았으면 SOON 은 보내지 않는다. 최근 24시간 안에 충전한 매장은 뺀다.
 */
export async function findLowBalanceCandidates(now = new Date()): Promise<LowBalanceCandidate[]> {
  const since3 = new Date(now.getTime() - 3 * DAY).toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<Array<{ storeId: string; name: string; phone: string | null }>>(Prisma.sql`
    WITH spend AS (
      SELECT "storeId", -SUM(amount) / 14.0 AS daily
      FROM payment_transactions
      WHERE type = 'ALIMTALK_SEND' AND amount < 0 AND "createdAt" > now() - interval '14 days'
      GROUP BY "storeId"
    ), skips AS (
      SELECT DISTINCT "storeId" FROM alimtalk_skip_daily WHERE date >= ${since3}
    )
    SELECT s.id AS "storeId", s.name, COALESCE(s."ownerNotifyPhone", s.phone) AS phone
    FROM stores s
    LEFT JOIN wallets w ON w."storeId" = s.id
    LEFT JOIN spend sp ON sp."storeId" = s.id
    LEFT JOIN skips sk ON sk."storeId" = s.id
    WHERE s."crmEnabled" = true
      AND ((COALESCE(w.balance, 0) < 20 AND sk."storeId" IS NOT NULL)
        OR (sp.daily > 0 AND COALESCE(w.balance, 0) < sp.daily * 3))
      AND NOT EXISTS (
        SELECT 1 FROM payment_transactions t
        WHERE t."storeId" = s.id AND t.type = 'TOPUP' AND t."createdAt" > now() - interval '24 hours')`);
  const wk = weekKey(now);
  const sentThisWeek = await prisma.ownerNotice.findMany({
    where: { periodKey: wk, kind: { in: ['LOW_BALANCE_SOON', 'LOW_BALANCE_EMPTY'] }, storeId: { in: rows.map((r) => r.storeId) } },
    select: { storeId: true, kind: true },
  });
  const sent = new Set(sentThisWeek.map((s) => `${s.storeId}:${s.kind}`));
  const out: LowBalanceCandidate[] = [];
  for (const r of rows) {
    const w = await walletStatus(r.storeId);
    const kind: NoticeKind | null = w.state === 'EMPTY' ? 'LOW_BALANCE_EMPTY' : w.state === 'LOW' ? 'LOW_BALANCE_SOON' : null;
    if (!kind) continue;
    if (sent.has(`${r.storeId}:${kind}`)) continue;
    if (kind === 'LOW_BALANCE_SOON' && sent.has(`${r.storeId}:LOW_BALANCE_EMPTY`)) continue;
    out.push({ storeId: r.storeId, storeName: r.name, phone: mobileOf(r.phone), kind, wallet: w });
  }
  return out;
}

/** 주간 리포트 대상: 휴대폰 번호가 있고, 받지 않기를 누르지 않았고, 지난 7일 적립 손님이 3명 이상 */
export async function findWeeklyReportStores(now = new Date(), limit = 1000): Promise<Array<{ storeId: string; name: string; phone: string | null }>> {
  const wk = weekKey(now);
  return prisma.$queryRaw<Array<{ storeId: string; name: string; phone: string | null }>>(Prisma.sql`
    WITH active AS (
      SELECT "storeId", COUNT(DISTINCT "customerId") AS n FROM (
        SELECT "storeId", "customerId" FROM point_ledger WHERE type = 'EARN' AND "createdAt" > now() - interval '7 days'
        UNION ALL
        SELECT "storeId", "customerId" FROM stamp_ledger WHERE type = 'EARN' AND "createdAt" > now() - interval '7 days'
      ) x GROUP BY "storeId"
    )
    SELECT s.id AS "storeId", s.name, COALESCE(s."ownerNotifyPhone", s.phone) AS phone
    FROM stores s JOIN active a ON a."storeId" = s.id
    WHERE s."crmEnabled" = true AND s."ownerReportOptOut" = false AND a.n >= 3
      AND NOT EXISTS (SELECT 1 FROM owner_notices o WHERE o."storeId" = s.id AND o.kind = 'WEEKLY_REPORT' AND o."periodKey" = ${wk})
    ORDER BY a.n DESC
    LIMIT ${limit}`);
}

// ---------- 실행 ----------

export async function runLowBalanceNotices(now = new Date()) {
  const wk = weekKey(now);
  const list = (await findLowBalanceCandidates(now)).filter((c) => c.phone).slice(0, BATCH);
  let sent = 0;
  for (const c of list) {
    const r = await sendNotice({
      storeId: c.storeId,
      kind: c.kind,
      periodKey: wk,
      phone: c.phone!,
      payload: { ...c.wallet } as any,
      build: (token) => lowBalanceVariables(c.storeName, c.wallet, token, c.kind),
    });
    if (r.sent) sent++;
  }
  if (list.length) console.log(`[OwnerNotice] low balance: ${sent}/${list.length} sent`);
}

export async function runWeeklyReports(now = new Date()) {
  const wk = weekKey(now);
  const stores = (await findWeeklyReportStores(now, BATCH * 3)).filter((s) => mobileOf(s.phone)).slice(0, BATCH);
  let sent = 0;
  for (const s of stores) {
    const report = await buildOwnerReport(s.storeId, now);
    if (!report) continue;
    const r = await sendNotice({
      storeId: s.storeId,
      kind: 'WEEKLY_REPORT',
      periodKey: wk,
      phone: mobileOf(s.phone)!,
      payload: { thisWeek: report.thisWeek, lastWeek: report.lastWeek, marketing: report.marketing, wallet: report.wallet } as any,
      build: (token) => weeklyVariables(report, token),
    });
    if (r.sent) sent++;
  }
  if (stores.length) console.log(`[OwnerNotice] weekly report: ${sent}/${stores.length} sent`);
}

/** 관리자 시험 발송 — 지정한 번호로, 실제 매장 숫자로 보낸다 (중복 방지 기록과 섞이지 않음) */
export async function sendTestNotice(storeId: string, kind: NoticeKind, phone: string) {
  const to = mobileOf(phone);
  if (!to) throw new Error('휴대폰 번호(010)만 보낼 수 있습니다.');
  if (kind === 'WEEKLY_REPORT') {
    const report = await buildOwnerReport(storeId);
    if (!report) throw new Error('매장을 찾을 수 없습니다.');
    return sendNotice({ storeId, kind, periodKey: '', phone: to, test: true, payload: { test: true }, build: (t) => weeklyVariables(report, t) });
  }
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) throw new Error('매장을 찾을 수 없습니다.');
  const w = await walletStatus(storeId);
  return sendNotice({ storeId, kind, periodKey: '', phone: to, test: true, payload: { test: true }, build: (t) => lowBalanceVariables(store.name, w, t, kind) });
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const { hour, dow } = kstNow();
    // 주간 리포트: 월요일 10~12시 (5분마다 30곳씩)
    if (dow === 1 && hour >= 10 && hour < 12) await runWeeklyReports();
    // 충전금 안내: 매일 11~19시 (사장님 영업 준비·브레이크 시간대)
    if (hour >= 11 && hour < 20) await runLowBalanceNotices();
  } catch (e) {
    console.error('[OwnerNotice] tick error:', e);
  } finally {
    running = false;
  }
}

export function startOwnerNoticeWorker() {
  if (process.env.OWNER_NOTICE_ENABLED !== 'true') {
    console.log('[OwnerNotice] disabled (OWNER_NOTICE_ENABLED != true)');
    return;
  }
  console.log('[OwnerNotice] worker started');
  setTimeout(tick, 90 * 1000);
  setInterval(tick, TICK_MS);
}
