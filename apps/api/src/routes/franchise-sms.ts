import { Router } from 'express';
import { SolapiMessageService } from 'solapi';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { SolapiService } from '../services/solapi.js';
import { maskName, maskPhone } from '../utils/masking.js';

const router = Router();

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

// SMS 비용 (건당)
const SMS_COST_SHORT = 50;  // 단문 (90byte 이하)
const SMS_COST_LONG = 50;   // 장문 (90byte 초과)
const MMS_COST = 120;       // 이미지 첨부 시

// 이미지 제약 조건
const IMAGE_MAX_SIZE = 200 * 1024; // 200KB
const IMAGE_MAX_WIDTH = 1500;
const IMAGE_MAX_HEIGHT = 1440;

// 업로드 디렉토리
const uploadDir = path.join(process.cwd(), 'uploads', 'franchise-mms');
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
    if (ext !== '.jpg' && ext !== '.jpeg') {
      cb(new Error('JPG 파일만 업로드 가능합니다.'));
      return;
    }
    if (!file.mimetype.startsWith('image/jpeg')) {
      cb(new Error('JPG 이미지 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

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

// 바이트 길이 계산
function getByteLength(str: string): number {
  let byteLength = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode > 127) {
      byteLength += 2;
    } else {
      byteLength += 1;
    }
  }
  return byteLength;
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

// 필터 조건 생성
function buildFilterConditions(genderFilter?: string, ageGroups?: string[]): any {
  const conditions: any = {};

  if (genderFilter && genderFilter !== 'ALL' && genderFilter !== 'all') {
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

  return conditions;
}

// 1. GET /api/franchise/sms/target-counts - 타겟 그룹별 고객 수 조회
router.get('/target-counts', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { genderFilter, ageGroups } = req.query;

    // 프랜차이즈의 모든 매장 조회
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true }
    });
    const storeIds = stores.map(s => s.id);

    if (storeIds.length === 0) {
      return res.json({ all: 0, revisit: 0, new: 0, custom: 0 });
    }

    // ageGroups 문자열을 배열로 변환
    const ageGroupList = ageGroups ? (ageGroups as string).split(',').filter(Boolean) : undefined;

    // 필터 조건 생성
    const filterConditions = buildFilterConditions(
      genderFilter as string,
      ageGroupList
    );

    const baseWhere = {
      storeId: { in: storeIds },
      phone: { not: null },
      ...filterConditions
    };

    // ALL: 모든 고객
    const all = await prisma.customer.count({ where: baseWhere });

    // REVISIT: 2회 이상 방문
    const revisit = await prisma.customer.count({
      where: { ...baseWhere, visitCount: { gte: 2 } }
    });

    // NEW: 최근 30일 내 신규
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newCount = await prisma.customer.count({
      where: { ...baseWhere, createdAt: { gte: thirtyDaysAgo } }
    });

    res.json({
      all,
      revisit,
      new: newCount,
      custom: 0
    });
  } catch (error) {
    console.error('Target counts error:', error);
    res.status(500).json({ error: '대상 수 조회 중 오류가 발생했습니다.' });
  }
});

// 2. GET /api/franchise/sms/estimate - 비용 견적
router.get('/estimate', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { targetType, content, customerIds, genderFilter, ageGroups, hasImage } = req.query;

    // 프랜차이즈의 모든 매장 조회
    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true }
    });
    const storeIds = stores.map(s => s.id);

    if (storeIds.length === 0) {
      return res.json({
        targetCount: 0,
        byteLength: 0,
        messageType: 'SMS',
        costPerMessage: 0,
        totalCost: 0,
        walletBalance: 0,
        canSend: false
      });
    }

    // ageGroups 문자열을 배열로 변환
    const ageGroupList = ageGroups ? (ageGroups as string).split(',').filter(Boolean) : undefined;

    // 필터 조건 생성
    const filterConditions = buildFilterConditions(
      genderFilter as string,
      ageGroupList
    );

    let targetCount = 0;

    if (targetType === 'CUSTOM' && customerIds) {
      // 직접 선택한 고객
      const ids = (customerIds as string).split(',');
      targetCount = await prisma.customer.count({
        where: {
          storeId: { in: storeIds },
          id: { in: ids },
          phone: { not: null }
        }
      });
    } else {
      // 대상 유형별 + 필터 적용
      const where: any = {
        storeId: { in: storeIds },
        phone: { not: null },
        ...filterConditions
      };

      if (targetType === 'REVISIT') {
        where.visitCount = { gte: 2 };
      } else if (targetType === 'NEW') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        where.createdAt = { gte: thirtyDaysAgo };
      }

      targetCount = await prisma.customer.count({ where });
    }

    // 비용 계산
    const byteLength = getByteLength((content as string) || '');
    const isImageAttached = hasImage === 'true';
    const costPerMessage = isImageAttached ? MMS_COST : (byteLength > 90 ? SMS_COST_LONG : SMS_COST_SHORT);
    const messageType = isImageAttached ? 'MMS' : (byteLength > 90 ? 'LMS' : 'SMS');
    const totalCost = targetCount * costPerMessage;

    // 프랜차이즈 지갑 잔액 조회
    const wallet = await prisma.franchiseWallet.findUnique({
      where: { franchiseId }
    });

    // 예상 수익 계산 (전환율 5%, 객단가 15,000원 가정)
    const expectedRevenue = Math.round(targetCount * 15000 * 0.05);

    res.json({
      targetCount,
      byteLength,
      messageType,
      costPerMessage,
      totalCost,
      walletBalance: wallet?.balance || 0,
      canSend: (wallet?.balance || 0) >= totalCost,
      estimatedRevenue: {
        conversionRate: 5,
        avgOrderValue: 15000,
        totalRevenue: expectedRevenue
      }
    });
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 견적 조회 중 오류가 발생했습니다.' });
  }
});

// 3. GET /api/franchise/customers/selectable - 고객 선택 모달용 (마스킹)
router.get('/customers/selectable', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { search, limit = '100', storeId } = req.query;

    console.log('[Selectable Customers] franchiseId:', franchiseId);
    console.log('[Selectable Customers] storeId:', storeId);
    console.log('[Selectable Customers] search:', search);

    // storeId가 제공된 경우: 해당 가맹점만
    // storeId가 없는 경우: 모든 가맹점 (하위 호환성 유지)
    let storeIds: string[] = [];

    if (storeId) {
      // 특정 가맹점의 고객만 조회
      // 보안: 해당 가맹점이 이 프랜차이즈 소유인지 검증
      const store = await prisma.store.findFirst({
        where: {
          id: storeId as string,
          franchiseId
        },
        select: { id: true }
      });

      if (!store) {
        console.log('[Selectable Customers] Access denied: store not owned by franchise');
        return res.status(403).json({ error: '접근 권한이 없는 가맹점입니다.' });
      }

      storeIds = [store.id];
      console.log('[Selectable Customers] Using specific store:', storeId);
    } else {
      // 프랜차이즈의 모든 매장 조회 (기존 동작)
      const stores = await prisma.store.findMany({
        where: { franchiseId },
        select: { id: true }
      });
      storeIds = stores.map(s => s.id);
      console.log('[Selectable Customers] Found stores:', storeIds.length);
    }

    if (storeIds.length === 0) {
      console.log('[Selectable Customers] No stores found for franchise');
      return res.json([]);
    }

    const customers = await prisma.customer.findMany({
      where: {
        storeId: { in: storeIds },
        phone: { not: null },
        ...(search && {
          OR: [
            { name: { contains: search as string } },
            { phone: { contains: search as string } }
          ]
        })
      },
      select: {
        id: true,
        name: true,
        phone: true,
        visitCount: true,
        totalPoints: true,
        createdAt: true,
        gender: true,
        messageCount: true
      },
      take: parseInt(limit as string),
      orderBy: { createdAt: 'desc' }
    });

    console.log('[Selectable Customers] Found customers:', customers.length);

    // 마스킹 적용
    const masked = customers.map(c => ({
      ...c,
      name: maskName(c.name),
      phone: maskPhone(c.phone)
    }));

    res.json(masked);
  } catch (error) {
    console.error('Selectable customers error:', error);
    res.status(500).json({ error: '고객 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 4. POST /api/franchise/sms/upload-image - MMS 이미지 업로드
router.post('/upload-image', franchiseAuthMiddleware, upload.single('image'), async (req: FranchiseAuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }

    const franchiseId = req.franchiseUser!.franchiseId;

    // 이미지 메타데이터 확인
    const metadata = await sharp(req.file.buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: '이미지 정보를 읽을 수 없습니다.' });
    }

    // 크기 검증
    if (metadata.width > IMAGE_MAX_WIDTH) {
      return res.status(400).json({
        error: `이미지 가로 크기가 너무 큽니다. (최대 ${IMAGE_MAX_WIDTH}px, 현재 ${metadata.width}px)`,
        width: metadata.width,
        maxWidth: IMAGE_MAX_WIDTH,
      });
    }

    if (metadata.height > IMAGE_MAX_HEIGHT) {
      return res.status(400).json({
        error: `이미지 세로 크기가 너무 큽니다. (최대 ${IMAGE_MAX_HEIGHT}px, 현재 ${metadata.height}px)`,
        height: metadata.height,
        maxHeight: IMAGE_MAX_HEIGHT,
      });
    }

    // 용량 검증
    if (req.file.size > IMAGE_MAX_SIZE) {
      return res.status(400).json({
        error: `이미지 용량이 너무 큽니다. (최대 200KB, 현재 ${Math.round(req.file.size / 1024)}KB)`,
        size: req.file.size,
        maxSize: IMAGE_MAX_SIZE,
      });
    }

    // 먼저 로컬에 파일 저장 (SOLAPI 업로드 및 미리보기용)
    const filename = `${franchiseId}_${Date.now()}.jpg`;
    const filepath = path.join(uploadDir, filename);

    await fs.promises.writeFile(filepath, req.file.buffer);

    // SOLAPI에 이미지 업로드하여 imageId 획득
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!apiKey || !apiSecret) {
      // 로컬 파일 삭제
      await fs.promises.unlink(filepath).catch(() => {});
      return res.status(400).json({ error: 'SMS 발송 설정이 되어있지 않습니다.' });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);

    console.log('[Franchise SMS] Uploading image to SOLAPI, filepath:', filepath);

    // SOLAPI 이미지 업로드 (파일 경로 전달)
    const uploadResult = await messageService.uploadFile(filepath, 'MMS');

    console.log('[Franchise SMS] SOLAPI upload result:', uploadResult);

    if (!uploadResult?.fileId) {
      // 로컬 파일 삭제
      await fs.promises.unlink(filepath).catch(() => {});
      return res.status(500).json({ error: 'SOLAPI 이미지 업로드에 실패했습니다.' });
    }

    // 이미지 URL 반환 (상대 경로) + SOLAPI imageId
    const imageUrl = `/uploads/franchise-mms/${filename}`;

    res.json({
      success: true,
      imageUrl,
      filename,
      imageId: uploadResult.fileId, // SOLAPI에서 받은 imageId
      width: metadata.width,
      height: metadata.height,
      size: req.file.size,
    });
  } catch (error: any) {
    console.error('Image upload error:', error);

    // Multer 에러 처리
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '이미지 용량이 너무 큽니다. (최대 200KB)' });
    }

    res.status(500).json({ error: error.message || '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// 5. POST /api/franchise/sms/test-send - 테스트 발송
router.post('/test-send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { phone, content, imageId } = req.body;

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    // 오늘 테스트 발송 횟수 확인
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTestCount = await prisma.franchiseSmsTestLog.count({
      where: {
        franchiseId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (todayTestCount >= 5) {
      return res.status(400).json({
        error: '오늘 테스트 발송 횟수(5회)를 모두 사용했습니다.',
      });
    }

    // SOLAPI 설정 확인
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'SMS 발송 설정이 되어있지 않습니다.' });
    }

    // 메시지 유형 결정
    const hasImage = !!imageId;
    const byteLength = getByteLength(content);
    const messageType = hasImage ? 'MMS' : (byteLength > 90 ? 'LMS' : 'SMS');

    // SOLAPI 서비스 초기화
    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const normalizedPhone = normalizePhoneNumber(phone);

    // 발송 옵션
    const sendOptions: any = {
      to: normalizedPhone,
      from: '07041380263', // 발신번호 고정
      text: content,
      type: messageType,
    };

    // MMS인 경우 이미지 추가
    if (hasImage && imageId) {
      sendOptions.imageId = imageId;
    }

    console.log('[Franchise SMS Test] Sending test message:', { phone: normalizedPhone, messageType, hasImage });

    const result = await messageService.send(sendOptions);
    const groupInfo = result.groupInfo;
    const groupId = groupInfo?.groupId;

    // 3초 대기 후 실제 발송 결과 조회 (SOLAPI 처리 시간 고려)
    let success = false;
    let failReason: string | null = null;

    if (groupId) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const solapiService = getSolapiService();
      if (solapiService) {
        const statusResult = await solapiService.getMessageStatus(groupId, normalizedPhone);
        console.log('[Franchise SMS Test] Delivery status:', statusResult);

        if (statusResult.success) {
          if (statusResult.status === 'SENT') {
            success = true;
          } else if (statusResult.status === 'FAILED') {
            success = false;
            failReason = statusResult.failReason || '발송 실패';
          } else {
            // PENDING - 아직 처리 중
            success = true;
            console.log('[Franchise SMS Test] Message still PENDING after 3s, assuming success');
          }
        } else {
          // 상태 조회 실패 - sentSuccess만 확인
          console.log('[Franchise SMS Test] Status query failed, checking groupInfo:', statusResult.error);
          const sentSuccess = groupInfo?.count?.sentSuccess || 0;
          const sentFailed = groupInfo?.count?.sentFailed || 0;
          if (sentSuccess > 0) {
            success = true;
          } else if (sentFailed > 0) {
            success = false;
            failReason = '발송 실패';
          } else {
            success = true;
            console.log('[Franchise SMS Test] No sent status yet, assuming success');
          }
        }
      } else {
        // SolapiService 없음
        const sentSuccess = groupInfo?.count?.sentSuccess || 0;
        success = sentSuccess > 0;
        if (!success) {
          failReason = 'SOLAPI 서비스 오류';
        }
      }
    } else {
      success = false;
      failReason = 'No group ID returned';
    }

    console.log('[Franchise SMS Test] Final result:', { success, groupId, failReason });

    if (!success) {
      return res.status(400).json({
        error: failReason || '테스트 발송에 실패했습니다.',
        details: { groupInfo },
      });
    }

    // 테스트 발송 로그 저장
    await prisma.franchiseSmsTestLog.create({
      data: {
        franchiseId,
        phone: normalizedPhone,
        content,
      },
    });

    res.json({
      success: true,
      message: '테스트 발송이 완료되었습니다.',
      messageType,
      groupId: groupInfo?.groupId,
    });
  } catch (error: any) {
    console.error('Franchise SMS test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// 6. POST /api/franchise/sms/send - 실제 메시지 발송
router.post('/send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const {
      content,
      targetType,
      customerIds,
      genderFilter,
      ageGroups,
      imageUrl,
      imageId,
      isAdMessage
    } = req.body;

    if (!content || !targetType) {
      return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. 타겟 고객 조회
      const stores = await tx.store.findMany({
        where: { franchiseId },
        select: { id: true }
      });
      const storeIds = stores.map(s => s.id);

      if (storeIds.length === 0) {
        throw new Error('연동된 매장이 없습니다.');
      }

      const ageGroupList = ageGroups && Array.isArray(ageGroups) ? ageGroups : [];
      const filterConditions = buildFilterConditions(genderFilter, ageGroupList);

      const whereCondition: any = {
        storeId: { in: storeIds },
        phone: { not: null },
        ...filterConditions
      };

      if (targetType === 'CUSTOM' && customerIds && Array.isArray(customerIds)) {
        whereCondition.id = { in: customerIds };
      } else if (targetType === 'REVISIT') {
        whereCondition.visitCount = { gte: 2 };
      } else if (targetType === 'NEW') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        whereCondition.createdAt = { gte: thirtyDaysAgo };
      }

      const customers = await tx.customer.findMany({
        where: whereCondition,
        select: { id: true, phone: true }
      });

      if (customers.length === 0) {
        throw new Error('발송 대상이 없습니다.');
      }

      // 2. 비용 계산
      const bytes = getByteLength(content);
      const messageType = imageUrl ? 'MMS' : (bytes <= 90 ? 'SMS' : 'LMS');
      const costPerMessage = messageType === 'MMS' ? MMS_COST : SMS_COST_SHORT;
      const totalCost = customers.length * costPerMessage;

      // 3. 지갑 확인 및 차감
      const wallet = await tx.franchiseWallet.findUnique({
        where: { franchiseId }
      });

      if (!wallet || wallet.balance < totalCost) {
        throw new Error('잔액이 부족합니다.');
      }

      await tx.franchiseWallet.update({
        where: { franchiseId },
        data: { balance: { decrement: totalCost } }
      });

      // 4. 캠페인 생성
      const campaign = await tx.franchiseSmsCampaign.create({
        data: {
          franchiseId,
          content,
          messageType,
          targetType,
          targetCount: customers.length,
          sentCount: 0,
          costPerMessage,
          totalCost,
          genderFilter: genderFilter || null,
          ageGroups: ageGroupList.length > 0 ? JSON.stringify(ageGroupList) : null,
          imageUrl: imageUrl || null,
          status: 'PENDING'
        }
      });

      // 5. SOLAPI 발송 (비동기)
      setImmediate(async () => {
        try {
          const apiKey = process.env.SOLAPI_API_KEY;
          const apiSecret = process.env.SOLAPI_API_SECRET;

          if (!apiKey || !apiSecret) {
            console.error('SOLAPI service not configured');
            return;
          }

          const messageService = new SolapiMessageService(apiKey, apiSecret);
          const bytes = getByteLength(content);
          const msgType = imageId ? 'MMS' : (bytes <= 90 ? 'SMS' : 'LMS');

          // 개별 발송 (병렬 처리)
          const sendPromises = customers.map(async (customer) => {
            const normalizedPhone = normalizePhoneNumber(customer.phone!);

            try {
              // SOLAPI 발송 옵션
              const sendOptions: any = {
                to: normalizedPhone,
                from: '07041380263', // 발신번호 고정
                text: content,
                type: msgType,
              };

              // MMS인 경우 이미지 추가 (SOLAPI에서 받은 imageId 사용)
              if (imageId) {
                sendOptions.imageId = imageId;
              }

              const result = await messageService.send(sendOptions);
              const groupInfo = result.groupInfo;
              const groupId = groupInfo?.groupId;

              console.log(`[Franchise SMS] Sent to ${normalizedPhone}, groupId: ${groupId}`);
              return { success: true, phone: normalizedPhone };
            } catch (error: any) {
              console.error(`[Franchise SMS] Send error for ${normalizedPhone}:`, error.message);
              return { success: false, phone: normalizedPhone };
            }
          });

          const results = await Promise.all(sendPromises);
          const sentCount = results.filter((r) => r.success).length;
          const failedCount = results.filter((r) => !r.success).length;

          // 6. 개별 메시지 기록
          for (const customer of customers) {
            await prisma.franchiseSmsMessage.create({
              data: {
                campaignId: campaign.id,
                customerId: customer.id,
                phone: customer.phone!,
                content,
                messageType,
                cost: costPerMessage,
                status: 'SENT'
              }
            });
          }

          // 7. 캠페인 완료 업데이트
          await prisma.franchiseSmsCampaign.update({
            where: { id: campaign.id },
            data: {
              status: 'COMPLETED',
              sentCount: customers.length
            }
          });
        } catch (error) {
          console.error('SMS send error:', error);
          await prisma.franchiseSmsCampaign.update({
            where: { id: campaign.id },
            data: { status: 'FAILED' }
          });
        }
      });

      res.json({
        success: true,
        campaignId: campaign.id,
        targetCount: customers.length
      });
    });
  } catch (error: any) {
    console.error('Send error:', error);
    res.status(500).json({ error: error.message || '발송 중 오류가 발생했습니다.' });
  }
});

// 7. GET /api/franchise/sms/test-count - 오늘 테스트 발송 횟수
router.get('/test-count', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.franchiseSmsTestLog.count({
      where: {
        franchiseId,
        createdAt: { gte: today }
      }
    });

    res.json({
      count,
      limit: 5,
      remaining: Math.max(0, 5 - count)
    });
  } catch (error) {
    console.error('Test count error:', error);
    res.status(500).json({ error: '테스트 횟수 조회 중 오류가 발생했습니다.' });
  }
});

// 8. DELETE /api/franchise/sms/delete-image - 이미지 삭제
router.delete('/delete-image', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const { filename } = req.body;
    const franchiseId = req.franchiseUser!.franchiseId;

    if (!filename) {
      return res.status(400).json({ error: '파일명이 필요합니다.' });
    }

    // 보안: 파일명이 해당 프랜차이즈의 것인지 확인
    if (!filename.startsWith(franchiseId)) {
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

export default router;
