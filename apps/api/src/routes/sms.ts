import { Router } from 'express';
import { SolapiMessageService } from 'solapi';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { SolapiService } from '../services/solapi.js';

const router = Router();

// SOLAPI 서비스 인스턴스 (발송 결과 조회용)
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
const SMS_COST_LONG = 50;   // 장문 (90byte 초과) - 동일 비용
const MMS_COST = 120;       // 이미지 첨부 시

// 이미지 제약 조건
const IMAGE_MAX_SIZE = 200 * 1024; // 200KB
const IMAGE_MAX_WIDTH = 1500;      // 1500px
const IMAGE_MAX_HEIGHT = 1440;     // 1440px

// 업로드 디렉토리 설정
const uploadDir = path.join(process.cwd(), 'uploads', 'mms');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정 - 메모리 스토리지 사용 (검증 후 저장)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    // JPG 확장자만 허용
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

// 바이트 길이 계산 (한글 2바이트, 영문/숫자 1바이트)
function getByteLength(str: string): number {
  let byteLength = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode > 127) {
      byteLength += 2; // 한글 등 멀티바이트 문자
    } else {
      byteLength += 1; // ASCII 문자
    }
  }
  return byteLength;
}

// 필터 조건 생성 헬퍼 함수
function buildFilterConditions(genderFilter?: string, ageFilter?: string): any {
  const conditions: any = {};

  // 성별 필터
  if (genderFilter && genderFilter !== 'all') {
    conditions.gender = genderFilter;
  }

  // 연령 필터 (출생연도 기준)
  if (ageFilter && ageFilter !== 'all') {
    const currentYear = new Date().getFullYear();
    if (ageFilter === '20-30') {
      conditions.birthYear = { gte: currentYear - 39, lte: currentYear - 20 };
    } else if (ageFilter === '40-50') {
      conditions.birthYear = { gte: currentYear - 59, lte: currentYear - 40 };
    }
  }

  return conditions;
}

// GET /api/sms/target-counts - 발송 대상 수 조회 (필터 적용)
router.get('/target-counts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { genderFilter, ageFilter } = req.query;

    // 필터 조건 생성
    const filterConditions = buildFilterConditions(
      genderFilter as string,
      ageFilter as string
    );

    const baseWhere = { storeId, phone: { not: null }, ...filterConditions };

    // 전체 고객 (전화번호 있는 고객만 + 필터)
    const totalCount = await prisma.customer.count({
      where: baseWhere,
    });

    // 재방문 고객 (2회 이상 + 필터)
    const revisitCount = await prisma.customer.count({
      where: { ...baseWhere, visitCount: { gte: 2 } },
    });

    // 신규 고객 (최근 30일 + 필터)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newCount = await prisma.customer.count({
      where: {
        ...baseWhere,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

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

// GET /api/sms/estimate - 발송 비용 예상 (필터 적용)
router.get('/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { targetType, content, customerIds, genderFilter, ageFilter, hasImage } = req.query;

    // 필터 조건 생성
    const filterConditions = buildFilterConditions(
      genderFilter as string,
      ageFilter as string
    );

    let targetCount = 0;

    if (targetType === 'CUSTOM' && customerIds) {
      // 직접 선택한 고객 (필터는 이미 선택된 고객에게 적용하지 않음)
      const ids = (customerIds as string).split(',');
      targetCount = await prisma.customer.count({
        where: { storeId, id: { in: ids }, phone: { not: null } },
      });
    } else {
      // 대상 유형별 + 필터 적용
      const where: any = { storeId, phone: { not: null }, ...filterConditions };

      if (targetType === 'REVISIT') {
        where.visitCount = { gte: 2 };
      } else if (targetType === 'NEW') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        where.createdAt = { gte: thirtyDaysAgo };
      }

      targetCount = await prisma.customer.count({ where });
    }

    // 비용 계산 - 이미지 첨부 시 MMS 비용(110원), 아니면 SMS 비용(50원)
    const byteLength = getByteLength((content as string) || '');
    const isImageAttached = hasImage === 'true';
    const costPerMessage = isImageAttached ? MMS_COST : (byteLength > 90 ? SMS_COST_LONG : SMS_COST_SHORT);
    const messageType = isImageAttached ? 'MMS' : (byteLength > 90 ? 'LMS' : 'SMS');
    const totalCost = targetCount * costPerMessage;

    // 지갑 잔액 조회
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    res.json({
      targetCount,
      byteLength,
      messageType,
      costPerMessage,
      totalCost,
      walletBalance: wallet?.balance || 0,
      canSend: (wallet?.balance || 0) >= totalCost,
    });
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/sms/send - 문자 발송
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { title, content, targetType, customerIds, genderFilter, ageFilter, imageUrl, imageId } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }

    // SOLAPI 설정 확인
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'SMS 발송 설정이 되어있지 않습니다.' });
    }

    // 대상 고객 조회
    const where: any = { storeId, phone: { not: null } };

    if (targetType === 'CUSTOM' && customerIds?.length > 0) {
      where.id = { in: customerIds };
    } else if (targetType === 'REVISIT') {
      where.visitCount = { gte: 2 };
    } else if (targetType === 'NEW') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      where.createdAt = { gte: thirtyDaysAgo };
    }

    // 성별 필터
    if (genderFilter && genderFilter !== 'all') {
      where.gender = genderFilter;
    }

    // 연령 필터 (출생연도 기준)
    if (ageFilter) {
      const currentYear = new Date().getFullYear();
      if (ageFilter === '20-30') {
        where.birthYear = { gte: currentYear - 39, lte: currentYear - 20 };
      } else if (ageFilter === '40-50') {
        where.birthYear = { gte: currentYear - 59, lte: currentYear - 40 };
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true },
    });

    if (customers.length === 0) {
      return res.status(400).json({ error: '발송 대상이 없습니다.' });
    }

    // 이미지 첨부 여부 확인
    const hasImage = !!imageUrl;

    // 비용 계산 - 이미지 첨부 시 MMS 비용(110원)
    const byteLength = getByteLength(content);
    const costPerMessage = hasImage ? MMS_COST : (byteLength > 90 ? SMS_COST_LONG : SMS_COST_SHORT);
    const messageType = hasImage ? 'MMS' : (byteLength > 90 ? 'LMS' : 'SMS');
    const totalCost = customers.length * costPerMessage;

    // 지갑 잔액 확인
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '충전금이 부족합니다.',
        required: totalCost,
        balance: wallet?.balance || 0,
      });
    }

    // 매장 정보 조회 (발신번호용)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    // 캠페인 생성
    const campaign = await prisma.smsCampaign.create({
      data: {
        storeId,
        title: title || `${store?.name || '매장'} 메시지`,
        content,
        targetType: targetType || 'ALL',
        targetCount: customers.length,
        totalCost,
        status: 'SENDING',
      },
    });

    // SOLAPI 서비스 초기화
    const messageService = new SolapiMessageService(apiKey, apiSecret);

    // 발송 결과 추적
    let sentCount = 0;
    let failedCount = 0;

    // 개별 메시지 생성 및 발송
    for (const customer of customers) {
      const personalizedContent = content.replace(/{고객명}/g, customer.name || '고객');
      const normalizedPhone = normalizePhoneNumber(customer.phone!);

      try {
        // SOLAPI 발송 옵션
        const sendOptions: any = {
          to: normalizedPhone,
          from: '07041380263', // 발신번호 고정
          text: personalizedContent,
          type: messageType,
        };

        // MMS인 경우 이미지 추가 (SOLAPI에서 받은 imageId 사용)
        if (hasImage && imageId) {
          sendOptions.imageId = imageId;
        }

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
            console.log(`[SMS] Delivery status for ${normalizedPhone}:`, statusResult);

            if (statusResult.success) {
              if (statusResult.status === 'SENT') {
                success = true;
              } else if (statusResult.status === 'FAILED') {
                success = false;
                failReason = statusResult.failReason || '발송 실패';
              } else {
                // PENDING - 아직 처리 중, 실패로 표시하지 않고 성공으로 가정
                // (실제 결과는 나중에 확인 필요)
                success = true;
                console.log(`[SMS] Message ${normalizedPhone} still PENDING after 3s, assuming success`);
              }
            } else {
              // 상태 조회 실패 - sentSuccess만 확인 (registeredSuccess는 접수일 뿐)
              console.log(`[SMS] Status query failed for ${normalizedPhone}, checking groupInfo:`, statusResult.error);
              const sentSuccess = groupInfo?.count?.sentSuccess || 0;
              const sentFailed = groupInfo?.count?.sentFailed || 0;
              if (sentSuccess > 0) {
                success = true;
              } else if (sentFailed > 0) {
                success = false;
                failReason = '발송 실패';
              } else {
                // 아직 결과 없음 - PENDING 상태로 가정하고 성공 처리
                success = true;
                console.log(`[SMS] No sent status yet for ${normalizedPhone}, assuming success`);
              }
            }
          } else {
            // SolapiService 없음 - sentSuccess만 확인
            const sentSuccess = groupInfo?.count?.sentSuccess || 0;
            success = sentSuccess > 0;
            if (!success) {
              failReason = 'SOLAPI 서비스 오류';
            }
          }
        } else {
          // groupId 없음 - 실패
          success = false;
          failReason = 'No group ID returned';
        }

        console.log(`[SMS] Final result for ${normalizedPhone}:`, {
          success,
          groupId,
          failReason,
        });

        await prisma.smsMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            customerId: customer.id,
            phone: normalizedPhone,
            content: personalizedContent,
            status: success ? 'SENT' : 'FAILED',
            solapiMessageId: groupInfo?.groupId,
            cost: success ? costPerMessage : 0, // 실패 시 비용 0
            sentAt: success ? new Date() : null,
            failReason: success ? null : (failReason || 'Send failed'),
          },
        });

        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error: any) {
        // API 호출 자체가 실패한 경우
        console.error(`[SMS] Send error for ${normalizedPhone}:`, error.message);

        failedCount++;
        await prisma.smsMessage.create({
          data: {
            campaignId: campaign.id,
            storeId,
            customerId: customer.id,
            phone: normalizedPhone,
            content: personalizedContent,
            status: 'FAILED',
            cost: 0, // 실패 시 비용 0
            failReason: error.message || 'Unknown error',
          },
        });
      }
    }

    // 캠페인 완료 업데이트
    const actualCost = sentCount * costPerMessage;
    await prisma.smsCampaign.update({
      where: { id: campaign.id },
      data: {
        sentCount,
        failedCount,
        totalCost: actualCost,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // 지갑 잔액 차감
    if (actualCost > 0) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { storeId },
          data: { balance: { decrement: actualCost } },
        }),
        prisma.paymentTransaction.create({
          data: {
            storeId,
            amount: actualCost,
            type: 'ALIMTALK_SEND', // SMS_SEND enum 추가 필요시 변경
            status: 'SUCCESS',
            meta: {
              campaignId: campaign.id,
              messageCount: sentCount,
              type: 'SMS',
            },
          },
        }),
      ]);
    }

    res.json({
      success: true,
      campaignId: campaign.id,
      sentCount,
      failedCount,
      totalCost: actualCost,
    });
  } catch (error) {
    console.error('SMS send error:', error);
    res.status(500).json({ error: '문자 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/sms/campaigns - 캠페인 목록 조회
router.get('/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [campaigns, total] = await Promise.all([
      prisma.smsCampaign.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.smsCampaign.count({ where: { storeId } }),
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

// GET /api/sms/campaigns/:id - 캠페인 상세 조회
router.get('/campaigns/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const campaign = await prisma.smsCampaign.findFirst({
      where: { id, storeId },
      include: {
        messages: {
          take: 100,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    }

    res.json(campaign);
  } catch (error) {
    console.error('Campaign detail error:', error);
    res.status(500).json({ error: '캠페인 상세 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/sms/upload-image - MMS 이미지 업로드 및 검증 (SOLAPI에 미리 업로드)
router.post('/upload-image', authMiddleware, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }

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
    const storeId = req.user!.storeId;
    const filename = `${storeId}_${Date.now()}.jpg`;
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

    console.log('[SMS] Uploading image to SOLAPI, filepath:', filepath);

    // SOLAPI 이미지 업로드 (파일 경로 전달)
    const uploadResult = await messageService.uploadFile(filepath, 'MMS');

    console.log('[SMS] SOLAPI upload result:', uploadResult);

    if (!uploadResult?.fileId) {
      // 로컬 파일 삭제
      await fs.promises.unlink(filepath).catch(() => {});
      return res.status(500).json({ error: 'SOLAPI 이미지 업로드에 실패했습니다.' });
    }

    // 이미지 URL 반환 (상대 경로) + SOLAPI imageId
    const imageUrl = `/uploads/mms/${filename}`;

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

// 테스트 발송 일일 제한
const SMS_TEST_SEND_DAILY_LIMIT = 5;

// GET /api/sms/test-count - 오늘 SMS 테스트 발송 횟수 조회
router.get('/test-count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    // 오늘 날짜 범위 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await prisma.smsTestLog.count({
      where: {
        storeId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    res.json({
      count,
      limit: SMS_TEST_SEND_DAILY_LIMIT,
      remaining: Math.max(0, SMS_TEST_SEND_DAILY_LIMIT - count),
    });
  } catch (error) {
    console.error('SMS test count error:', error);
    res.status(500).json({ error: '테스트 횟수 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/sms/test-send - SMS/MMS 테스트 발송 (하루 5회 제한)
router.post('/test-send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
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

    const todayTestCount = await prisma.smsTestLog.count({
      where: {
        storeId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (todayTestCount >= SMS_TEST_SEND_DAILY_LIMIT) {
      return res.status(400).json({
        error: `오늘 테스트 발송 횟수(${SMS_TEST_SEND_DAILY_LIMIT}회)를 모두 사용했습니다.`,
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

    console.log('[SMS Test] Sending test message:', { phone: normalizedPhone, messageType, hasImage });

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
        console.log('[SMS Test] Delivery status:', statusResult);

        if (statusResult.success) {
          if (statusResult.status === 'SENT') {
            success = true;
          } else if (statusResult.status === 'FAILED') {
            success = false;
            failReason = statusResult.failReason || '발송 실패';
          } else {
            // PENDING - 아직 처리 중
            success = true;
            console.log('[SMS Test] Message still PENDING after 3s, assuming success');
          }
        } else {
          // 상태 조회 실패 - sentSuccess만 확인
          console.log('[SMS Test] Status query failed, checking groupInfo:', statusResult.error);
          const sentSuccess = groupInfo?.count?.sentSuccess || 0;
          const sentFailed = groupInfo?.count?.sentFailed || 0;
          if (sentSuccess > 0) {
            success = true;
          } else if (sentFailed > 0) {
            success = false;
            failReason = '발송 실패';
          } else {
            success = true;
            console.log('[SMS Test] No sent status yet, assuming success');
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

    console.log('[SMS Test] Final result:', { success, groupId, failReason });

    if (!success) {
      return res.status(400).json({
        error: failReason || '테스트 발송에 실패했습니다.',
        details: { groupInfo },
      });
    }

    // 테스트 발송 로그 저장
    await prisma.smsTestLog.create({
      data: {
        storeId,
        phone: normalizedPhone,
        content,
        type: messageType,
        hasImage: hasImage,
      },
    });

    res.json({
      success: true,
      message: '테스트 발송이 완료되었습니다.',
      messageType,
      groupId: groupInfo?.groupId,
    });
  } catch (error: any) {
    console.error('SMS test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/sms/history - 전체 발송 내역 조회 (SMS, 알림톡 등 모든 발송)
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { page = '1', limit = '50', status, startDate, endDate, search } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // Build where clause for SMS
    const smsWhere: any = { storeId };
    // Build where clause for AlimTalk
    const alimtalkWhere: any = { storeId };

    // Filter by status
    if (status && status !== 'all') {
      smsWhere.status = status;
      alimtalkWhere.status = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      smsWhere.createdAt = {};
      alimtalkWhere.createdAt = {};
      if (startDate) {
        smsWhere.createdAt.gte = new Date(startDate as string);
        alimtalkWhere.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        smsWhere.createdAt.lte = end;
        alimtalkWhere.createdAt.lte = end;
      }
    }

    // Search by phone or content (SMS only has content, AlimTalk has phone)
    if (search) {
      smsWhere.OR = [
        { phone: { contains: search as string } },
        { content: { contains: search as string } },
      ];
      alimtalkWhere.phone = { contains: search as string };
    }

    // Fetch both SMS messages and AlimTalk logs
    const [smsMessages, alimtalkMessages, smsTotal, alimtalkTotal] = await Promise.all([
      prisma.smsMessage.findMany({
        where: smsWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.alimTalkOutbox.findMany({
        where: alimtalkWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.smsMessage.count({ where: smsWhere }),
      prisma.alimTalkOutbox.count({ where: alimtalkWhere }),
    ]);

    // Get customer info for both
    const smsCustomerIds = [...new Set(smsMessages.filter((m) => m.customerId).map((m) => m.customerId!))] as string[];
    const alimtalkCustomerIds = [...new Set(alimtalkMessages.filter((m) => m.customerId).map((m) => m.customerId!))] as string[];
    const allCustomerIds = [...new Set([...smsCustomerIds, ...alimtalkCustomerIds])];
    const campaignIds = [...new Set(smsMessages.map((m) => m.campaignId))];

    const [customers, campaigns] = await Promise.all([
      allCustomerIds.length > 0
        ? prisma.customer.findMany({
            where: { id: { in: allCustomerIds } },
            select: { id: true, name: true, phone: true },
          })
        : [],
      prisma.smsCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, title: true },
      }),
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

    // AlimTalk type to Korean label
    const alimtalkTypeLabel: Record<string, string> = {
      POINTS_EARNED: '포인트 적립',
      NAVER_REVIEW_REQUEST: '네이버 리뷰 요청',
      LOW_BALANCE: '충전금 부족 안내',
      POINTS_USED: '포인트 사용',
    };

    // Normalize SMS messages
    const normalizedSms = smsMessages.map((m) => ({
      id: m.id,
      phone: m.phone,
      content: m.content,
      status: m.status,
      cost: m.cost,
      failReason: m.failReason,
      sentAt: m.sentAt,
      createdAt: m.createdAt,
      customer: m.customerId ? customerMap.get(m.customerId) || null : null,
      campaign: campaignMap.get(m.campaignId) || null,
      type: 'SMS' as const,
    }));

    // Normalize AlimTalk messages
    const normalizedAlimtalk = alimtalkMessages.map((m) => ({
      id: m.id,
      phone: m.phone,
      content: alimtalkTypeLabel[m.messageType] || m.messageType,
      status: m.status,
      cost: 0, // AlimTalk cost is handled differently
      failReason: m.failReason,
      sentAt: m.sentAt,
      createdAt: m.createdAt,
      customer: m.customerId ? customerMap.get(m.customerId) || null : null,
      campaign: { id: m.id, title: alimtalkTypeLabel[m.messageType] || '알림톡' },
      type: 'ALIMTALK' as const,
    }));

    // Merge and sort by createdAt desc
    const allMessages = [...normalizedSms, ...normalizedAlimtalk]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination to merged results
    const total = smsTotal + alimtalkTotal;
    const skip = (pageNum - 1) * limitNum;
    const paginatedMessages = allMessages.slice(skip, skip + limitNum);

    // Get summary counts (SMS + AlimTalk)
    const [smsStatusCounts, alimtalkStatusCounts] = await Promise.all([
      prisma.smsMessage.groupBy({
        by: ['status'],
        where: { storeId },
        _count: { id: true },
      }),
      prisma.alimTalkOutbox.groupBy({
        by: ['status'],
        where: { storeId },
        _count: { id: true },
      }),
    ]);

    const getSmsCount = (s: string) => smsStatusCounts.find((x) => x.status === s)?._count.id || 0;
    const getAlimtalkCount = (s: string) => alimtalkStatusCounts.find((x) => x.status === s)?._count.id || 0;

    const summary = {
      total: smsStatusCounts.reduce((sum, s) => sum + s._count.id, 0) + alimtalkStatusCounts.reduce((sum, s) => sum + s._count.id, 0),
      sent: getSmsCount('SENT') + getAlimtalkCount('SENT'),
      failed: getSmsCount('FAILED') + getAlimtalkCount('FAILED'),
      pending: getSmsCount('PENDING') + getAlimtalkCount('PENDING') + getAlimtalkCount('RETRY') + getAlimtalkCount('PROCESSING'),
    };

    res.json({
      messages: paginatedMessages,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('SMS history error:', error);
    res.status(500).json({ error: '발송 내역 조회 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/sms/delete-image - 업로드된 이미지 삭제
router.delete('/delete-image', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { filename } = req.body;
    const storeId = req.user!.storeId;

    if (!filename) {
      return res.status(400).json({ error: '파일명이 필요합니다.' });
    }

    // 보안: 파일명이 해당 스토어의 것인지 확인
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

export default router;
