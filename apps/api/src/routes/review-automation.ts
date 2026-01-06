import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/review-automation/settings
router.get('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let settings = await prisma.reviewAutomationSetting.findUnique({
      where: { storeId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.reviewAutomationSetting.create({
        data: {
          storeId,
          enabled: false,
          sendFrequency: 'every', // 기본값: 매 주문 발송
          benefitText: '',
          costPerSend: 50,
          autoTopupEnabled: false,
          autoTopupThreshold: 10000,
          autoTopupAmount: 100000,
        },
      });
    }

    const wallet = await prisma.wallet.findUnique({ where: { storeId } });

    // 매장 정보 조회 (매장명 포함)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    res.json({
      ...settings,
      balance: wallet?.balance || 0,
      storeName: store?.name || '',
    });
  } catch (error) {
    console.error('Review settings get error:', error);
    res.status(500).json({ error: '리뷰 설정 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/review-automation/settings
router.post('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      enabled,
      sendFrequency,
      benefitText,
      autoTopupEnabled,
      autoTopupThreshold,
      autoTopupAmount,
      naverReviewUrl,
    } = req.body;

    const settings = await prisma.reviewAutomationSetting.upsert({
      where: { storeId },
      update: {
        enabled: enabled !== undefined ? enabled : undefined,
        sendFrequency: sendFrequency !== undefined ? sendFrequency : undefined,
        benefitText: benefitText !== undefined ? benefitText : undefined,
        autoTopupEnabled: autoTopupEnabled !== undefined ? autoTopupEnabled : undefined,
        autoTopupThreshold: autoTopupThreshold !== undefined ? autoTopupThreshold : undefined,
        autoTopupAmount: autoTopupAmount !== undefined ? autoTopupAmount : undefined,
        naverReviewUrl: naverReviewUrl !== undefined ? naverReviewUrl : undefined,
      },
      create: {
        storeId,
        enabled: enabled || false,
        sendFrequency: sendFrequency || 'every',
        benefitText: benefitText || '',
        autoTopupEnabled: autoTopupEnabled || false,
        autoTopupThreshold: autoTopupThreshold || 10000,
        autoTopupAmount: autoTopupAmount || 100000,
        naverReviewUrl,
      },
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Review settings update error:', error);
    res.status(500).json({ error: '리뷰 설정 저장 중 오류가 발생했습니다.' });
  }
});

// 테스트 발송 일일 제한
const TEST_SEND_DAILY_LIMIT = 5;

// GET /api/review-automation/test-count - 오늘 테스트 발송 횟수 조회
router.get('/test-count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    // 오늘 날짜 범위 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await prisma.reviewRequestLog.count({
      where: {
        storeId,
        isTest: true,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    res.json({
      count,
      limit: TEST_SEND_DAILY_LIMIT,
      remaining: Math.max(0, TEST_SEND_DAILY_LIMIT - count),
    });
  } catch (error) {
    console.error('Test count error:', error);
    res.status(500).json({ error: '테스트 횟수 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/review-automation/test-send - 테스트 발송 (SOLAPI 직접 발송, 하루 5회 제한)
router.post('/test-send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    // 오늘 테스트 발송 횟수 확인
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTestCount = await prisma.reviewRequestLog.count({
      where: {
        storeId,
        isTest: true,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (todayTestCount >= TEST_SEND_DAILY_LIMIT) {
      return res.status(400).json({
        error: `오늘 테스트 발송 횟수(${TEST_SEND_DAILY_LIMIT}회)를 모두 사용했습니다.`,
      });
    }

    // 리뷰 설정 조회
    const settings = await prisma.reviewAutomationSetting.findUnique({
      where: { storeId },
    });

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 실제 알림톡 발송 (SOLAPI)
    const templateId = process.env.SOLAPI_TEMPLATE_ID_REVIEW_REQUEST;
    const pfId = process.env.SOLAPI_PF_ID;
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!templateId || !pfId || !apiKey || !apiSecret) {
      return res.status(400).json({ error: 'SOLAPI 설정이 되어있지 않습니다.' });
    }

    // SOLAPI 발송
    const { SolapiService } = await import('../services/solapi.js');
    const solapiService = new SolapiService(apiKey, apiSecret);

    // 네이버 플레이스 URL에서 프로토콜 제거 (버튼 변수용)
    let placeAddress = settings?.naverReviewUrl || '';
    if (placeAddress.startsWith('https://')) {
      placeAddress = placeAddress.replace('https://', '');
    } else if (placeAddress.startsWith('http://')) {
      placeAddress = placeAddress.replace('http://', '');
    }

    const result = await solapiService.sendAlimTalk({
      to: phone,
      pfId,
      templateId,
      variables: {
        '#{매장명}': store.name,
        '#{리뷰내용}': settings?.benefitText || '',
        '#{플레이스주소}': placeAddress,
      },
    });

    if (!result.success) {
      console.error('Test send error:', result.error);
      return res.status(400).json({ error: result.error || '테스트 발송에 실패했습니다.' });
    }

    // 테스트 발송 로그 생성
    await prisma.reviewRequestLog.create({
      data: {
        storeId,
        phone,
        status: 'SENT',
        cost: 0, // 테스트는 무료
        isTest: true,
        sentAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: '테스트 발송이 완료되었습니다.',
    });
  } catch (error) {
    console.error('Test send error:', error);
    res.status(500).json({ error: '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/review-automation/logs
router.get('/logs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      prisma.reviewRequestLog.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      }),
      prisma.reviewRequestLog.count({ where: { storeId } }),
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Review logs error:', error);
    res.status(500).json({ error: '리뷰 발송 로그 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
