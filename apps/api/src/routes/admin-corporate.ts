import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { couponCodeUpload } from './admin-uploads.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/corporate-ads - 전체 쿠폰 리스트 조회
router.get('/corporate-ads', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const corporateAds = await prisma.corporateAd.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(corporateAds);
  } catch (error) {
    console.error('Corporate ads list error:', error);
    res.status(500).json({ error: '쿠폰 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/corporate-ads - 새 쿠폰 추가
router.post('/corporate-ads', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const {
      brandName = '',
      imageUrl = '',
      displayOrder,
      templateId = 'KA01TP250930075547299ikOWJ6bArTY',
      couponName = '',
      couponContent = '',
      couponAmount = '',
      amountValue = 0,
      expiryDate = '',
      registrationMethod = '',
      landingLink = '',
      couponLink = '',
      templateVariables,
      couponCodeVariable = '',
      enabled = true,
    } = req.body;

    // displayOrder 미지정 시 마지막 순서로
    let order = displayOrder;
    if (typeof order !== 'number') {
      const last = await prisma.corporateAd.findFirst({
        orderBy: { displayOrder: 'desc' },
      });
      order = last ? last.displayOrder + 1 : 0;
    }

    const created = await prisma.corporateAd.create({
      data: {
        brandName,
        imageUrl,
        displayOrder: order,
        templateId,
        couponName,
        couponContent,
        couponAmount,
        amountValue,
        expiryDate,
        registrationMethod,
        landingLink,
        couponLink,
        templateVariables: templateVariables ?? undefined,
        enabled,
      },
    });

    res.json(created);
  } catch (error) {
    console.error('Corporate ad create error:', error);
    res.status(500).json({ error: '쿠폰 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/corporate-ads/reorder - 표시 순서 일괄 변경
// 주의: 반드시 PUT /:id 라우트보다 먼저 등록되어야 함
router.put('/corporate-ads/reorder', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { orders } = req.body as { orders: { id: string; displayOrder: number }[] };
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders 배열이 필요합니다.' });
    }

    await prisma.$transaction(
      orders.map((o) =>
        prisma.corporateAd.update({
          where: { id: o.id },
          data: { displayOrder: o.displayOrder },
        }),
      ),
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Corporate ad reorder error:', error);
    res.status(500).json({ error: '순서 변경 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/corporate-ads/:id - 쿠폰 수정
router.put('/corporate-ads/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      brandName,
      imageUrl,
      displayOrder,
      templateId,
      couponName,
      couponContent,
      couponAmount,
      amountValue,
      expiryDate,
      registrationMethod,
      landingLink,
      couponLink,
      templateVariables,
      couponCodeVariable,
      enabled,
    } = req.body;

    const updated = await prisma.corporateAd.update({
      where: { id },
      data: {
        ...(brandName !== undefined && { brandName }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(templateId !== undefined && { templateId }),
        ...(couponName !== undefined && { couponName }),
        ...(couponContent !== undefined && { couponContent }),
        ...(couponAmount !== undefined && { couponAmount }),
        ...(amountValue !== undefined && { amountValue }),
        ...(expiryDate !== undefined && { expiryDate }),
        ...(registrationMethod !== undefined && { registrationMethod }),
        ...(landingLink !== undefined && { landingLink }),
        ...(couponLink !== undefined && { couponLink }),
        ...(templateVariables !== undefined && { templateVariables }),
        ...(couponCodeVariable !== undefined && { couponCodeVariable }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Corporate ad update error:', error);
    res.status(500).json({ error: '쿠폰 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/corporate-ads/:id - 쿠폰 삭제
router.delete('/corporate-ads/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.corporateAd.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Corporate ad delete error:', error);
    res.status(500).json({ error: '쿠폰 삭제 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 쿠폰 코드 풀 (난수 코드)
// ============================================

// multer: 텍스트 파일 업로드 (메모리 스토리지, 30MB 제한 ≈ 50만 개 + 여유)
// POST /api/admin/corporate-ads/:id/codes/upload - 코드 대량 업로드
router.post(
  '/corporate-ads/:id/codes/upload',
  adminAuthMiddleware,
  couponCodeUpload.single('file'),
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      const corporateAd = await prisma.corporateAd.findUnique({ where: { id } });
      if (!corporateAd) return res.status(404).json({ error: '쿠폰을 찾을 수 없습니다.' });

      if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

      const text = req.file.buffer.toString('utf-8');
      const codes = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (codes.length === 0) {
        return res.status(400).json({ error: '유효한 코드가 없습니다.' });
      }

      // 중복 제거 (파일 내부 중복)
      const uniqueCodes = Array.from(new Set(codes));

      const CHUNK = 10000;
      let totalInserted = 0;

      for (let i = 0; i < uniqueCodes.length; i += CHUNK) {
        const batch = uniqueCodes.slice(i, i + CHUNK);
        const result = await prisma.couponCode.createMany({
          data: batch.map((code) => ({ corporateAdId: id, code })),
          skipDuplicates: true, // DB 이미 존재하는 코드 스킵
        });
        totalInserted += result.count;
      }

      res.json({
        success: true,
        receivedLines: codes.length,
        uniqueInFile: uniqueCodes.length,
        inserted: totalInserted,
        skipped: uniqueCodes.length - totalInserted,
      });
    } catch (error: any) {
      console.error('Corporate ad codes upload error:', error);
      res.status(500).json({ error: error?.message || '코드 업로드 중 오류가 발생했습니다.' });
    }
  },
);

// GET /api/admin/corporate-ads/:id/codes/stats - 통계
router.get(
  '/corporate-ads/:id/codes/stats',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [total, used] = await Promise.all([
        prisma.couponCode.count({ where: { corporateAdId: id } }),
        prisma.couponCode.count({ where: { corporateAdId: id, usedAt: { not: null } } }),
      ]);
      res.json({ total, used, available: total - used });
    } catch (error) {
      console.error('Corporate ad codes stats error:', error);
      res.status(500).json({ error: '코드 통계 조회 중 오류가 발생했습니다.' });
    }
  },
);

// GET /api/admin/corporate-ads/:id/codes - 코드 리스트 (페이지네이션 + 필터)
router.get(
  '/corporate-ads/:id/codes',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const page = Math.max(1, parseInt((req.query.page as string) || '1') || 1);
      const limit = Math.min(500, parseInt((req.query.limit as string) || '100') || 100);
      const filter = (req.query.filter as string) || 'all';

      const where: any = { corporateAdId: id };
      if (filter === 'used') where.usedAt = { not: null };
      else if (filter === 'available') where.usedAt = null;

      const [codes, total] = await Promise.all([
        prisma.couponCode.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            code: true,
            usedAt: true,
            usedByCustomerId: true,
            createdAt: true,
          },
        }),
        prisma.couponCode.count({ where }),
      ]);

      res.json({ codes, total, page, limit });
    } catch (error) {
      console.error('Corporate ad codes list error:', error);
      res.status(500).json({ error: '코드 목록 조회 중 오류가 발생했습니다.' });
    }
  },
);

// DELETE /api/admin/corporate-ads/:id/codes/:codeId - 개별 코드 삭제 (미사용만 가능)
router.delete(
  '/corporate-ads/:id/codes/:codeId',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id, codeId } = req.params;
      const code = await prisma.couponCode.findFirst({
        where: { id: codeId, corporateAdId: id },
      });
      if (!code) return res.status(404).json({ error: '코드를 찾을 수 없습니다.' });
      if (code.usedAt) {
        return res.status(400).json({ error: '이미 사용된 코드는 삭제할 수 없습니다.' });
      }
      await prisma.couponCode.delete({ where: { id: codeId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Corporate ad code delete error:', error);
      res.status(500).json({ error: '코드 삭제 중 오류가 발생했습니다.' });
    }
  },
);

// POST /api/admin/corporate-ads/:id/codes/shuffle - 미사용 코드 발급 순서 무작위로 섞기
router.post(
  '/corporate-ads/:id/codes/shuffle',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      // PostgreSQL: random() 함수로 미사용 코드들의 createdAt을 무작위 시간으로 재할당
      // 50만 개도 단일 쿼리로 빠르게 처리됨
      const result = await prisma.$executeRaw`
        UPDATE "coupon_codes"
        SET "createdAt" = NOW() - (random() * interval '365 days')
        WHERE "corporateAdId" = ${id} AND "usedAt" IS NULL
      `;

      res.json({ success: true, shuffled: Number(result) });
    } catch (error) {
      console.error('Corporate ad codes shuffle error:', error);
      res.status(500).json({ error: '코드 섞기 중 오류가 발생했습니다.' });
    }
  },
);

// DELETE /api/admin/corporate-ads/:id/codes - 미사용 코드 전체 삭제
router.delete(
  '/corporate-ads/:id/codes',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await prisma.couponCode.deleteMany({
        where: { corporateAdId: id, usedAt: null },
      });
      res.json({ success: true, deleted: result.count });
    } catch (error) {
      console.error('Corporate ad codes delete-all error:', error);
      res.status(500).json({ error: '코드 일괄 삭제 중 오류가 발생했습니다.' });
    }
  },
);

// 호환용 (deprecated): 기존 단일 쿠폰 엔드포인트 - 첫 번째 enabled 쿠폰 반환
router.get('/corporate-ad', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const corporateAd = await prisma.corporateAd.findFirst({
      where: { enabled: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (!corporateAd) {
      return res.json({
        templateId: 'KA01TP250930075547299ikOWJ6bArTY',
        brandName: '',
        imageUrl: '',
        couponName: '',
        couponContent: '',
        couponAmount: '',
        amountValue: 0,
        expiryDate: '',
        registrationMethod: '',
        landingLink: '',
        couponLink: '',
        enabled: true,
      });
    }
    res.json(corporateAd);
  } catch (error) {
    console.error('Corporate ad get error:', error);
    res.status(500).json({ error: '기업광고 설정 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 기업광고 알림톡 통계
// ============================================

// ============================================
// 매장 주소 일괄 업데이트 + 고객 지역 백필
// ============================================

// GET /api/admin/corporate-ad-stats - 기업광고 알림톡 발송 및 멤버십 가입 통계
router.get('/corporate-ad-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = days === 'all' ? 365 : parseInt(days as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // 기업광고 알림톡 발송 내역 (CORPORATE_AD 타입)
    const alimTalkMessages = await prisma.alimTalkOutbox.findMany({
      where: {
        messageType: 'CORPORATE_AD',
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 멤버십 가입 고객 (enrollmentMode가 MEMBERSHIP인 매장의 방문만 집계)
    const membershipVisits = await prisma.visitOrOrder.findMany({
      where: {
        visitedAt: { gte: startDate },
        store: {
          enrollmentMode: 'MEMBERSHIP',
        },
      },
      select: {
        visitedAt: true,
        customerId: true,
      },
      orderBy: { visitedAt: 'asc' },
    });

    // 일별 집계
    const alimTalkByDate = new Map<string, { sent: number; failed: number; total: number }>();
    const membershipByDate = new Map<string, Set<string>>();

    alimTalkMessages.forEach((msg) => {
      const dateStr = msg.createdAt.toISOString().split('T')[0];
      const entry = alimTalkByDate.get(dateStr) || { sent: 0, failed: 0, total: 0 };
      entry.total++;
      if (msg.status === 'SENT') entry.sent++;
      else if (msg.status === 'FAILED') entry.failed++;
      alimTalkByDate.set(dateStr, entry);
    });

    membershipVisits.forEach((visit) => {
      const dateStr = visit.visitedAt.toISOString().split('T')[0];
      const customers = membershipByDate.get(dateStr) || new Set();
      customers.add(visit.customerId);
      membershipByDate.set(dateStr, customers);
    });

    // 기간 내 모든 날짜 생성
    const dailyData: {
      date: string;
      alimTalkSent: number;
      alimTalkFailed: number;
      alimTalkTotal: number;
      membershipCount: number;
    }[] = [];

    const currentDate = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const alimTalk = alimTalkByDate.get(dateStr) || { sent: 0, failed: 0, total: 0 };
      const membershipCustomers = membershipByDate.get(dateStr);

      dailyData.push({
        date: dateStr,
        alimTalkSent: alimTalk.sent,
        alimTalkFailed: alimTalk.failed,
        alimTalkTotal: alimTalk.total,
        membershipCount: membershipCustomers ? membershipCustomers.size : 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalAlimTalk = alimTalkMessages.length;
    const totalSent = alimTalkMessages.filter((m) => m.status === 'SENT').length;
    const totalFailed = alimTalkMessages.filter((m) => m.status === 'FAILED').length;
    const uniqueMembershipCustomers = new Set(membershipVisits.map((v) => v.customerId));

    res.json({
      trend: dailyData,
      summary: {
        totalAlimTalk,
        totalSent,
        totalFailed,
        totalMembership: uniqueMembershipCustomers.size,
      },
    });
  } catch (error) {
    console.error('Corporate ad stats error:', error);
    res.status(500).json({ error: '기업광고 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/corporate-ad-analytics - 기업광고 쿠폰 성과 분석
// AlimTalkOutbox (status=SENT) 기준으로 모든 브랜드 공통 추적
// - 난수 코드 없는 브랜드(예: 세븐일레븐)도 알림톡 발송 기록으로 집계
// - idempotencyKey 파싱: "corporate_ad:{storeId}:{customerId}:{couponId}"
router.get('/corporate-ad-analytics', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const isAll = days === 'all';
    const daysNum = isAll ? 365 : parseInt(days as string) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // ─── 1. 기간 내 기업광고 알림톡 발송 내역 ───
    // SENT/FAILED 모두 조회 (실패율 계산용), 발행량은 SENT만 카운트
    const alimTalkRows = await prisma.alimTalkOutbox.findMany({
      where: {
        messageType: 'CORPORATE_AD',
        createdAt: { gte: startDate },
      },
      select: {
        idempotencyKey: true,
        status: true,
        sentAt: true,
        createdAt: true,
        customerId: true,
      },
    });

    // idempotencyKey에서 couponId 추출
    const extractCouponId = (key: string | null | undefined): string | null => {
      if (!key) return null;
      const parts = key.split(':');
      if (parts.length !== 4 || parts[0] !== 'corporate_ad') return null;
      return parts[3];
    };

    const sentRows = alimTalkRows.filter((r) => r.status === 'SENT');

    // ─── 2. 고객 인구통계 정보 일괄 조회 (SENT만) ───
    const customerIds = Array.from(
      new Set(sentRows.map((r) => r.customerId).filter((id): id is string => !!id)),
    );
    const customers =
      customerIds.length > 0
        ? await prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: {
              id: true,
              gender: true,
              ageGroup: true,
              regionSido: true,
              regionSigungu: true,
            },
          })
        : [];
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    // ─── 3. 브랜드 정보 + 잔여 코드 수 ───
    const corporateAds = await prisma.corporateAd.findMany({
      select: {
        id: true,
        brandName: true,
        imageUrl: true,
        couponCodeVariable: true,
      },
    });

    const remainingByBrand = await prisma.couponCode.groupBy({
      by: ['corporateAdId'],
      where: { usedAt: null },
      _count: { _all: true },
    });
    const remainingMap = new Map(remainingByBrand.map((r) => [r.corporateAdId, r._count._all]));

    // ─── 4. 집계 ───
    const issuedByDate = new Map<string, number>();
    const issuedByBrand = new Map<string, number>();
    const issuedByHour = new Map<number, number>();
    const genderCount = new Map<string, number>();
    const ageGroupCount = new Map<string, number>();
    const regionCount = new Map<string, number>();

    // 브랜드별 일자별 집계 (스택형 차트용): Map<brandId, Map<date, count>>
    const issuedByBrandDate = new Map<string, Map<string, number>>();

    for (const row of sentRows) {
      // 시간 기준: sentAt 우선, 없으면 createdAt
      const timestamp = row.sentAt ?? row.createdAt;
      const dateStr = timestamp.toISOString().split('T')[0];
      const hour = timestamp.getHours();

      issuedByDate.set(dateStr, (issuedByDate.get(dateStr) || 0) + 1);
      issuedByHour.set(hour, (issuedByHour.get(hour) || 0) + 1);

      const couponId = extractCouponId(row.idempotencyKey);
      if (couponId) {
        issuedByBrand.set(couponId, (issuedByBrand.get(couponId) || 0) + 1);

        let brandDates = issuedByBrandDate.get(couponId);
        if (!brandDates) {
          brandDates = new Map();
          issuedByBrandDate.set(couponId, brandDates);
        }
        brandDates.set(dateStr, (brandDates.get(dateStr) || 0) + 1);
      }

      // 인구통계
      if (row.customerId) {
        const cust = customerMap.get(row.customerId);
        if (cust) {
          const g = cust.gender || 'UNKNOWN';
          genderCount.set(g, (genderCount.get(g) || 0) + 1);
          const a = cust.ageGroup || 'UNKNOWN';
          ageGroupCount.set(a, (ageGroupCount.get(a) || 0) + 1);
          const region =
            cust.regionSido && cust.regionSigungu
              ? `${cust.regionSido} ${cust.regionSigungu}`
              : cust.regionSido || cust.regionSigungu || 'UNKNOWN';
          regionCount.set(region, (regionCount.get(region) || 0) + 1);
        } else {
          genderCount.set('UNKNOWN', (genderCount.get('UNKNOWN') || 0) + 1);
          ageGroupCount.set('UNKNOWN', (ageGroupCount.get('UNKNOWN') || 0) + 1);
          regionCount.set('UNKNOWN', (regionCount.get('UNKNOWN') || 0) + 1);
        }
      } else {
        genderCount.set('UNKNOWN', (genderCount.get('UNKNOWN') || 0) + 1);
        ageGroupCount.set('UNKNOWN', (ageGroupCount.get('UNKNOWN') || 0) + 1);
        regionCount.set('UNKNOWN', (regionCount.get('UNKNOWN') || 0) + 1);
      }
    }

    // ─── 5. 일자별 트렌드 (전체 + 브랜드별) ───
    const dateList: string[] = [];
    const cursor = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    while (cursor <= today) {
      dateList.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    const dailyTrend = dateList.map((date) => ({
      date,
      issued: issuedByDate.get(date) || 0,
    }));

    // 브랜드별 일자별 시리즈 (발행량 > 0인 브랜드만 포함)
    const dailyTrendByBrand = corporateAds
      .filter((b) => (issuedByBrand.get(b.id) || 0) > 0)
      .map((b) => ({
        brandId: b.id,
        brandName: b.brandName,
        imageUrl: b.imageUrl,
        series: dateList.map((date) => issuedByBrandDate.get(b.id)?.get(date) || 0),
      }));

    // ─── 6. 브랜드별 (발행량 + 잔여, 난수코드 사용 여부) ───
    const byBrand = corporateAds
      .map((b) => ({
        brandId: b.id,
        brandName: b.brandName,
        imageUrl: b.imageUrl,
        issued: issuedByBrand.get(b.id) || 0,
        remainingCodes: remainingMap.get(b.id) || 0,
        usesCodePool: !!(b.couponCodeVariable && b.couponCodeVariable.trim()),
      }))
      .sort((a, b) => b.issued - a.issued);

    // ─── 7. 시간대별 ───
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: issuedByHour.get(h) || 0,
    }));

    // ─── 8. 인구통계 ───
    const byGender = Array.from(genderCount.entries())
      .map(([gender, count]) => ({ gender, count }))
      .sort((a, b) => b.count - a.count);
    const byAgeGroup = Array.from(ageGroupCount.entries())
      .map(([ageGroup, count]) => ({ ageGroup, count }))
      .sort((a, b) => b.count - a.count);
    const byRegion = Array.from(regionCount.entries())
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ─── 9. 요약 ───
    const totalIssued = sentRows.length;
    const totalFailed = alimTalkRows.filter((r) => r.status === 'FAILED').length;
    const successRate =
      totalIssued + totalFailed > 0
        ? Math.round((totalIssued / (totalIssued + totalFailed)) * 1000) / 10
        : 0;

    res.json({
      summary: {
        totalIssued,
        totalFailed,
        successRate,
      },
      dailyTrend,
      dailyTrendByBrand,
      byBrand,
      byHour,
      demographics: {
        byGender,
        byAgeGroup,
        byRegion,
      },
    });
  } catch (error) {
    console.error('Corporate ad analytics error:', error);
    res.status(500).json({ error: '기업광고 분석 데이터 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
