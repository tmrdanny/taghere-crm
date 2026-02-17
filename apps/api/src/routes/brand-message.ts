import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { SolapiService, BrandMessageButton } from '../services/solapi.js';
import { calculateCostWithCredits } from '../services/credit-service.js';

const router = Router();

// 브랜드 메시지 비용 (건당)
const BRAND_MESSAGE_TEXT_COST = 200; // 텍스트형
const BRAND_MESSAGE_IMAGE_COST = 230; // 이미지형

// 이미지 제약 조건 (카카오 권장)
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_RECOMMENDED_WIDTH = 800;
const IMAGE_RECOMMENDED_HEIGHT = 400;

// 업로드 디렉토리 설정
const uploadDir = path.join(process.cwd(), 'uploads', 'brand-message');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      cb(new Error('JPG 또는 PNG 파일만 업로드 가능합니다.'));
      return;
    }
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('이미지 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// SOLAPI 서비스 인스턴스
let solapiServiceInstance: SolapiService | null = null;
function getSolapiService(): SolapiService | null {
  if (solapiServiceInstance) return solapiServiceInstance;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  solapiServiceInstance = new SolapiService(apiKey, apiSecret);
  return solapiServiceInstance;
}

// 전화번호 정규화
function normalizePhoneNumber(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('82')) {
    digits = '0' + digits.slice(2);
  }
  if (!digits.startsWith('0')) {
    digits = '0' + digits;
  }
  return digits;
}

// 연령대 -> 출생연도 범위 매핑
function getAgeGroupBirthYearRange(ageGroup: string): { gte: number; lte: number } | null {
  const currentYear = new Date().getFullYear();
  switch (ageGroup) {
    case 'TWENTIES':
      return { gte: currentYear - 29, lte: currentYear - 20 };
    case 'THIRTIES':
      return { gte: currentYear - 39, lte: currentYear - 30 };
    case 'FORTIES':
      return { gte: currentYear - 49, lte: currentYear - 40 };
    case 'FIFTIES':
      return { gte: currentYear - 59, lte: currentYear - 50 };
    case 'SIXTY_PLUS':
      return { gte: 1900, lte: currentYear - 60 };
    default:
      return null;
  }
}

// 지역 필터를 파싱하여 Prisma where 조건 생성
function buildRegionConditions(regionSidos?: string[], regionSigungus?: string[]): any[] {
  if (!regionSidos || regionSidos.length === 0) return [];

  const sigunguMap: Record<string, string[]> = {};
  if (regionSigungus && regionSigungus.length > 0) {
    for (const item of regionSigungus) {
      const [sido, sigungu] = item.split('/');
      if (sido && sigungu) {
        if (!sigunguMap[sido]) sigunguMap[sido] = [];
        sigunguMap[sido].push(sigungu);
      }
    }
  }

  return regionSidos.map((sido) => {
    const sigungus = sigunguMap[sido];
    if (sigungus && sigungus.length > 0) {
      return { regionSido: sido, regionSigungu: { in: sigungus } };
    }
    return { regionSido: sido };
  });
}

// 필터 조건 생성 헬퍼 함수
function buildFilterConditions(genderFilter?: string, ageGroups?: string[], regionSidos?: string[], regionSigungus?: string[]): any {
  const conditions: any = {};

  if (genderFilter && genderFilter !== 'all') {
    conditions.gender = genderFilter;
  }

  if (ageGroups && ageGroups.length > 0) {
    const birthYearConditions: any[] = [];
    for (const ageGroup of ageGroups) {
      const range = getAgeGroupBirthYearRange(ageGroup);
      if (range) {
        birthYearConditions.push({ birthYear: range });
      }
    }
    if (birthYearConditions.length > 0) {
      conditions.OR = birthYearConditions;
    }
  }

  const regionConditions = buildRegionConditions(regionSidos, regionSigungus);
  if (regionConditions.length > 0) {
    conditions.AND = [...(conditions.AND || []), { OR: regionConditions }];
  }

  return conditions;
}

// 발송 가능 시간 체크 (08:00 ~ 20:50 KST)
function isSendableTime(): boolean {
  const now = new Date();
  // KST = UTC + 9
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

  // 다음 08:00 계산
  const nextSendable = new Date(kstNow);
  nextSendable.setUTCHours(8, 0, 0, 0);

  // 현재 시간이 20:50 이후이거나 08:00 이전이면 다음 날 08:00
  if (kstHour >= 21 || (kstHour === 20 && kstMinute > 50) || kstHour < 8) {
    if (kstHour >= 8) {
      nextSendable.setUTCDate(nextSendable.getUTCDate() + 1);
    }
  }

  // UTC로 변환하여 반환
  return new Date(nextSendable.getTime() - kstOffset);
}

// 브랜드 메시지 포맷 (카카오톡은 광고 표기/수신거부 불필요)
function formatBrandMessage(content: string, storeName: string): string {
  return content;
}

// GET /api/brand-message/send-available - 발송 가능 시간 확인
router.get('/send-available', authMiddleware, async (req: AuthRequest, res) => {
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

// GET /api/brand-message/target-counts - 발송 대상 수 조회 (SMS와 동일)
router.get('/target-counts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { genderFilter, ageGroups } = req.query;

    const ageGroupList = ageGroups ? (ageGroups as string).split(',').filter(Boolean) : undefined;
    const filterConditions = buildFilterConditions(genderFilter as string, ageGroupList);
    const baseWhere = { storeId, phone: { not: null }, ...filterConditions };

    const [totalCount, revisitCount, newCount] = await Promise.all([
      prisma.customer.count({ where: baseWhere }),
      prisma.customer.count({ where: { ...baseWhere, visitCount: { gte: 2 } } }),
      prisma.customer.count({
        where: {
          ...baseWhere,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    res.json({
      all: totalCount,
      revisit: revisitCount,
      new: newCount,
    });
  } catch (error) {
    console.error('Target counts error:', error);
    res.status(500).json({ error: '대상 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/brand-message/estimate - 비용 예상
router.get('/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { targetType, messageType, customerIds, genderFilter, ageGroups, regionSidos, regionSigungus } = req.query;

    const ageGroupList = ageGroups ? (ageGroups as string).split(',').filter(Boolean) : undefined;
    const regionSidoList = regionSidos ? (regionSidos as string).split(',').filter(Boolean) : undefined;
    const regionSigunguList = regionSigungus ? (regionSigungus as string).split(',').filter(Boolean) : undefined;
    const filterConditions = buildFilterConditions(genderFilter as string, ageGroupList, regionSidoList, regionSigunguList);

    let targetCount = 0;

    if (targetType === 'CUSTOM' && customerIds) {
      const ids = (customerIds as string).split(',');
      targetCount = await prisma.customer.count({
        where: { storeId, id: { in: ids }, phone: { not: null } },
      });
    } else {
      const where: any = { storeId, phone: { not: null }, ...filterConditions };

      if (targetType === 'REVISIT') {
        where.visitCount = { gte: 2 };
      } else if (targetType === 'NEW') {
        where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      }

      targetCount = await prisma.customer.count({ where });
    }

    const costPerMessage = messageType === 'IMAGE' ? BRAND_MESSAGE_IMAGE_COST : BRAND_MESSAGE_TEXT_COST;

    // 리타겟 페이지 여부 확인 (/messages 페이지에서 호출 시 무료 크레딧 적용)
    // isRetargetPage 파라미터가 없으면 기본적으로 true (기존 /messages 페이지 호환)
    const isRetargetPage = req.query.isRetargetPage !== 'false';

    // 무료 크레딧 적용 계산
    const creditResult = await calculateCostWithCredits(
      storeId,
      targetCount,
      costPerMessage,
      isRetargetPage
    );

    const wallet = await prisma.wallet.findUnique({ where: { storeId } });

    // 매장 평균 객단가 조회 (예상 매출 계산용)
    const avgOrderResult = await prisma.visitOrOrder.aggregate({
      where: {
        storeId,
        totalAmount: { not: null },
      },
      _avg: { totalAmount: true },
    });
    const avgOrderValue = Math.round(avgOrderResult._avg.totalAmount || 25000);

    res.json({
      targetCount,
      messageType: messageType || 'TEXT',
      costPerMessage,
      totalCost: creditResult.totalCost,
      walletBalance: wallet?.balance || 0,
      canSend: (wallet?.balance || 0) >= creditResult.totalCost,
      // 무료 크레딧 정보
      freeCredits: {
        remaining: creditResult.remainingCredits,
        freeCount: creditResult.freeCount,
        paidCount: creditResult.paidCount,
        isRetargetPage,
      },
      estimatedRevenue: {
        avgOrderValue,
        conversionRate: 0.076, // 카카오톡 방문율 7.6%
      },
    });
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/brand-message/upload-image - 이미지 업로드
router.post('/upload-image', authMiddleware, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }

    const metadata = await sharp(req.file.buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: '이미지 정보를 읽을 수 없습니다.' });
    }

    // 로컬에 파일 저장
    const storeId = req.user!.storeId;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `${storeId}_${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await fs.promises.writeFile(filepath, req.file.buffer);

    // SOLAPI에 이미지 업로드
    const solapiService = getSolapiService();
    if (!solapiService) {
      await fs.promises.unlink(filepath).catch(() => {});
      return res.status(400).json({ error: 'SOLAPI 설정이 되어있지 않습니다.' });
    }

    const uploadResult = await solapiService.uploadImage(filepath);

    if (!uploadResult.success || !uploadResult.fileId) {
      await fs.promises.unlink(filepath).catch(() => {});
      return res.status(500).json({ error: uploadResult.error || '이미지 업로드에 실패했습니다.' });
    }

    const imageUrl = `/uploads/brand-message/${filename}`;

    res.json({
      success: true,
      imageUrl,
      filename,
      imageId: uploadResult.fileId,
      width: metadata.width,
      height: metadata.height,
      size: req.file.size,
    });
  } catch (error: any) {
    console.error('Image upload error:', error);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '이미지 용량이 너무 큽니다. (최대 5MB)' });
    }

    res.status(500).json({ error: error.message || '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/brand-message/delete-image - 이미지 삭제
router.delete('/delete-image', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filename } = req.body;
    const storeId = req.user!.storeId;

    if (!filename) {
      return res.status(400).json({ error: '파일명이 필요합니다.' });
    }

    if (!filename.startsWith(storeId)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const filepath = path.join(uploadDir, filename);

    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Image delete error:', error);
    res.status(500).json({ error: '이미지 삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/brand-message/send - 브랜드 메시지 발송
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      content,
      messageType = 'TEXT',
      targetType,
      customerIds,
      genderFilter,
      ageGroups,
      regionSidos,
      regionSigungus,
      imageUrl,
      imageId,
      buttons,
    } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    // 발송 가능 시간 체크
    if (!isSendableTime()) {
      return res.status(400).json({
        error: '발송 불가 시간대입니다. (08:00 ~ 20:50 사이에만 발송 가능)',
        nextAvailable: getNextSendableTime(),
      });
    }

    // SOLAPI 설정 확인
    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(400).json({ error: '카카오 비즈니스 채널 설정이 필요합니다.' });
    }

    const solapiService = getSolapiService();
    if (!solapiService) {
      return res.status(400).json({ error: 'SOLAPI 설정이 되어있지 않습니다.' });
    }

    // 대상 고객 조회 (SMS와 동일)
    const where: any = { storeId, phone: { not: null } };

    if (targetType === 'CUSTOM' && customerIds?.length > 0) {
      where.id = { in: customerIds };
    } else if (targetType === 'REVISIT') {
      where.visitCount = { gte: 2 };
    } else if (targetType === 'NEW') {
      where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    if (genderFilter && genderFilter !== 'all') {
      where.gender = genderFilter;
    }

    if (ageGroups && ageGroups.length > 0) {
      const birthYearConditions: any[] = [];
      for (const ageGroup of ageGroups) {
        const range = getAgeGroupBirthYearRange(ageGroup);
        if (range) {
          birthYearConditions.push({ birthYear: range });
        }
      }
      if (birthYearConditions.length > 0) {
        where.OR = birthYearConditions;
      }
    }

    // 지역 필터
    const regionConditions = buildRegionConditions(regionSidos, regionSigungus);
    if (regionConditions.length > 0) {
      where.AND = [...(where.AND || []), { OR: regionConditions }];
    }

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true },
    });

    if (customers.length === 0) {
      return res.status(400).json({ error: '발송 대상이 없습니다.' });
    }

    // 비용 계산
    const costPerMessage = messageType === 'IMAGE' ? BRAND_MESSAGE_IMAGE_COST : BRAND_MESSAGE_TEXT_COST;
    const totalCost = customers.length * costPerMessage;

    // 지갑 잔액 확인
    const wallet = await prisma.wallet.findUnique({ where: { storeId } });

    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '충전금이 부족합니다.',
        required: totalCost,
        balance: wallet?.balance || 0,
      });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    // 광고 메시지 형식 적용
    const formattedContent = formatBrandMessage(content, store?.name || '매장');

    // 캠페인 생성
    const campaign = await prisma.brandMessageCampaign.create({
      data: {
        storeId,
        content: formattedContent,
        messageType: messageType as 'TEXT' | 'IMAGE',
        imageUrl,
        imageId,
        buttons: buttons || null,
        targetType: targetType || 'ALL',
        genderFilter,
        ageGroups: ageGroups || null,
        targetCount: customers.length,
        costPerMessage,
        totalCost,
        status: 'SENDING',
      },
    });

    // 발송 결과 추적
    let pendingCount = 0;
    let failedCount = 0;

    // 개별 메시지 발송
    const sendPromises = customers.map(async (customer) => {
      const personalizedContent = formattedContent.replace(/{고객명}/g, customer.name || '고객');
      const normalizedPhone = normalizePhoneNumber(customer.phone!);

      try {
        const result = await solapiService.sendBrandMessage({
          to: normalizedPhone,
          pfId,
          content: personalizedContent,
          messageType: messageType as 'TEXT' | 'IMAGE',
          imageId,
          buttons: buttons as BrandMessageButton[],
        });

        if (result.success && result.groupId) {
          await prisma.brandMessage.create({
            data: {
              campaignId: campaign.id,
              storeId,
              customerId: customer.id,
              phone: normalizedPhone,
              content: personalizedContent,
              status: 'PENDING',
              solapiGroupId: result.groupId,
              cost: costPerMessage,
            },
          });
          return { success: true, phone: normalizedPhone };
        } else {
          await prisma.brandMessage.create({
            data: {
              campaignId: campaign.id,
              storeId,
              customerId: customer.id,
              phone: normalizedPhone,
              content: personalizedContent,
              status: 'FAILED',
              failReason: result.error || 'Unknown error',
              cost: 0,
            },
          });
          return { success: false, phone: normalizedPhone };
        }
      } catch (error: any) {
        console.error(`[BrandMessage] Send error for ${normalizedPhone}:`, error.message);

        await prisma.brandMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            customerId: customer.id,
            phone: normalizedPhone,
            content: personalizedContent,
            status: 'FAILED',
            failReason: error.message || 'Unknown error',
            cost: 0,
          },
        });

        return { success: false, phone: normalizedPhone };
      }
    });

    const results = await Promise.all(sendPromises);
    pendingCount = results.filter((r) => r.success).length;
    failedCount = results.filter((r) => !r.success).length;

    // 캠페인 상태 업데이트
    await prisma.brandMessageCampaign.update({
      where: { id: campaign.id },
      data: {
        sentCount: 0,
        failedCount,
        status: pendingCount > 0 ? 'SENDING' : 'COMPLETED',
      },
    });

    res.json({
      success: true,
      campaignId: campaign.id,
      pendingCount,
      failedCount,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
    });
  } catch (error) {
    console.error('Brand message send error:', error);
    res.status(500).json({ error: '브랜드 메시지 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/brand-message/schedule - 예약 발송
router.post('/schedule', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      content,
      messageType = 'TEXT',
      targetType,
      customerIds,
      genderFilter,
      ageGroups,
      regionSidos,
      regionSigungus,
      imageUrl,
      imageId,
      buttons,
      scheduledAt,
    } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: '예약 시간을 입력해주세요.' });
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: '예약 시간은 현재 시간보다 이후여야 합니다.' });
    }

    // 대상 고객 수 조회
    const where: any = { storeId, phone: { not: null } };

    if (targetType === 'CUSTOM' && customerIds?.length > 0) {
      where.id = { in: customerIds };
    } else if (targetType === 'REVISIT') {
      where.visitCount = { gte: 2 };
    } else if (targetType === 'NEW') {
      where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    if (genderFilter && genderFilter !== 'all') {
      where.gender = genderFilter;
    }

    if (ageGroups && ageGroups.length > 0) {
      const birthYearConditions: any[] = [];
      for (const ageGroup of ageGroups) {
        const range = getAgeGroupBirthYearRange(ageGroup);
        if (range) {
          birthYearConditions.push({ birthYear: range });
        }
      }
      if (birthYearConditions.length > 0) {
        where.OR = birthYearConditions;
      }
    }

    // 지역 필터
    const regionConditions = buildRegionConditions(regionSidos, regionSigungus);
    if (regionConditions.length > 0) {
      where.AND = [...(where.AND || []), { OR: regionConditions }];
    }

    const targetCount = await prisma.customer.count({ where });

    if (targetCount === 0) {
      return res.status(400).json({ error: '발송 대상이 없습니다.' });
    }

    // 비용 계산
    const costPerMessage = messageType === 'IMAGE' ? BRAND_MESSAGE_IMAGE_COST : BRAND_MESSAGE_TEXT_COST;
    const totalCost = targetCount * costPerMessage;

    // 지갑 잔액 확인
    const wallet = await prisma.wallet.findUnique({ where: { storeId } });

    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '충전금이 부족합니다.',
        required: totalCost,
        balance: wallet?.balance || 0,
      });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    // 광고 메시지 형식 적용
    const formattedContent = formatBrandMessage(content, store?.name || '매장');

    // 예약 캠페인 생성
    const campaign = await prisma.brandMessageCampaign.create({
      data: {
        storeId,
        content: formattedContent,
        messageType: messageType as 'TEXT' | 'IMAGE',
        imageUrl,
        imageId,
        buttons: buttons || null,
        targetType: targetType || 'ALL',
        genderFilter,
        ageGroups: ageGroups || null,
        targetCount,
        costPerMessage,
        totalCost,
        status: 'SCHEDULED',
        scheduledAt: scheduledDate,
      },
    });

    res.json({
      success: true,
      campaignId: campaign.id,
      scheduledAt: scheduledDate,
      targetCount,
      totalCost,
      message: `${scheduledDate.toLocaleString('ko-KR')}에 발송 예정입니다.`,
    });
  } catch (error) {
    console.error('Brand message schedule error:', error);
    res.status(500).json({ error: '예약 발송 설정 중 오류가 발생했습니다.' });
  }
});

// POST /api/brand-message/test-send - 테스트 발송
// 테스트 발송은 시간 제한 없이 항상 가능
router.post('/test-send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { phone, content, messageType = 'TEXT', imageId, buttons } = req.body;

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    // 테스트 발송은 시간 제한 없음 (발송 가능 시간 체크 제거)

    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(400).json({ error: '카카오 비즈니스 채널 설정이 필요합니다.' });
    }

    const solapiService = getSolapiService();
    if (!solapiService) {
      return res.status(400).json({ error: 'SOLAPI 설정이 되어있지 않습니다.' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    const formattedContent = formatBrandMessage(content, store?.name || '매장');
    const normalizedPhone = normalizePhoneNumber(phone);

    const result = await solapiService.sendBrandMessage({
      to: normalizedPhone,
      pfId,
      content: formattedContent,
      messageType: messageType as 'TEXT' | 'IMAGE',
      imageId,
      buttons: buttons as BrandMessageButton[],
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || '테스트 발송에 실패했습니다.' });
    }

    res.json({
      success: true,
      message: '테스트 발송이 완료되었습니다.',
      groupId: result.groupId,
    });
  } catch (error: any) {
    console.error('Brand message test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/brand-message/campaigns - 캠페인 목록 조회
router.get('/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [campaigns, total] = await Promise.all([
      prisma.brandMessageCampaign.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.brandMessageCampaign.count({ where: { storeId } }),
    ]);

    res.json({
      campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Campaigns list error:', error);
    res.status(500).json({ error: '캠페인 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/brand-message/campaigns/:id/cancel - 예약 취소
router.post('/campaigns/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const campaign = await prisma.brandMessageCampaign.findFirst({
      where: { id, storeId },
    });

    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    if (campaign.status !== 'SCHEDULED') {
      return res.status(400).json({ error: '예약된 캠페인만 취소할 수 있습니다.' });
    }

    await prisma.brandMessageCampaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    res.json({ success: true, message: '예약이 취소되었습니다.' });
  } catch (error) {
    console.error('Campaign cancel error:', error);
    res.status(500).json({ error: '예약 취소 중 오류가 발생했습니다.' });
  }
});

export default router;
