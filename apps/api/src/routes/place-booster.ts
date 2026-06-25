/**
 * 네이버 플레이스 부스터 - 사장님(매장) 라우트
 * 모든 라우트 authMiddleware, storeId = req.user.storeId 스코프.
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import * as svc from '../services/place-booster-service.js';
import { lookupNaverPlace } from '../services/naver-place-lookup.js';
import { sendAligoAlimtalk } from '../services/aligo.js';
import { toMobileOrEmpty } from '../utils/phone.js';

const router = Router();

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof svc.BoosterError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

async function loadOwnedCampaign(id: string, storeId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.deletedAt || campaign.storeId !== storeId) {
    throw new svc.BoosterError('캠페인을 찾을 수 없습니다.', 404);
  }
  return campaign;
}

// POST /api/place-booster/verify-place - 네이버 플레이스 URL 검증 + 매장 정보 조회
router.post('/verify-place', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const info = await lookupNaverPlace(req.body.url);
    res.json(info);
  } catch (error) {
    handleError(res, error, '매장 정보 확인 중 오류가 발생했습니다.');
  }
});

// GET /api/place-booster/store-info - 점주 번호 프리필용 매장 정보
router.get('/store-info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
      select: { phone: true, ownerName: true },
    });
    res.json({ phone: toMobileOrEmpty(store?.phone), ownerName: store?.ownerName || '' });
  } catch (error) {
    handleError(res, error, '매장 정보 조회 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/test-send-preview - 캠페인 생성 전, 입력값으로 테스트 알림톡 1건
router.post('/test-send-preview', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, ...input } = req.body;
    const p = (phone || '').toString().trim();
    if (!p) throw new svc.BoosterError('테스트로 받을 휴대폰 번호를 입력해주세요.');
    const al = svc.buildBoosterPreviewAlimtalk(input);
    const result = await sendAligoAlimtalk({
      phone: p,
      tplCode: al.tplCode,
      subject: al.subject,
      message: al.message,
      buttonName: al.buttonName,
      buttonUrl: al.buttonUrl,
    });
    if (!result.success) throw new svc.BoosterError(result.error || '테스트 발송에 실패했습니다.', 502);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, '테스트 발송 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns - 캠페인 생성
router.post('/campaigns', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const campaign = await svc.createCampaign(req.body, {
      storeId: req.user!.storeId,
      createdByAdmin: false,
    });
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '캠페인 생성 중 오류가 발생했습니다.');
  }
});

// GET /api/place-booster/campaigns - 내 캠페인 목록
router.get('/campaigns', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const campaigns = await prisma.placeBoosterCampaign.findMany({
      where: { storeId: req.user!.storeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { batches: { select: { status: true, sentCount: true } } },
    });
    res.json(campaigns);
  } catch (error) {
    handleError(res, error, '캠페인 목록 조회 중 오류가 발생했습니다.');
  }
});

// GET /api/place-booster/campaigns/:id - 캠페인 상세(리포트)
router.get('/campaigns/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const report = await svc.getReport(req.params.id);
    res.json(report);
  } catch (error) {
    handleError(res, error, '캠페인 조회 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns/:id/pay/credit - 크레딧 결제
router.post('/campaigns/:id/pay/credit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const campaign = await svc.payWithCredit(req.params.id);
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '결제 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns/:id/pay/card/start - 카드 결제 개시(orderId 발급)
router.post('/campaigns/:id/pay/card/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const result = await svc.startCardPayment(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, '카드 결제 준비 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns/:id/pay/card/confirm - 카드 결제 승인
router.post('/campaigns/:id/pay/card/confirm', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const { paymentKey, orderId, amount } = req.body;
    const campaign = await svc.confirmCardPayment({
      campaignId: req.params.id,
      paymentKey,
      orderId,
      amount,
    });
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '카드 결제 승인 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns/:id/pay/bank-transfer - 계좌이체 요청(승인 대기)
router.post('/campaigns/:id/pay/bank-transfer', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const campaign = await svc.requestBankTransfer(req.params.id);
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '계좌이체 요청 중 오류가 발생했습니다.');
  }
});

// PATCH /api/place-booster/batches/:id/results - 회차 결과 입력(쿠폰사용/평균객단)
router.patch('/batches/:id/results', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const batch = await prisma.placeBoosterBatch.findUnique({
      where: { id: req.params.id },
      include: { campaign: { select: { storeId: true, deletedAt: true } } },
    });
    if (!batch || batch.campaign.deletedAt || batch.campaign.storeId !== req.user!.storeId) {
      throw new svc.BoosterError('회차를 찾을 수 없습니다.', 404);
    }
    const updated = await svc.setBatchResults(req.params.id, {
      couponUsedCount: req.body.couponUsedCount,
      avgTicket: req.body.avgTicket,
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, '결과 입력 중 오류가 발생했습니다.');
  }
});

// POST /api/place-booster/campaigns/:id/test-send - 내 번호로 테스트 알림톡 1건 (풀/회차/결제 미경유)
router.post('/campaigns/:id/test-send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const campaign = await loadOwnedCampaign(req.params.id, req.user!.storeId);
    const phone = (req.body.phone || '').toString().trim();
    if (!phone) throw new svc.BoosterError('테스트로 받을 휴대폰 번호를 입력해주세요.');
    const al = svc.buildBoosterAlimtalk(campaign, 1);
    const result = await sendAligoAlimtalk({
      phone,
      tplCode: al.tplCode,
      subject: al.subject,
      message: al.message,
      buttonName: al.buttonName,
      buttonUrl: al.buttonUrl,
    });
    if (!result.success) throw new svc.BoosterError(result.error || '테스트 발송에 실패했습니다.', 502);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, '테스트 발송 중 오류가 발생했습니다.');
  }
});

// 캠페인 취소(cancel)는 사장님 권한에서 제거됨 — 운영자(어드민) 라우트에서만 제공.

export default router;
