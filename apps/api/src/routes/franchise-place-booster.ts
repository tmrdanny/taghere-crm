/**
 * 네이버 플레이스 부스터 - 프랜차이즈 라우트
 * franchiseAuthMiddleware. 하위 매장(subStoreId)을 선택해 캠페인을 만들고,
 * 크레딧 결제는 프랜차이즈 지갑에서 차감한다. (기능은 사장님 라우트와 동일)
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
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

// 선택한 하위 매장이 이 프랜차이즈 소속인지 확인
async function assertSubStore(subStoreId: string | undefined, franchiseId: string) {
  if (!subStoreId) throw new svc.BoosterError('하위 매장을 선택해주세요.');
  const store = await prisma.store.findFirst({
    where: { id: subStoreId, franchiseId },
    select: { id: true, phone: true, ownerName: true },
  });
  if (!store) throw new svc.BoosterError('선택한 매장을 찾을 수 없습니다.', 404);
  return store;
}

// 캠페인이 이 프랜차이즈의 하위 매장 소유인지 확인
async function loadFranchiseCampaign(id: string, franchiseId: string) {
  const campaign = await prisma.placeBoosterCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.deletedAt || !campaign.storeId) {
    throw new svc.BoosterError('캠페인을 찾을 수 없습니다.', 404);
  }
  const store = await prisma.store.findFirst({
    where: { id: campaign.storeId, franchiseId },
    select: { id: true },
  });
  if (!store) throw new svc.BoosterError('캠페인을 찾을 수 없습니다.', 404);
  return campaign;
}

// POST /verify-place - 네이버 플레이스 URL 검증 (매장 무관)
router.post('/verify-place', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const info = await lookupNaverPlace(req.body.url);
    res.json(info);
  } catch (error) {
    handleError(res, error, '매장 정보 확인 중 오류가 발생했습니다.');
  }
});

// GET /store-info?subStoreId= - 선택 매장 번호 프리필용
router.get('/store-info', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const store = await assertSubStore(req.query.subStoreId as string, req.franchiseUser!.franchiseId);
    res.json({ phone: toMobileOrEmpty(store.phone), ownerName: store.ownerName || '' });
  } catch (error) {
    handleError(res, error, '매장 정보 조회 중 오류가 발생했습니다.');
  }
});

// POST /test-send-preview - 생성 전 테스트 알림톡 1건 (매장 무관)
router.post('/test-send-preview', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
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

// POST /campaigns - 캠페인 생성 (하위 매장 선택)
router.post('/campaigns', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const { subStoreId, ...input } = req.body;
    const store = await assertSubStore(subStoreId, req.franchiseUser!.franchiseId);
    const campaign = await svc.createCampaign(input, { storeId: store.id, createdByAdmin: false });
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '캠페인 생성 중 오류가 발생했습니다.');
  }
});

// PATCH /campaigns/:id - 캠페인 수정 (결제 전 DRAFT만)
router.patch('/campaigns/:id', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const campaign = await loadFranchiseCampaign(req.params.id, req.franchiseUser!.franchiseId);
    const { subStoreId, ...input } = req.body;
    const updated = await svc.updateCampaign(req.params.id, input, {
      storeId: campaign.storeId,
      createdByAdmin: false,
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, '캠페인 수정 중 오류가 발생했습니다.');
  }
});

// GET /campaigns - 프랜차이즈 소속 전체 캠페인 목록
router.get('/campaigns', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: { franchiseId: req.franchiseUser!.franchiseId },
      select: { id: true, name: true },
    });
    const storeIds = stores.map((s) => s.id);
    const nameById = new Map(stores.map((s) => [s.id, s.name]));

    const campaigns = await prisma.placeBoosterCampaign.findMany({
      where: { storeId: { in: storeIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { batches: { select: { status: true, sentCount: true } } },
    });
    res.json(campaigns.map((c) => ({ ...c, storeName: c.storeId ? nameById.get(c.storeId) || null : null })));
  } catch (error) {
    handleError(res, error, '캠페인 목록 조회 중 오류가 발생했습니다.');
  }
});

// GET /campaigns/:id - 캠페인 상세(리포트)
router.get('/campaigns/:id', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    await loadFranchiseCampaign(req.params.id, req.franchiseUser!.franchiseId);
    const report = await svc.getReport(req.params.id);
    res.json(report);
  } catch (error) {
    handleError(res, error, '캠페인 조회 중 오류가 발생했습니다.');
  }
});

// POST /campaigns/:id/pay/credit - 프랜차이즈 지갑 차감
router.post('/campaigns/:id/pay/credit', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    await loadFranchiseCampaign(req.params.id, req.franchiseUser!.franchiseId);
    const campaign = await svc.payWithFranchiseCredit(req.params.id, req.franchiseUser!.franchiseId);
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '결제 중 오류가 발생했습니다.');
  }
});

// POST /campaigns/:id/pay/bank-transfer - 계좌이체 요청(승인 대기)
router.post('/campaigns/:id/pay/bank-transfer', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    await loadFranchiseCampaign(req.params.id, req.franchiseUser!.franchiseId);
    const campaign = await svc.requestBankTransfer(req.params.id);
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '계좌이체 요청 중 오류가 발생했습니다.');
  }
});

// PATCH /batches/:id/results - 회차 결과 입력(쿠폰사용/평균객단)
router.patch('/batches/:id/results', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const batch = await prisma.placeBoosterBatch.findUnique({
      where: { id: req.params.id },
      include: { campaign: { select: { storeId: true, deletedAt: true } } },
    });
    if (!batch || batch.campaign.deletedAt || !batch.campaign.storeId) {
      throw new svc.BoosterError('회차를 찾을 수 없습니다.', 404);
    }
    const owned = await prisma.store.findFirst({
      where: { id: batch.campaign.storeId, franchiseId: req.franchiseUser!.franchiseId },
      select: { id: true },
    });
    if (!owned) throw new svc.BoosterError('회차를 찾을 수 없습니다.', 404);

    const updated = await svc.setBatchResults(req.params.id, {
      couponUsedCount: req.body.couponUsedCount,
      avgTicket: req.body.avgTicket,
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, '결과 입력 중 오류가 발생했습니다.');
  }
});

// POST /campaigns/:id/test-send - 테스트 알림톡 1건
router.post('/campaigns/:id/test-send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const campaign = await loadFranchiseCampaign(req.params.id, req.franchiseUser!.franchiseId);
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

export default router;
