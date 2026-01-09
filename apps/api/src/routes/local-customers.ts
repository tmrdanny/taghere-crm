import { Router } from 'express';
import { SolapiMessageService } from 'solapi';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 건당 비용 (외부 고객 SMS)
const EXTERNAL_SMS_COST = 250;

// 월요일 기준 주차 시작일 계산
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/local-customers/regions - 지역 목록 조회 (ExternalCustomer 기반)
router.get('/regions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sido } = req.query;

    if (!sido) {
      // 시/도 목록 조회 (ExternalCustomer에 있는 지역만)
      const sidos = await prisma.externalCustomer.findMany({
        select: { regionSido: true },
        distinct: ['regionSido'],
        orderBy: { regionSido: 'asc' },
      });

      return res.json({
        sidos: sidos.map((r) => r.regionSido),
        sigungus: [],
      });
    }

    // 특정 시/도의 시/군/구 목록 조회
    const sigungus = await prisma.externalCustomer.findMany({
      where: { regionSido: sido as string },
      select: { regionSigungu: true },
      distinct: ['regionSigungu'],
      orderBy: { regionSigungu: 'asc' },
    });

    return res.json({
      sidos: [],
      sigungus: sigungus.map((r) => r.regionSigungu),
    });
  } catch (error) {
    console.error('Regions fetch error:', error);
    res.status(500).json({ error: '지역 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/count - 조건에 맞는 고객 수 조회
router.get('/count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ageGroups, gender, regionSido, regionSigungu } = req.query;

    if (!regionSido || !regionSigungu) {
      return res.status(400).json({ error: '지역을 선택해주세요.' });
    }

    // 필터 조건 구성
    const where: any = {
      regionSido: regionSido as string,
      regionSigungu: regionSigungu as string,
      consentMarketing: true,
    };

    // 연령대 필터
    if (ageGroups) {
      const ageGroupList = (ageGroups as string).split(',');
      where.ageGroup = { in: ageGroupList };
    }

    // 성별 필터
    if (gender && gender !== 'all') {
      where.gender = gender as string;
    }

    // 전체 고객 수
    const totalCount = await prisma.externalCustomer.count({ where });

    // 이번 주 슬롯 여유 있는 고객 수 (slotUsed < 2)
    const weekStart = getWeekStart(new Date());

    // 슬롯이 2 이상인 고객 ID 조회
    const usedSlots = await prisma.externalCustomerWeeklySlot.findMany({
      where: {
        weekStart,
        slotUsed: { gte: 2 },
      },
      select: { externalCustomerId: true },
    });

    const usedCustomerIds = usedSlots.map((s) => s.externalCustomerId);

    // 슬롯 여유 있는 고객 수
    const availableCount = await prisma.externalCustomer.count({
      where: {
        ...where,
        id: { notIn: usedCustomerIds },
      },
    });

    res.json({
      totalCount,
      availableCount,
    });
  } catch (error) {
    console.error('Count fetch error:', error);
    res.status(500).json({ error: '고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/estimate - 비용 예상
router.get('/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { sendCount } = req.query;

    if (!sendCount) {
      return res.status(400).json({ error: '발송 수량을 입력해주세요.' });
    }

    const count = parseInt(sendCount as string);
    const totalCost = count * EXTERNAL_SMS_COST;

    // 지갑 잔액 조회
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    const walletBalance = wallet?.balance || 0;
    const canSend = walletBalance >= totalCost;

    res.json({
      sendCount: count,
      costPerMessage: EXTERNAL_SMS_COST,
      totalCost,
      walletBalance,
      canSend,
    });
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/send - 메시지 발송
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { content, ageGroups, gender, regionSido, regionSigungu, sendCount } = req.body;

    // 유효성 검사
    if (!content || !regionSido || !regionSigungu || !sendCount) {
      return res.status(400).json({ error: '필수 항목을 모두 입력해주세요.' });
    }

    if (sendCount <= 0) {
      return res.status(400).json({ error: '발송 수량은 1 이상이어야 합니다.' });
    }

    // 지갑 잔액 확인
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    const totalCost = sendCount * EXTERNAL_SMS_COST;
    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      });
    }

    // 필터 조건 구성
    const where: any = {
      regionSido,
      regionSigungu,
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      where.ageGroup = { in: ageGroups };
    }

    if (gender && gender !== 'all') {
      where.gender = gender;
    }

    // 이번 주 슬롯 여유 있는 고객만 조회
    const weekStart = getWeekStart(new Date());

    const usedSlots = await prisma.externalCustomerWeeklySlot.findMany({
      where: {
        weekStart,
        slotUsed: { gte: 2 },
      },
      select: { externalCustomerId: true },
    });

    const usedCustomerIds = usedSlots.map((s) => s.externalCustomerId);

    // 가용 고객 수 확인
    const availableCount = await prisma.externalCustomer.count({
      where: {
        ...where,
        id: { notIn: usedCustomerIds },
      },
    });

    if (sendCount > availableCount) {
      return res.status(400).json({
        error: `발송 가능한 고객이 ${availableCount}명입니다.`,
        availableCount,
      });
    }

    // 랜덤으로 고객 선택
    const customers = await prisma.externalCustomer.findMany({
      where: {
        ...where,
        id: { notIn: usedCustomerIds },
      },
      take: sendCount,
      orderBy: {
        // 랜덤 정렬 (PostgreSQL)
        id: 'asc', // 실제로는 랜덤 선택이 필요하지만, 우선 순차 선택
      },
    });

    // 매장 정보 조회 (발송자명용)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    // 캠페인 생성
    const campaign = await prisma.externalSmsCampaign.create({
      data: {
        storeId,
        title: `우리동네 손님 찾기 - ${new Date().toLocaleDateString('ko-KR')}`,
        content,
        filterAgeGroups: JSON.stringify(ageGroups || []),
        filterGender: gender || null,
        filterRegionSido: regionSido,
        filterRegionSigungu: regionSigungu,
        targetCount: sendCount,
        costPerMessage: EXTERNAL_SMS_COST,
        status: 'SENDING',
      },
    });

    // SOLAPI 설정 확인
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'SMS 발송 설정이 되어있지 않습니다.' });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);

    // 개별 메시지 생성 및 발송
    let pendingCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      try {
        // 전화번호 정규화 (하이픈 제거)
        const normalizedPhone = customer.phone.replace(/-/g, '');

        // SOLAPI 발송
        const result = await messageService.send({
          to: normalizedPhone,
          from: '07041380263', // 발신번호 고정
          text: content,
        });

        const groupInfo = result.groupInfo;
        const groupId = groupInfo?.groupId;

        // 메시지 레코드 생성 (PENDING 상태)
        await prisma.externalSmsMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            externalCustomerId: customer.id,
            content,
            status: 'PENDING',
            solapiGroupId: groupId,
            cost: EXTERNAL_SMS_COST,
          },
        });

        pendingCount++;
      } catch (err: any) {
        console.error(`[ExternalSMS] Send error for ${customer.phone}:`, err.message);

        await prisma.externalSmsMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            externalCustomerId: customer.id,
            content,
            status: 'FAILED',
            cost: 0,
            failReason: err.message || 'Unknown error',
          },
        });

        failedCount++;
      }
    }

    // 캠페인 상태 업데이트
    await prisma.externalSmsCampaign.update({
      where: { id: campaign.id },
      data: {
        failedCount,
        status: pendingCount > 0 ? 'SENDING' : 'COMPLETED',
      },
    });

    res.json({
      success: true,
      campaignId: campaign.id,
      pendingCount,
      failedCount,
      totalCost: pendingCount * EXTERNAL_SMS_COST,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
    });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ error: '메시지 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/test - 테스트 발송
router.post('/test', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { content, phone } = req.body;

    if (!content || !phone) {
      return res.status(400).json({ error: '메시지 내용과 전화번호를 입력해주세요.' });
    }

    // SOLAPI 설정 확인
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'SMS 발송 설정이 되어있지 않습니다.' });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);

    // 전화번호 정규화
    const normalizedPhone = phone.replace(/-/g, '');

    // 테스트 발송
    const result = await messageService.send({
      to: normalizedPhone,
      from: '07041380263',
      text: content,
    });

    const groupInfo = result.groupInfo;

    res.json({
      success: true,
      groupId: groupInfo?.groupId,
      message: '테스트 발송이 완료되었습니다.',
    });
  } catch (error: any) {
    console.error('Test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/campaigns - 캠페인 목록 조회
router.get('/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [campaigns, total] = await Promise.all([
      prisma.externalSmsCampaign.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.externalSmsCampaign.count({ where: { storeId } }),
    ]);

    res.json({
      campaigns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Campaigns fetch error:', error);
    res.status(500).json({ error: '캠페인 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
