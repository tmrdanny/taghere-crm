import { Router } from 'express';
import { SolapiMessageService } from 'solapi';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { SolapiService, BrandMessageButton } from '../services/solapi.js';

const router = Router();

// 건당 비용 (외부 고객 SMS)
const EXTERNAL_SMS_COST = 200;

// 카카오톡 브랜드 메시지 비용 (건당)
const EXTERNAL_KAKAO_TEXT_COST = 200;
const EXTERNAL_KAKAO_IMAGE_COST = 230;

// SOLAPI 서비스 인스턴스 (카카오톡용)
let solapiServiceInstance: SolapiService | null = null;
function getSolapiService(): SolapiService | null {
  if (solapiServiceInstance) return solapiServiceInstance;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  solapiServiceInstance = new SolapiService(apiKey, apiSecret);
  return solapiServiceInstance;
}

// 발송 가능 시간 체크 (08:00 ~ 20:50 KST) - 카카오톡용
function isSendableTime(): boolean {
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  const kstMinute = now.getUTCMinutes();

  if (kstHour < 8) return false;
  if (kstHour > 20) return false;
  if (kstHour === 20 && kstMinute > 50) return false;
  return true;
}

// 다음 발송 가능 시간 계산
function getNextSendableTime(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);

  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();

  const nextSendable = new Date(kstNow);
  nextSendable.setUTCHours(8, 0, 0, 0);

  if (kstHour >= 21 || (kstHour === 20 && kstMinute > 50) || kstHour < 8) {
    if (kstHour >= 8) {
      nextSendable.setUTCDate(nextSendable.getUTCDate() + 1);
    }
  }

  return new Date(nextSendable.getTime() - kstOffset);
}

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

// GET /api/local-customers/total-count - 전체 외부 고객 수 조회 (지역 선택 전 표시용)
router.get('/total-count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const totalCount = await prisma.externalCustomer.count({
      where: { consentMarketing: true },
    });

    res.json({ totalCount });
  } catch (error) {
    console.error('Total count fetch error:', error);
    res.status(500).json({ error: '전체 고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/count - 조건에 맞는 고객 수 조회 (다중 지역 지원)
router.get('/count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ageGroups, gender, regions, regionSidos, regionSigungu, categories } = req.query;

    // 새 형식 (regions JSON) 또는 구 형식 (regionSidos) 지원
    let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

    if (regions) {
      // 새 형식: regions JSON 파싱
      try {
        regionFilters = JSON.parse(regions as string);
      } catch (e) {
        return res.status(400).json({ error: '지역 데이터 형식이 올바르지 않습니다.' });
      }
    } else if (regionSidos) {
      // 구 형식: regionSidos 콤마 구분
      const regionSidoList = (regionSidos as string).split(',').filter(Boolean);
      regionFilters = regionSidoList.map((sido) => ({ sido }));
    }

    if (regionFilters.length === 0) {
      return res.status(400).json({ error: '지역을 선택해주세요.' });
    }

    // 필터 조건 구성 (다중 지역: OR 조건)
    // 시/도 전체 선택과 시/군/구 개별 선택 모두 지원
    const regionOrConditions = regionFilters.map((r) => {
      if (r.sigungu) {
        // 특정 시/군/구 선택
        return { regionSido: r.sido, regionSigungu: r.sigungu };
      } else {
        // 시/도 전체 선택
        return { regionSido: r.sido };
      }
    });

    const where: any = {
      OR: regionOrConditions,
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

    // 선호 업종 필터 (하나라도 포함되면 매칭 - OR 조건)
    if (categories) {
      const categoryList = (categories as string).split(',').filter(Boolean);
      if (categoryList.length > 0) {
        // preferredCategories JSON 배열에서 하나라도 포함되면 매칭
        where.OR = categoryList.map((cat) => ({
          preferredCategories: { contains: cat },
        }));
      }
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

// POST /api/local-customers/send - 메시지 발송 (다중 지역 지원)
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { content, ageGroups, gender, regions, regionSidos, sendCount, categories, isAdMessage = true } = req.body;

    // 새 형식 (regions) 또는 구 형식 (regionSidos) 지원
    let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

    if (regions && Array.isArray(regions) && regions.length > 0) {
      regionFilters = regions;
    } else if (regionSidos && Array.isArray(regionSidos) && regionSidos.length > 0) {
      regionFilters = regionSidos.map((sido: string) => ({ sido }));
    }

    // 유효성 검사
    if (!content || regionFilters.length === 0 || !sendCount) {
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

    // 필터 조건 구성 (다중 지역 지원 - 시/군/구 포함)
    const regionOrConditions = regionFilters.map((r) => {
      if (r.sigungu) {
        return { regionSido: r.sido, regionSigungu: r.sigungu };
      } else {
        return { regionSido: r.sido };
      }
    });

    const where: any = {
      OR: regionOrConditions,
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      where.ageGroup = { in: ageGroups };
    }

    if (gender && gender !== 'all') {
      where.gender = gender;
    }

    // 선호 업종 필터 (하나라도 포함되면 매칭 - OR 조건)
    if (categories && categories.length > 0) {
      where.OR = categories.map((cat: string) => ({
        preferredCategories: { contains: cat },
      }));
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

    // 광고 메시지 형식 적용
    const formattedContent = isAdMessage
      ? `(광고)\n${content}\n무료수신거부 080-500-4233`
      : content;

    // 캠페인 생성 (지역 정보를 JSON으로 저장)
    const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
    const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);

    const campaign = await prisma.externalSmsCampaign.create({
      data: {
        storeId,
        title: `신규 고객 유치 - ${new Date().toLocaleDateString('ko-KR')}`,
        content: formattedContent,
        filterAgeGroups: JSON.stringify(ageGroups || []),
        filterGender: gender || null,
        filterRegionSido: regionSidoList.join(','),
        filterRegionSigungu: regionSigunguList.join(','),
        filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
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
          text: formattedContent,
        });

        const groupInfo = result.groupInfo;
        const groupId = groupInfo?.groupId;

        // 메시지 레코드 생성 (PENDING 상태)
        await prisma.externalSmsMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            externalCustomerId: customer.id,
            content: formattedContent,
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
            content: formattedContent,
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

// GET /api/local-customers/kakao/send-available - 카카오톡 발송 가능 시간 확인
router.get('/kakao/send-available', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const canSend = isSendableTime();
    const nextAvailable = canSend ? null : getNextSendableTime();

    res.json({
      canSend,
      nextAvailable,
      currentTimeKST: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Send available check error:', error);
    res.status(500).json({ error: '발송 가능 시간 확인 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/kakao/estimate - 카카오톡 비용 예상
router.get('/kakao/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { sendCount, messageType = 'TEXT' } = req.query;

    if (!sendCount) {
      return res.status(400).json({ error: '발송 수량을 입력해주세요.' });
    }

    const count = parseInt(sendCount as string);
    const costPerMessage = messageType === 'IMAGE' ? EXTERNAL_KAKAO_IMAGE_COST : EXTERNAL_KAKAO_TEXT_COST;
    const totalCost = count * costPerMessage;

    // 지갑 잔액 조회
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    const walletBalance = wallet?.balance || 0;
    const canSend = walletBalance >= totalCost;

    // 매장 평균 객단가 조회
    const avgOrderResult = await prisma.visitOrOrder.aggregate({
      where: {
        storeId,
        totalAmount: { not: null },
      },
      _avg: { totalAmount: true },
    });
    const avgOrderValue = Math.round(avgOrderResult._avg.totalAmount || 25000);

    res.json({
      sendCount: count,
      messageType: messageType || 'TEXT',
      costPerMessage,
      totalCost,
      walletBalance,
      canSend,
      estimatedRevenue: {
        avgOrderValue,
        conversionRate: 0.076, // 카카오톡 방문율 7.6%
      },
    });
  } catch (error) {
    console.error('Kakao estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/kakao/send - 카카오톡 브랜드 메시지 발송 (외부 고객)
router.post('/kakao/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      content,
      messageType = 'TEXT',
      ageGroups,
      gender,
      regions,
      regionSidos,
      sendCount,
      categories,
      imageId,
      buttons,
    } = req.body;

    // 새 형식 (regions) 또는 구 형식 (regionSidos) 지원
    let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

    if (regions && Array.isArray(regions) && regions.length > 0) {
      regionFilters = regions;
    } else if (regionSidos && Array.isArray(regionSidos) && regionSidos.length > 0) {
      regionFilters = regionSidos.map((sido: string) => ({ sido }));
    }

    // 유효성 검사
    if (!content || regionFilters.length === 0 || !sendCount) {
      return res.status(400).json({ error: '필수 항목을 모두 입력해주세요.' });
    }

    if (sendCount <= 0) {
      return res.status(400).json({ error: '발송 수량은 1 이상이어야 합니다.' });
    }

    // 발송 가능 시간 체크 - 야간이면 다음날 08:00에 예약 발송
    const sendableNow = isSendableTime();
    const scheduledAt = sendableNow ? undefined : getNextSendableTime();

    // SOLAPI 설정 확인
    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(400).json({ error: '카카오 비즈니스 채널 설정이 필요합니다.' });
    }

    const solapiService = getSolapiService();
    if (!solapiService) {
      return res.status(400).json({ error: 'SOLAPI 설정이 되어있지 않습니다.' });
    }

    // 비용 계산
    const costPerMessage = messageType === 'IMAGE' ? EXTERNAL_KAKAO_IMAGE_COST : EXTERNAL_KAKAO_TEXT_COST;
    const totalCost = sendCount * costPerMessage;

    // 지갑 잔액 확인
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      });
    }

    // 필터 조건 구성 (다중 지역 지원 - 시/군/구 포함)
    const regionOrConditions = regionFilters.map((r) => {
      if (r.sigungu) {
        return { regionSido: r.sido, regionSigungu: r.sigungu };
      } else {
        return { regionSido: r.sido };
      }
    });

    const where: any = {
      OR: regionOrConditions,
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      where.ageGroup = { in: ageGroups };
    }

    if (gender && gender !== 'all') {
      where.gender = gender;
    }

    // 선호 업종 필터
    if (categories && categories.length > 0) {
      where.OR = categories.map((cat: string) => ({
        preferredCategories: { contains: cat },
      }));
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

    // 고객 선택
    const customers = await prisma.externalCustomer.findMany({
      where: {
        ...where,
        id: { notIn: usedCustomerIds },
      },
      take: sendCount,
      orderBy: {
        id: 'asc',
      },
    });

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    // 캠페인 생성 (SMS 캠페인 테이블 재사용, 제목으로 구분)
    const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
    const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);

    const campaign = await prisma.externalSmsCampaign.create({
      data: {
        storeId,
        title: `신규 고객 유치 (카카오톡) - ${new Date().toLocaleDateString('ko-KR')}`,
        content,
        filterAgeGroups: JSON.stringify(ageGroups || []),
        filterGender: gender || null,
        filterRegionSido: regionSidoList.join(','),
        filterRegionSigungu: regionSigunguList.join(','),
        filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
        targetCount: sendCount,
        costPerMessage,
        status: 'SENDING',
      },
    });

    // 개별 메시지 발송
    let pendingCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      const normalizedPhone = customer.phone.replace(/-/g, '');

      try {
        const result = await solapiService.sendBrandMessage({
          to: normalizedPhone,
          pfId,
          content,
          messageType: messageType as 'TEXT' | 'IMAGE',
          imageId,
          buttons: buttons as BrandMessageButton[],
          scheduledAt,
        });

        if (result.success && result.groupId) {
          await prisma.externalSmsMessage.create({
            data: {
              campaignId: campaign.id,
              storeId,
              externalCustomerId: customer.id,
              content,
              status: 'PENDING',
              solapiGroupId: result.groupId,
              cost: costPerMessage,
            },
          });
          pendingCount++;
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (err: any) {
        console.error(`[ExternalKakao] Send error for ${customer.phone}:`, err.message);

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

    // 예약 발송 여부에 따른 메시지
    const responseMessage = scheduledAt
      ? `다음날 08:00에 예약 발송됩니다. 결과는 발송내역에서 확인하세요.`
      : '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.';

    res.json({
      success: true,
      campaignId: campaign.id,
      pendingCount,
      failedCount,
      totalCost: pendingCount * costPerMessage,
      message: responseMessage,
      scheduledAt: scheduledAt?.toISOString(),
    });
  } catch (error) {
    console.error('Kakao send error:', error);
    res.status(500).json({ error: '카카오톡 발송 중 오류가 발생했습니다.' });
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
