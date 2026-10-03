// 사장님 리포트·로그인 없는 링크 API
//  - POST /api/owner-link/open        (공개) 알림톡 링크 열기 → 12시간 로그인 토큰 + 리포트
//  - GET  /api/owner/report           (사장님) 최근 7일 리포트 · 충전금 상태 · 자동 마케팅 추천
//  - PUT  /api/owner/report-opt-out   (사장님) 주간 리포트 알림톡 받지 않기
//  - POST /api/owner/quick-automation (사장님) 추천 자동 마케팅 바로 켜기
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { openOwnerLink } from '../services/owner-notice/links.js';
import { buildOwnerReport } from '../services/owner-notice/report.js';
import { reportHeadline, mobileOf } from '../services/owner-notice/worker.js';
import { ensureRulesExist, updateRuleWithToggleLog } from './automation.js';
import { AutomationRuleType } from '@prisma/client';

export const ownerLinkRouter = Router();

/** 안내 받는 번호 — 사장님이 등록한 번호, 없으면 매장 연락처가 휴대폰일 때 그 번호 (가운데 가림) */
function notifyInfo(store: { ownerReportOptOut: boolean; ownerNotifyPhone: string | null; phone: string | null } | null) {
  const phone = mobileOf(store?.ownerNotifyPhone) ?? mobileOf(store?.phone);
  return {
    reportOptOut: store?.ownerReportOptOut ?? false,
    notifyPhone: phone ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : null,
  };
}
export const ownerRouter = Router();

// 링크 열기 시도 제한 (IP 당 1분 30회) — 토큰을 무작위로 맞혀 보는 시도 방지
const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60000) {
    hits.set(ip, { n: 1, at: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n += 1;
  return h.n > 30;
}

ownerLinkRouter.post('/open', async (req: Request, res: Response) => {
  try {
    if (limited(req.ip || 'unknown')) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.' });
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const opened = await openOwnerLink(token);
    if (!opened) return res.status(404).json({ error: '링크가 만료되었거나 올바르지 않아요. 최근에 받은 알림톡의 버튼을 눌러 주세요.' });
    const [report, store] = await Promise.all([
      buildOwnerReport(opened.storeId),
      prisma.store.findUnique({ where: { id: opened.storeId }, select: { ownerReportOptOut: true, ownerNotifyPhone: true, phone: true } }),
    ]);
    if (!report) return res.status(404).json({ error: '매장을 찾을 수 없어요.' });
    res.json({
      purpose: opened.purpose,
      session: opened.session,
      report: { ...report, headline: reportHeadline(report), ...notifyInfo(store) },
    });
  } catch (error) {
    console.error('[OwnerLink] open error:', error);
    res.status(500).json({ error: '리포트를 불러오지 못했어요.' });
  }
});

ownerRouter.get('/report', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const [report, store] = await Promise.all([
      buildOwnerReport(storeId),
      prisma.store.findUnique({ where: { id: storeId }, select: { ownerReportOptOut: true, ownerNotifyPhone: true, phone: true } }),
    ]);
    if (!report) return res.status(404).json({ error: '매장을 찾을 수 없어요.' });
    res.json({ report: { ...report, headline: reportHeadline(report), ...notifyInfo(store) } });
  } catch (error) {
    console.error('[Owner] report error:', error);
    res.status(500).json({ error: '리포트를 불러오지 못했어요.' });
  }
});

ownerRouter.put('/report-opt-out', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const optOut = req.body?.optOut === true;
    await prisma.store.update({ where: { id: req.user!.storeId }, data: { ownerReportOptOut: optOut } });
    res.json({ optOut });
  } catch (error) {
    console.error('[Owner] opt-out error:', error);
    res.status(500).json({ error: '설정을 저장하지 못했어요.' });
  }
});

// POST /api/owner/quick-automation — 리포트 화면에서 추천 자동 마케팅을 바로 켠다
// (쿠폰 내용만 받고 나머지는 기본값. 네이버 플레이스 링크가 없으면 함께 받아 그 칸만 저장)
const QUICK_TYPES = ['FIRST_VISIT_FOLLOWUP', 'CHURN_PREVENTION', 'BIRTHDAY'] as const;
// 주류 혜택 쿠폰은 받지 않는다 — 리타겟 쿠폰의 주류 보상으로 카카오 채널이 정지된 적이 있다
const ALCOHOL_WORDS = /소주|맥주|생맥|하이볼|와인|사케|막걸리|주류|칵테일|위스키|양주|보드카|데킬라|샴페인|술\s*(한|1|2|두)?\s*(잔|병|무료|서비스)/;

ownerRouter.post('/quick-automation', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const type = String(req.body?.type ?? '') as (typeof QUICK_TYPES)[number];
    const couponContent = String(req.body?.couponContent ?? '').trim().slice(0, 60);
    const naverPlaceUrl = String(req.body?.naverPlaceUrl ?? '').trim();
    if (!QUICK_TYPES.includes(type)) return res.status(400).json({ error: '켤 수 없는 자동 마케팅이에요.' });
    if (!couponContent) return res.status(400).json({ error: '손님에게 드릴 혜택을 적어 주세요.' });
    if (ALCOHOL_WORDS.test(couponContent)) {
      return res.status(400).json({ error: '술·주류 혜택은 문자로 보낼 수 없어요. 음식·음료(무알콜) 혜택으로 적어 주세요.', code: 'alcohol' });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { naverPlaceUrl: true } });
    if (!store?.naverPlaceUrl) {
      if (!/^https?:\/\/(naver\.me|(m\.)?place\.naver\.com|map\.naver\.com|(m\.)?booking\.naver\.com)\//i.test(naverPlaceUrl)) {
        return res.status(400).json({ error: '네이버 플레이스 링크를 넣어 주세요. (네이버 지도에서 매장 → 공유 → 링크 복사)', code: 'naver_place_required' });
      }
      await prisma.store.update({ where: { id: storeId }, data: { naverPlaceUrl } });
    }

    await ensureRulesExist(storeId);
    const rule = await updateRuleWithToggleLog(storeId, type as AutomationRuleType, { enabled: true, couponEnabled: true, couponContent }, 'OWNER');
    res.json({ rule: { type: rule.type, enabled: rule.enabled, couponContent: rule.couponContent } });
  } catch (error) {
    console.error('[Owner] quick automation error:', error);
    res.status(500).json({ error: '자동 마케팅을 켜지 못했어요.' });
  }
});

// PUT /api/owner/notify-phone — 충전금·주간 리포트 알림톡 받을 사장님 휴대폰
ownerRouter.put('/notify-phone', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const phone = mobileOf(String(req.body?.phone ?? ''));
    if (!phone) return res.status(400).json({ error: '010으로 시작하는 휴대폰 번호를 입력해 주세요.' });
    await prisma.store.update({ where: { id: req.user!.storeId }, data: { ownerNotifyPhone: phone } });
    res.json({ notifyPhone: `${phone.slice(0, 3)}-****-${phone.slice(-4)}` });
  } catch (error) {
    console.error('[Owner] notify phone error:', error);
    res.status(500).json({ error: '번호를 저장하지 못했어요.' });
  }
});
