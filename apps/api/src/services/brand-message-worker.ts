import { prisma } from '../lib/prisma.js';
import { SolapiService, BrandMessageButton } from './solapi.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 5000; // 5초마다 폴링
const MIN_AGE_MS = 3000; // 최소 3초 경과한 메시지만 처리

// 브랜드 메시지 비용
const BRAND_MESSAGE_TEXT_COST = 200;
const BRAND_MESSAGE_IMAGE_COST = 230;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

// 글로벌 SOLAPI 서비스 인스턴스
let globalSolapiService: SolapiService | null = null;

function getSolapiService(): SolapiService | null {
  if (globalSolapiService) {
    return globalSolapiService;
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.log(`[BrandMessage Worker] No SOLAPI credentials configured`);
    return null;
  }

  globalSolapiService = new SolapiService(apiKey, apiSecret);
  return globalSolapiService;
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

// 발송 가능 시간 체크 (08:00 ~ 20:50 KST)
function isSendableTime(): boolean {
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  const kstMinute = now.getUTCMinutes();

  if (kstHour < 8) return false;
  if (kstHour > 20) return false;
  if (kstHour === 20 && kstMinute > 50) return false;
  return true;
}

// 단일 메시지 결과 확인
async function processMessage(messageId: string): Promise<void> {
  const msg = await prisma.brandMessage.findUnique({
    where: { id: messageId },
    include: { campaign: true },
  });

  if (!msg || msg.status !== 'PENDING') {
    return;
  }

  if (!msg.solapiGroupId) {
    console.log(`[BrandMessage Worker] Message ${messageId} has no groupId, marking as FAILED`);
    await prisma.brandMessage.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        failReason: 'No SOLAPI group ID',
        cost: 0,
      },
    });
    return;
  }

  const solapiService = getSolapiService();
  if (!solapiService) {
    console.log(`[BrandMessage Worker] SOLAPI service not available`);
    return;
  }

  try {
    const statusResult = await solapiService.getMessageStatus(msg.solapiGroupId, msg.phone);
    console.log(`[BrandMessage Worker] Status for ${msg.phone}:`, statusResult);

    if (!statusResult.success) {
      console.log(`[BrandMessage Worker] Status query failed for message ${messageId}:`, statusResult.error);
      return;
    }

    if (statusResult.status === 'SENT') {
      // 발송 성공
      await prisma.$transaction(async (tx) => {
        await tx.brandMessage.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        await tx.wallet.update({
          where: { storeId: msg.storeId },
          data: { balance: { decrement: msg.cost } },
        });

        await tx.paymentTransaction.create({
          data: {
            storeId: msg.storeId,
            amount: -msg.cost,
            type: 'ALIMTALK_SEND',
            status: 'SUCCESS',
            meta: {
              messageId: messageId,
              campaignId: msg.campaignId,
              phone: msg.phone,
              type: 'BRAND_MESSAGE',
            },
          },
        });

        await tx.brandMessageCampaign.update({
          where: { id: msg.campaignId },
          data: {
            sentCount: { increment: 1 },
            totalCost: { increment: msg.cost },
          },
        });
      });

      console.log(`[BrandMessage Worker] Message ${messageId} sent successfully, cost: ${msg.cost}원 차감`);
    } else if (statusResult.status === 'FAILED') {
      // 발송 실패
      await prisma.$transaction(async (tx) => {
        await tx.brandMessage.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            failReason: statusResult.failReason || '발송 실패',
            cost: 0,
          },
        });

        await tx.brandMessageCampaign.update({
          where: { id: msg.campaignId },
          data: { failedCount: { increment: 1 } },
        });
      });

      console.log(`[BrandMessage Worker] Message ${messageId} FAILED: ${statusResult.failReason}`);
    } else {
      console.log(`[BrandMessage Worker] Message ${messageId} still PENDING, will retry`);
    }
  } catch (error: any) {
    console.error(`[BrandMessage Worker] Error processing message ${messageId}:`, error.message);
  }
}

// 배치 처리 - 발송 결과 확인
async function processPendingMessages(): Promise<number> {
  const minCreatedAt = new Date(Date.now() - MIN_AGE_MS);

  const messages = await prisma.brandMessage.findMany({
    where: {
      status: 'PENDING',
      solapiGroupId: { not: null },
      createdAt: { lte: minCreatedAt },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (messages.length === 0) {
    return 0;
  }

  console.log(`[BrandMessage Worker] Processing ${messages.length} pending messages`);

  for (const msg of messages) {
    await processMessage(msg.id);
  }

  return messages.length;
}

// 예약 발송 처리
async function processScheduledCampaigns(): Promise<void> {
  if (!isSendableTime()) {
    return;
  }

  const now = new Date();

  // 예약 시간이 도래한 캠페인 조회
  const campaigns = await prisma.brandMessageCampaign.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
    },
  });

  if (campaigns.length === 0) {
    return;
  }

  const pfId = process.env.SOLAPI_PF_ID;
  if (!pfId) {
    console.log(`[BrandMessage Worker] No SOLAPI_PF_ID configured`);
    return;
  }

  const solapiService = getSolapiService();
  if (!solapiService) {
    return;
  }

  for (const campaign of campaigns) {
    console.log(`[BrandMessage Worker] Processing scheduled campaign ${campaign.id}`);

    try {
      // 대상 고객 조회 (캠페인 생성 시 저장된 필터 조건 사용)
      const where: any = { storeId: campaign.storeId, phone: { not: null } };

      if (campaign.targetType === 'REVISIT') {
        where.visitCount = { gte: 2 };
      } else if (campaign.targetType === 'NEW') {
        where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      }

      if (campaign.genderFilter && campaign.genderFilter !== 'all') {
        where.gender = campaign.genderFilter;
      }

      if (campaign.ageGroups && Array.isArray(campaign.ageGroups) && campaign.ageGroups.length > 0) {
        const currentYear = new Date().getFullYear();
        const birthYearConditions: any[] = [];
        for (const ageGroup of campaign.ageGroups as string[]) {
          let range: { gte: number; lte: number } | null = null;
          switch (ageGroup) {
            case 'TWENTIES':
              range = { gte: currentYear - 29, lte: currentYear - 20 };
              break;
            case 'THIRTIES':
              range = { gte: currentYear - 39, lte: currentYear - 30 };
              break;
            case 'FORTIES':
              range = { gte: currentYear - 49, lte: currentYear - 40 };
              break;
            case 'FIFTIES':
              range = { gte: currentYear - 59, lte: currentYear - 50 };
              break;
            case 'SIXTY_PLUS':
              range = { gte: 1900, lte: currentYear - 60 };
              break;
          }
          if (range) {
            birthYearConditions.push({ birthYear: range });
          }
        }
        if (birthYearConditions.length > 0) {
          where.OR = birthYearConditions;
        }
      }

      const customers = await prisma.customer.findMany({
        where,
        select: { id: true, name: true, phone: true },
      });

      if (customers.length === 0) {
        await prisma.brandMessageCampaign.update({
          where: { id: campaign.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        console.log(`[BrandMessage Worker] Campaign ${campaign.id} completed (no customers)`);
        continue;
      }

      // 캠페인 상태를 SENDING으로 변경
      await prisma.brandMessageCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENDING' },
      });

      // 개별 메시지 발송
      for (const customer of customers) {
        const personalizedContent = campaign.content.replace(/{고객명}/g, customer.name || '고객');
        const normalizedPhone = normalizePhoneNumber(customer.phone!);

        try {
          const result = await solapiService.sendBrandMessage({
            to: normalizedPhone,
            pfId,
            content: personalizedContent,
            messageType: campaign.messageType as 'TEXT' | 'IMAGE',
            imageId: campaign.imageId || undefined,
            buttons: campaign.buttons as unknown as BrandMessageButton[] | undefined,
          });

          if (result.success && result.groupId) {
            await prisma.brandMessage.create({
              data: {
                campaignId: campaign.id,
                storeId: campaign.storeId,
                customerId: customer.id,
                phone: normalizedPhone,
                content: personalizedContent,
                status: 'PENDING',
                solapiGroupId: result.groupId,
                cost: campaign.costPerMessage,
              },
            });
          } else {
            await prisma.brandMessage.create({
              data: {
                campaignId: campaign.id,
                storeId: campaign.storeId,
                customerId: customer.id,
                phone: normalizedPhone,
                content: personalizedContent,
                status: 'FAILED',
                failReason: result.error || 'Unknown error',
                cost: 0,
              },
            });

            await prisma.brandMessageCampaign.update({
              where: { id: campaign.id },
              data: { failedCount: { increment: 1 } },
            });
          }
        } catch (error: any) {
          console.error(`[BrandMessage Worker] Send error for ${normalizedPhone}:`, error.message);

          await prisma.brandMessage.create({
            data: {
              campaignId: campaign.id,
              storeId: campaign.storeId,
              customerId: customer.id,
              phone: normalizedPhone,
              content: personalizedContent,
              status: 'FAILED',
              failReason: error.message || 'Unknown error',
              cost: 0,
            },
          });

          await prisma.brandMessageCampaign.update({
            where: { id: campaign.id },
            data: { failedCount: { increment: 1 } },
          });
        }
      }

      console.log(`[BrandMessage Worker] Scheduled campaign ${campaign.id} messages sent`);
    } catch (error: any) {
      console.error(`[BrandMessage Worker] Error processing scheduled campaign ${campaign.id}:`, error.message);
    }
  }
}

// 캠페인 완료 상태 업데이트
async function updateCampaignStatus(): Promise<void> {
  const sendingCampaigns = await prisma.brandMessageCampaign.findMany({
    where: { status: 'SENDING' },
    select: { id: true },
  });

  for (const campaign of sendingCampaigns) {
    const pendingCount = await prisma.brandMessage.count({
      where: { campaignId: campaign.id, status: 'PENDING' },
    });

    if (pendingCount === 0) {
      await prisma.brandMessageCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      console.log(`[BrandMessage Worker] Campaign ${campaign.id} completed`);
    }
  }
}

// 워커 시작
export function startBrandMessageWorker(): void {
  if (isRunning) {
    console.log('[BrandMessage Worker] Worker already running');
    return;
  }

  isRunning = true;
  console.log('[BrandMessage Worker] Starting worker...');

  const poll = async () => {
    if (!isRunning) return;

    try {
      // 1. 예약 발송 처리
      await processScheduledCampaigns();

      // 2. PENDING 메시지 결과 확인
      const processed = await processPendingMessages();
      if (processed > 0) {
        console.log(`[BrandMessage Worker] Processed ${processed} messages`);
      }

      // 3. 캠페인 상태 업데이트
      await updateCampaignStatus();
    } catch (error) {
      console.error('[BrandMessage Worker] Error in poll cycle:', error);
    }
  };

  // 즉시 한 번 실행
  poll();

  // 주기적으로 폴링
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

// 워커 중지
export function stopBrandMessageWorker(): void {
  if (!isRunning) return;

  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log('[BrandMessage Worker] Worker stopped');
}

// 캐시 초기화
export function clearBrandMessageWorkerCache(): void {
  globalSolapiService = null;
}
