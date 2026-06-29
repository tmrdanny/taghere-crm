/**
 * 네이버 플레이스 부스터 - 운영자(어드민) 라우트
 * 전 매장 캠페인 조회/대행 생성/계좌이체 승인/취소/삭제/리포트.
 * 모든 라우트 adminAuthMiddleware.
 */

import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware, ADMIN_USERNAME } from './admin-shared.js';
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

// GET /api/admin/place-booster/campaigns - 전 매장 캠페인 목록 (검색/필터/페이지네이션)
router.get('/place-booster/campaigns', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const pageSize = 20;

    let storeIdsBySearch: string[] | null = null;
    if (search) {
      const matched = await prisma.store.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { ownerName: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      storeIdsBySearch = matched.map((s) => s.id);
    }

    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { keyword: { contains: search, mode: 'insensitive' } },
        ...(storeIdsBySearch && storeIdsBySearch.length ? [{ storeId: { in: storeIdsBySearch } }] : []),
      ];
    }

    const [total, campaigns] = await Promise.all([
      prisma.placeBoosterCampaign.count({ where }),
      prisma.placeBoosterCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { batches: { select: { status: true, sentCount: true } } },
      }),
    ]);

    // 외부 캠페인은 storeId가 null → 매장 조회에서 제외
    const storeIds = [...new Set(campaigns.map((c) => c.storeId).filter((id): id is string => !!id))];
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, ownerName: true },
    });
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    const result = campaigns.map((c) => {
      const sentCount = c.batches.reduce((s, b) => s + b.sentCount, 0);
      const sentBatches = c.batches.filter((b) => b.status === 'SENT').length;
      return {
        ...c,
        store: c.storeId ? storeMap.get(c.storeId) || null : null,
        isExternal: !c.storeId, // 외부(무매장) 캠페인 여부
        sentCount,
        sentBatches,
        totalBatches: c.batches.length,
      };
    });

    res.json({ campaigns: result, total, page, pageSize });
  } catch (error) {
    handleError(res, error, '캠페인 목록 조회 중 오류가 발생했습니다.');
  }
});

// POST /api/admin/place-booster/verify-place - 네이버 플레이스 URL 검증 + 매장 정보 조회
router.post('/place-booster/verify-place', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const info = await lookupNaverPlace(req.body.url);
    res.json(info);
  } catch (error) {
    handleError(res, error, '매장 정보 확인 중 오류가 발생했습니다.');
  }
});

// GET /api/admin/place-booster/stores - 대행 생성용 매장 선택 목록
router.get('/place-booster/stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const stores = await prisma.store.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { ownerName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: { id: true, name: true, ownerName: true, address: true, phone: true },
      orderBy: { name: 'asc' },
      take: 50,
    });
    // 프리필용 사장님 번호 정규화(선행 0 복원, 유효 모바일만)
    res.json(stores.map((s) => ({ ...s, phone: toMobileOrEmpty(s.phone) })));
  } catch (error) {
    handleError(res, error, '매장 목록 조회 중 오류가 발생했습니다.');
  }
});

// GET /api/admin/place-booster/analytics - 전 매장 합산 성과
router.get('/place-booster/analytics', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const [totalCampaigns, activeCampaigns, pendingApproval, sentAgg, totalClicks] = await Promise.all([
      prisma.placeBoosterCampaign.count({ where: { deletedAt: null } }),
      prisma.placeBoosterCampaign.count({ where: { deletedAt: null, status: { in: ['SCHEDULED', 'RUNNING'] } } }),
      prisma.placeBoosterCampaign.count({ where: { deletedAt: null, paymentStatus: 'PENDING_APPROVAL' } }),
      prisma.placeBoosterBatch.aggregate({ _sum: { sentCount: true } }),
      prisma.placeBoosterClick.count(),
    ]);
    res.json({
      totalCampaigns,
      activeCampaigns,
      pendingApproval,
      totalSent: sentAgg._sum.sentCount || 0,
      totalClicks,
    });
  } catch (error) {
    handleError(res, error, '성과 조회 중 오류가 발생했습니다.');
  }
});

// GET /api/admin/place-booster/campaigns/:id - 캠페인 상세(리포트)
router.get('/place-booster/campaigns/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const report = await svc.getReport(req.params.id);
    // 외부 캠페인은 storeId가 null → 매장 조회 생략 (null이면 Prisma findUnique 에러)
    const store = report.campaign.storeId
      ? await prisma.store.findUnique({
          where: { id: report.campaign.storeId },
          select: { id: true, name: true, ownerName: true },
        })
      : null;
    res.json({ ...report, store, isExternal: !report.campaign.storeId });
  } catch (error) {
    handleError(res, error, '캠페인 조회 중 오류가 발생했습니다.');
  }
});

// POST /api/admin/place-booster/test-send-preview - 대행 생성 전, 입력값으로 테스트 알림톡 1건
router.post('/place-booster/test-send-preview', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
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

// POST /api/admin/place-booster/campaigns - 대행 생성 (가입 매장 storeId 또는 외부 campaignName)
router.post('/place-booster/campaigns', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId, campaignName, ...input } = req.body;
    if (!storeId && !campaignName?.trim()) {
      throw new svc.BoosterError('매장을 선택하거나 외부 캠페인명을 입력해주세요.');
    }
    const campaign = await svc.createCampaign(input, {
      storeId: storeId || null,
      campaignName,
      createdByAdmin: true,
    });
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '캠페인 생성 중 오류가 발생했습니다.');
  }
});

// POST /api/admin/place-booster/campaigns/:id/approve - 계좌이체 승인 → 활성화
router.post('/place-booster/campaigns/:id/approve', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    console.log(`[audit][place-booster] approve campaign=${req.params.id} by=${ADMIN_USERNAME}`);
    const campaign = await svc.approveBankTransfer(req.params.id);
    res.json(campaign);
  } catch (error) {
    handleError(res, error, '승인 중 오류가 발생했습니다.');
  }
});

// PATCH /api/admin/place-booster/batches/:id/results - 회차 결과 입력
router.patch('/place-booster/batches/:id/results', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const batch = await prisma.placeBoosterBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) throw new svc.BoosterError('회차를 찾을 수 없습니다.', 404);
    const updated = await svc.setBatchResults(req.params.id, {
      couponUsedCount: req.body.couponUsedCount,
      avgTicket: req.body.avgTicket,
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, '결과 입력 중 오류가 발생했습니다.');
  }
});

// POST /api/admin/place-booster/campaigns/:id/test-send - 지정 번호로 테스트 알림톡 1건
router.post('/place-booster/campaigns/:id/test-send', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const campaign = await prisma.placeBoosterCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign || campaign.deletedAt) throw new svc.BoosterError('캠페인을 찾을 수 없습니다.', 404);
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

// POST /api/admin/place-booster/campaigns/:id/cancel - 취소(중지)
router.post('/place-booster/campaigns/:id/cancel', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    console.log(`[audit][place-booster] cancel campaign=${req.params.id} by=${ADMIN_USERNAME}`);
    const summary = await svc.cancelCampaign(req.params.id);
    res.json({ success: true, ...summary });
  } catch (error) {
    handleError(res, error, '캠페인 취소 중 오류가 발생했습니다.');
  }
});

// POST /api/admin/place-booster/campaigns/:id/sync-failures - 알리고 발송 결과 수집 → 영구 차단 수신자 제외
router.post('/place-booster/campaigns/:id/sync-failures', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    console.log(`[audit][place-booster] sync-failures campaign=${req.params.id} by=${ADMIN_USERNAME}`);
    const summary = await svc.syncCampaignFailures(req.params.id);
    res.json({ success: true, ...summary });
  } catch (error) {
    handleError(res, error, '발송 결과 동기화 중 오류가 발생했습니다.');
  }
});

// DELETE /api/admin/place-booster/campaigns/:id - 소프트 삭제 (운영자 전용)
router.delete('/place-booster/campaigns/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    console.log(`[audit][place-booster] soft-delete campaign=${req.params.id} by=${ADMIN_USERNAME}`);
    await svc.softDeleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, '캠페인 삭제 중 오류가 발생했습니다.');
  }
});

export default router;
