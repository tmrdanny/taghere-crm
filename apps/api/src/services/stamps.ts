/**
 * 스탬프 자동 적립 (카카오 로그인 후) - 도메인 서비스
 *
 * routes/taghere.ts 의 POST /api/taghere/stamp-earn 이 사용한다.
 * 응답 매핑은 라우트에 남기고, 여기서는 도메인 로직만 수행한다.
 * (place-booster-service.ts 의 BoosterError 패턴을 따른다)
 */

import { prisma } from '../lib/prisma.js';
import { enqueueStampEarnedAlimTalk, enqueueHitejinroStampEarnedAlimTalk } from './solapi.js';
import { checkMilestoneAndDraw, buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';
import { fetchOrder, TaghereOrderData } from './taghere-api.js';
import { sidoToShort } from '../utils/address-parser.js';
import { findCustomerProfileByKakaoId } from './customer-identity.js';
import {
  buildPendingStampAccrualData,
  DEFERRED_STAMP_REASON_PREFIX,
  findPendingStampAccrual,
  hasTodayPendingStampAccrual,
  isPendingStampAccrualConflict,
} from './pending-stamp-accrual.js';

// 방문경로 24시간 내 응답 여부 체크
export function isVisitSourceRecent(updatedAt: Date | null | undefined): boolean {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 24 * 60 * 60 * 1000;
}

/**
 * 에러 응답용 — 라우트가 { success: false, error: code, message, ...extra } 로 매핑한다.
 */
export class StampEarnError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export interface StampEarnInput {
  kakaoId?: string;
  slug?: string;
  earnMethod: string;
  isHitejinro?: boolean;
  count?: unknown;
  ordersheetId?: string;
  /** 링크 스캔 토큰 (req.body.t) */
  t?: unknown;
}

export type StampEarnResult =
  | {
      kind: 'MANUAL_PENDING';
      requestId: string;
      storeName: string;
    }
  | {
      kind: 'FRANCHISE_EARNED';
      currentStamps: number;
      customerId: string;
      storeName: string;
      franchiseName: string;
      isNewCustomer: boolean;
      hasVisitSource: boolean;
      rewards: RewardEntry[];
      drawnReward: string | null;
      drawnRewardTier: number | null;
    }
  | {
      kind: 'EARNED';
      deferred: boolean;
      currentStamps: number;
      customerId: string;
      storeName: string;
      isNewCustomer: boolean;
      hasVisitSource: boolean;
      rewards: RewardEntry[];
      legacy: Record<string, any>;
      drawnReward: string | null;
      drawnRewardTier: number | null;
    };

export async function earnStamp(input: StampEarnInput): Promise<StampEarnResult> {
  const { kakaoId, slug, earnMethod, isHitejinro, count, ordersheetId } = input;

  // 1. 파라미터 검증
  if (!kakaoId || !slug) {
    throw new StampEarnError('missing_params', 'kakaoId와 slug가 필요합니다.');
  }

  // kakaoId 형식 검증 (숫자 문자열)
  if (!/^\d+$/.test(kakaoId)) {
    throw new StampEarnError('invalid_kakao_id', '유효하지 않은 kakaoId입니다.');
  }

  console.log(`[TagHere Stamp-Earn] Request - kakaoId: ${kakaoId}, slug: ${slug}, earnMethod: ${earnMethod}`);

  // 2. 매장 조회
  const store = await prisma.store.findFirst({
    where: { slug },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      stampSetting: true,
      franchiseStampEnabled: true,
      franchiseId: true,
      taghereVersion: true,
      addressSido: true,
      addressSigungu: true,
      franchise: {
        select: {
          id: true,
          name: true,
          franchiseStampSetting: true,
        },
      },
      reviewAutomationSetting: {
        select: { benefitText: true },
      },
    },
  });

  if (!store) {
    throw new StampEarnError('store_not_found', '매장을 찾을 수 없습니다.', 404);
  }

  // 프랜차이즈 통합 스탬프 모드 판별
  const isFranchiseStampMode = !!(
    store.franchiseStampEnabled &&
    store.franchiseId &&
    store.franchise?.franchiseStampSetting
  );

  // 3. 스탬프 기능 활성화 확인
  // 하이트진로 전용 링크는 매장 스탬프 설정과 무관하게 적립 허용
  if (!isHitejinro && !isFranchiseStampMode && !store.stampSetting?.enabled) {
    throw new StampEarnError('stamp_disabled', '스탬프 기능이 비활성화되어 있습니다.');
  }

  // 매번 적립 개수 직접 입력 모드 (하이트진로/프랜차이즈 통합 제외)
  // → 고객이 개수를 입력하지 않는다. 적립 요청(PENDING)을 만들고 CRM 대시보드에서
  //   직원이 개수를 입력해 승인/취소한다. 하루 1회 제한 해제, 첫 방문 보너스 무시.
  const manualMode = !isHitejinro && !isFranchiseStampMode && !!store.stampSetting?.manualStampCountEnabled;
  const manualCount = 1; // manualMode에서는 승인 시점에 직원이 입력한 개수를 사용
  void count; // 레거시 클라이언트가 보내는 count는 무시 (고객 입력값 신뢰 안 함)

  // 링크 스캔 토큰 가드 — standalone(주문 미연동) 스탬프 링크에 기본 적용 (선택 아님).
  // 프랜차이즈 통합 스탬프 포함, 하이트진로/매번개수입력만 제외.
  // 유효·미소비 토큰이 있을 때만 적립 허용. 원자적 소비는 적립 트랜잭션에서 수행.
  const scanGuardActive = !ordersheetId && !isHitejinro && !manualMode;
  const scanToken: string | undefined =
    typeof input.t === 'string' && input.t ? input.t : undefined;
  if (scanGuardActive) {
    // 부작용(고객 생성) 전 조기 검증 — 명백히 무효면 여기서 차단.
    const tok = scanToken
      ? await prisma.stampScanToken.findUnique({ where: { id: scanToken } })
      : null;
    if (!tok || tok.storeId !== store.id || tok.status !== 'PENDING' || tok.expiresAt <= new Date()) {
      throw new StampEarnError('invalid_token', '링크가 만료되었어요. 매장에서 다시 스캔해주세요.');
    }

    // 위치 기반 적립 확인 (매장별 토글, 기본 OFF): 토큰에 위치 검증 기록이 있어야 적립 가능.
    // 검증은 stamp-scan-verify-location에서 서버가 수행·기록 → 클라이언트 위조 불가.
    const locationGuardActive =
      !!store.stampSetting?.locationGuardEnabled &&
      store.latitude != null &&
      store.longitude != null;
    if (locationGuardActive && !tok.locationVerified) {
      throw new StampEarnError('location_required', '매장 내부에서만 스탬프를 적립할 수 있어요.');
    }
  }

  // 4. kakaoId로 해당 매장의 고객 조회
  let customer = await prisma.customer.findFirst({
    where: {
      storeId: store.id,
      kakaoId,
    },
  });

  let isNewCustomer = false;

  // 5. 고객 없으면 다른 매장에서 같은 kakaoId 고객 정보 찾아서 복사
  if (!customer) {
    isNewCustomer = true;

    const { existingCustomer, phone: phoneToUse, phoneLastDigits: phoneLastDigitsToUse } =
      await findCustomerProfileByKakaoId({
        storeId: store.id,
        kakaoId,
        onPhoneConflict: () => {
          console.log(`[TagHere Stamp-Earn] Phone already exists in store, skipping phone copy - storeId: ${store.id}`);
        },
      });

    customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        kakaoId,
        name: existingCustomer?.name ?? null,
        phone: phoneToUse,
        phoneLastDigits: phoneLastDigitsToUse,
        gender: existingCustomer?.gender ?? null,
        birthday: existingCustomer?.birthday ?? null,
        birthYear: existingCustomer?.birthYear ?? null,
        totalPoints: 0,
        totalStamps: 0,
        visitCount: 0,
        consentMarketing: true,
        consentKakao: true,
        consentAt: new Date(),
        regionSido: sidoToShort(store.addressSido) ?? null,
        regionSigungu: store.addressSigungu ?? null,
      },
    });

    console.log(`[TagHere Stamp-Earn] New customer created - customerId: ${customer.id}, storeId: ${store.id}`);
  }

  // 이 주문에 이미 지연 적립 예약이 있으면 "오늘 이미 적립"이 아니라 "예약됨"으로 안내해야 한다.
  // 일일 제한 판정도 이 예약을 적립으로 세므로 먼저 조회해 둔다.
  const existingStampPending = ordersheetId
    ? await findPendingStampAccrual(store.id, ordersheetId)
    : null;
  if (existingStampPending?.status === 'PENDING') {
    // 예약을 소유한 고객 본인의 재요청만 "예약됨"이다.
    if (existingStampPending.customerId === customer.id) {
      throw new StampEarnError('already_reserved', '결제 완료 후 적립될 예약이 있습니다.');
    }
    // 다른 고객이 이미 예약한 주문 — 이 고객에게는 적립이 가지 않으므로 예약 안내는 오안내다.
    // 통과시키면 재예약이 (storeId, orderId) 유니크로 P2002 를 내고 예약 안내로 오흡수되므로,
    // 즉시 적립 경로의 "이미 적립된 주문"과 같은 확정 응답으로 여기서 명시 반환한다.
    throw new StampEarnError('already_earned_order', '이미 적립된 주문입니다.');
  }

  // 6. 일일 적립 제한 확인 (1일 1회) - 프랜차이즈 모드는 위에서 처리
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (!isFranchiseStampMode && !manualMode) {
    const todayEarn = await prisma.stampLedger.findFirst({
      where: {
        storeId: store.id,
        customerId: customer.id,
        type: 'EARN',
        createdAt: { gte: todayStart },
        // 지연 전환분은 createdAt 이 결제완료 시각이라 "오늘 적립" 판정 근거가 될 수 없다.
        // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
        OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_STAMP_REASON_PREFIX } } }],
      },
    });

    // 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 같은 날 재적립을 막을 수 있다.
    if (todayEarn || (await hasTodayPendingStampAccrual(store.id, customer.id))) {
      // rewards JSON 기반 보상 정보
      const alreadyRewards: RewardEntry[] = store.stampSetting!.rewards
        ? (store.stampSetting!.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(store.stampSetting as any);
      const alreadyLegacy: Record<string, any> = {};
      for (const r of alreadyRewards) {
        alreadyLegacy[`reward${r.tier}Description`] = r.description;
      }

      throw new StampEarnError('already_earned_today', '오늘 이미 스탬프를 적립했습니다.', 400, {
        alreadyEarned: true,
        currentStamps: customer.totalStamps,
        rewards: alreadyRewards,
        ...alreadyLegacy,
      });
    }
  }

  // 7. 태그히어 연동 시 중복 체크
  if (ordersheetId) {
    const existingEarn = await prisma.stampLedger.findFirst({
      where: { ordersheetId },
    });
    if (existingEarn) {
      throw new StampEarnError('already_earned_order', '이미 적립된 주문입니다.');
    }

    // 전환(ACCRUED)된 예약은 EARN 원장이 남아 위에서 이미 걸린다. 취소(CANCELED)된 예약은
    // 재적립 대상이 아니지만 재예약 시 (storeId, orderId) 유니크를 위반하므로 여기서 막는다.
    // (PENDING 은 위 일일 제한 앞에서 already_reserved 로 먼저 반환된다)
    if (existingStampPending?.status === 'CANCELED') {
      throw new StampEarnError('accrual_canceled', '취소된 주문입니다.', 409);
    }
  }

  // 7-1. ordersheetId가 있으면 TagHere API에서 주문 데이터 조회 (V1/V2 자동 분기)
  let orderData: TaghereOrderData | null = null;
  let tableLabel: string | null = null;
  let orderItems: any[] = [];
  let totalAmount: number | null = null;

  if (ordersheetId) {
    try {
      orderData = await fetchOrder(ordersheetId, store.taghereVersion);
      if (orderData) {
        const rawPrice = orderData.content?.resultPrice || orderData.resultPrice ||
                         orderData.content?.totalPrice || orderData.totalPrice || 0;
        const parsedAmount = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : Number(rawPrice) || 0;
        totalAmount = parsedAmount > 0 ? parsedAmount : null;

        const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
        orderItems = rawItems.map((item: any) => ({
          name: item.label || item.name || item.menuName || item.productName ||
                item.title || item.itemName || item.menuTitle || null,
          quantity: item.count || item.quantity || item.qty || item.amount || 1,
          price: typeof item.price === 'string' ? parseInt(item.price, 10) :
                 (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
          option: item.option || null,
        }));

        // tableLabel 추출 (여러 필드 확인)
        tableLabel = orderData.content?.tableLabel || orderData.tableLabel ||
                     (orderData as any).content?.tableNumber || (orderData as any).tableNumber || null;

        // tableLabel이 없으면 tableID 확인 (짧은 숫자면 테이블 번호로 사용)
        if (!tableLabel) {
          const tableID = (orderData as any).tableID || (orderData as any).content?.tableID;
          // tableID가 짧은 문자열이면 테이블 번호로 사용 (MongoDB ObjectId는 24자)
          if (tableID && typeof tableID === 'string' && tableID.length < 10) {
            tableLabel = tableID;
          }
        }

        console.log(`[TagHere Stamp-Earn] Order data fetched - ordersheetId: ${ordersheetId}, tableLabel: ${tableLabel}, tableID: ${(orderData as any).tableID}, itemsCount: ${orderItems.length}`);
      }
    } catch (e) {
      console.error('[TagHere Stamp-Earn] Failed to fetch ordersheet:', e);
      // 조회 실패해도 스탬프 적립은 계속 진행
    }
  }

  // ============================================
  // 매번 적립 개수 직접 입력 모드 → 관리자 승인 대기 요청 생성
  // ============================================
  if (manualMode) {
    const now = new Date();

    // 이미 대기 중인 요청이 있으면 재사용 (더블탭/새로고침 멱등)
    const existingReq = await prisma.stampApprovalRequest.findFirst({
      where: {
        storeId: store.id,
        customerId: customer.id,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
    });
    if (existingReq) {
      return {
        kind: 'MANUAL_PENDING',
        requestId: existingReq.id,
        storeName: store.name,
      };
    }

    const request = await prisma.stampApprovalRequest.create({
      data: {
        storeId: store.id,
        customerId: customer!.id,
        ordersheetId: ordersheetId || null,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });

    // 방문 자체는 요청 시점에 기록 (스탬프는 승인 시 적립).
    // 취소/만료 후 재시도 시 (storeId, orderId) 유니크 충돌·방문 중복 집계를 막기 위해
    // 이미 기록된 방문(같은 주문 or 같은 고객의 최근 1시간 내 요청)이 있으면 건너뛴다.
    // 방문 기록 실패가 적립 요청 자체를 막지 않도록 요청 생성과 분리 (best-effort).
    try {
      const priorVisit = ordersheetId
        ? await prisma.visitOrOrder.findFirst({
            where: { storeId: store.id, orderId: ordersheetId },
            select: { id: true },
          })
        : await prisma.stampApprovalRequest.findFirst({
            where: {
              storeId: store.id,
              customerId: customer.id,
              id: { not: request.id },
              createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
            },
            select: { id: true },
          });
      if (!priorVisit) {
        await prisma.$transaction([
          prisma.customer.update({
            where: { id: customer.id },
            data: { lastVisitAt: now, visitCount: { increment: 1 } },
          }),
          prisma.visitOrOrder.create({
            data: {
              storeId: store.id,
              customerId: customer.id,
              orderId: ordersheetId || null,
              visitedAt: now,
              totalAmount: totalAmount,
              items: orderItems.length > 0 || tableLabel ? {
                items: orderItems,
                tableNumber: tableLabel,
              } : undefined,
            },
          }),
        ]);
      }
    } catch (visitErr: any) {
      // P2002(동시 요청 경합 등) 포함 — 방문 기록은 best-effort
      console.error('[TagHere Stamp-Earn] Visit record skipped:', visitErr?.code || visitErr?.message);
    }

    console.log(`[TagHere Stamp-Earn] Approval request created - requestId: ${request.id}, customerId: ${customer.id}, storeId: ${store.id}`);

    return {
      kind: 'MANUAL_PENDING',
      requestId: request.id,
      storeName: store.name,
    };
  }

  // ============================================
  // 프랜차이즈 통합 스탬프 모드
  // ============================================
  if (isFranchiseStampMode) {
    const franchiseId = store.franchiseId!;
    const franchiseStampSetting = store.franchise!.franchiseStampSetting!;
    const franchiseName = store.franchise!.name;

    // FranchiseCustomer upsert
    let franchiseCustomer = await prisma.franchiseCustomer.findUnique({
      where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
    });

    // 1일 1회 제한 체크 (프랜차이즈 통합)
    if (franchiseCustomer) {
      const todayFranchiseEarn = await prisma.franchiseStampLedger.findFirst({
        where: {
          franchiseCustomerId: franchiseCustomer.id,
          storeId: store.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
        },
      });

      if (todayFranchiseEarn) {
        const alreadyRewards: RewardEntry[] = franchiseStampSetting.rewards
          ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(franchiseStampSetting as any);
        throw new StampEarnError('already_earned_today', '오늘 이미 스탬프를 적립했습니다.', 400, {
          alreadyEarned: true,
          currentStamps: franchiseCustomer.totalStamps,
          storeName: store.name,
          franchiseName,
          rewards: alreadyRewards,
        });
      }
    }

    if (!franchiseCustomer) {
      franchiseCustomer = await prisma.franchiseCustomer.create({
        data: {
          franchiseId,
          kakaoId,
          phone: customer!.phone || null,
          name: customer!.name || null,
        },
      });
    }

    // 매장 Customer 방문수만 업데이트
    await prisma.customer.update({
      where: { id: customer!.id },
      data: {
        lastVisitAt: new Date(),
        visitCount: { increment: 1 },
      },
    });

    // 주문 내역 (매장 레벨)
    await prisma.visitOrOrder.create({
      data: {
        storeId: store.id,
        customerId: customer!.id,
        orderId: ordersheetId || null,
        visitedAt: new Date(),
        totalAmount: totalAmount,
        items: orderItems.length > 0 || tableLabel ? {
          items: orderItems,
          tableNumber: tableLabel,
        } : undefined,
      },
    });

    // 프랜차이즈 통합 스탬프 적립
    const previousFranchiseStamps = franchiseCustomer.totalStamps;
    const newFranchiseBalance = previousFranchiseStamps + 1;

    let franchiseResult;
    try {
      franchiseResult = await prisma.$transaction(async (tx) => {
      // 링크 스캔 토큰 원자적 소비 (낙관적 락) — 프랜차이즈 통합 경로도 동일 적용
      if (scanGuardActive && scanToken) {
        const consumed = await tx.stampScanToken.updateMany({
          where: { id: scanToken, status: 'PENDING', expiresAt: { gt: new Date() } },
          data: { status: 'CONSUMED', consumedAt: new Date(), consumedByCustomerId: customer!.id },
        });
        if (consumed.count !== 1) {
          throw new Error('SCAN_TOKEN_INVALID');
        }
      }

      const updated = await tx.franchiseCustomer.update({
        where: { id: franchiseCustomer!.id },
        data: {
          totalStamps: newFranchiseBalance,
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          phone: customer!.phone || franchiseCustomer!.phone || undefined,
          name: customer!.name || franchiseCustomer!.name || undefined,
        },
      });

      const ledger = await tx.franchiseStampLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId: franchiseCustomer!.id,
          storeId: store.id,
          type: 'EARN',
          delta: 1,
          balance: newFranchiseBalance,
          ordersheetId: ordersheetId || null,
          earnMethod: earnMethod as any,
          reason: ordersheetId ? `태그히어 주문 적립 (${ordersheetId})` : '스탬프 적립 (통합)',
        },
      });

      const milestoneResult = checkMilestoneAndDraw(
        previousFranchiseStamps,
        newFranchiseBalance,
        franchiseStampSetting as any,
      );
      if (milestoneResult) {
        await tx.franchiseStampLedger.update({
          where: { id: ledger.id },
          data: {
            drawnReward: milestoneResult.reward,
            drawnRewardTier: milestoneResult.tier,
          },
        });
      }

      return { customer: updated, ledger, milestoneResult };
      });
    } catch (txErr: any) {
      if (txErr?.message === 'SCAN_TOKEN_INVALID') {
        throw new StampEarnError('invalid_token', '링크가 만료되었어요. 매장에서 다시 스캔해주세요.');
      }
      throw txErr;
    }

    console.log(`[TagHere Stamp-Earn] Franchise stamp earned - franchiseCustomerId: ${franchiseCustomer.id}, newBalance: ${franchiseResult.customer.totalStamps}${franchiseResult.milestoneResult ? `, milestone: ${franchiseResult.milestoneResult.tier}개` : ''}`);

    // 알림톡
    // 하이트진로 전용 링크: alimtalkEnabled 설정과 무관하게 발송
    const phoneNumber = customer!.phone?.replace(/[^0-9]/g, '');
    if ((isHitejinro || franchiseStampSetting.alimtalkEnabled) && phoneNumber) {
      const rewardsForAlimtalk: RewardEntry[] = franchiseStampSetting.rewards
        ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(franchiseStampSetting as any);
      const rules = rewardsForAlimtalk
        .sort((a, b) => a.tier - b.tier)
        .map(r => {
          const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
          return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
        });
      const stampUsageRule = rules.length > 0
        ? '\n' + rules.join('\n')
        : '\n- 10개 모을시 매장 선물 증정!';

      if (isHitejinro) {
        // 하이트진로 전용 템플릿
        enqueueHitejinroStampEarnedAlimTalk({
          storeId: store.id,
          customerId: customer!.id,
          stampLedgerId: franchiseResult.ledger.id,
          phone: phoneNumber,
          variables: {
            storeName: `${franchiseName} ${store.name}`,
            earnedStamps: 1,
            totalStamps: franchiseResult.customer.totalStamps,
            stampRewards: stampUsageRule,
          },
        }).catch((err) => {
          console.error('[TagHere Stamp-Earn] HiteJinro Franchise Stamp AlimTalk enqueue failed:', err);
        });
      } else {
        const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';
        enqueueStampEarnedAlimTalk({
          storeId: store.id,
          customerId: customer!.id,
          stampLedgerId: franchiseResult.ledger.id,
          phone: phoneNumber,
          variables: {
            storeName: `${franchiseName} ${store.name}`,
            earnedStamps: 1,
            totalStamps: franchiseResult.customer.totalStamps,
            stampUsageRule,
            reviewGuide,
          },
          skipAlimtalkCheck: true,
        }).catch((err) => {
          console.error('[TagHere Stamp-Earn] Franchise Stamp AlimTalk enqueue failed:', err);
        });
      }
    }

    // 성공 응답
    const successRewards: RewardEntry[] = franchiseStampSetting.rewards
      ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(franchiseStampSetting as any);

    return {
      kind: 'FRANCHISE_EARNED',
      currentStamps: franchiseResult.customer.totalStamps,
      customerId: customer!.id,
      storeName: store.name,
      franchiseName,
      isNewCustomer,
      hasVisitSource: isVisitSourceRecent(customer!.visitSourceUpdatedAt),
      rewards: successRewards,
      drawnReward: franchiseResult.milestoneResult?.reward || null,
      drawnRewardTier: franchiseResult.milestoneResult?.tier || null,
    };
  }

  // ============================================
  // 기존 매장 개별 스탬프 적립
  // ============================================

  // 8. 스탬프 적립 (트랜잭션) - 스탬프 적립 시 무조건 방문횟수 +1
  const previousStamps = customer!.totalStamps ?? 0;
  const isFirstEarn = (customer!.visitCount ?? 0) === 0;
  const firstStampCount = store.stampSetting?.firstStampBonus ?? 1;
  // 수동 개수 모드: 입력한 개수만 적립 (첫 방문 보너스 무시)
  const stampDelta = manualMode
    ? manualCount
    : (isFirstEarn && firstStampCount > 1 ? firstStampCount : 1);
  // 후불 + 결제완료 감지 가능 POS 주문은 실제 적립을 결제완료 시점까지 미룬다.
  // (manual/프랜차이즈 통합은 위 분기에서 이미 반환됐고, 하이트진로 링크는 지연 대상이 아니다)
  // 포인트 게이트와 달리 !store.metacityEnabled 를 보지 않는다 — 메타씨티는 포인트 전용 연동이고
  // 스탬프는 CRM 네이티브라 메타씨티 매장에서도 지연 적립 대상이다.
  const shouldDeferStamp =
    orderData?.pointAccrualDeferred === true && !!ordersheetId && !isHitejinro;
  console.log(`[TagHere Stamp-Earn] Before transaction - customerId: ${customer!.id}, previousStamps: ${previousStamps}${stampDelta > 1 ? `, firstStampCount: ${stampDelta}` : ''}${shouldDeferStamp ? ', deferred: true' : ''}`);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    const newBalance = previousStamps + stampDelta;

    // 링크 스캔 토큰 원자적 소비 (낙관적 락: PENDING & 미만료인 경우에만 count===1)
    // 더블탭·동시요청·경합 시 1회만 적립되도록 ledger 생성 전에 소비.
    if (scanGuardActive && scanToken) {
      const consumed = await tx.stampScanToken.updateMany({
        where: { id: scanToken, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'CONSUMED', consumedAt: new Date(), consumedByCustomerId: customer!.id },
      });
      if (consumed.count !== 1) {
        throw new Error('SCAN_TOKEN_INVALID');
      }
    }

    // 고객 스탬프 업데이트
    const updatedCustomer = await tx.customer.update({
      where: { id: customer!.id },
      data: {
        // 지연 적립이면 잔액은 그대로 두고 방문 통계만 갱신한다.
        ...(!shouldDeferStamp && { totalStamps: newBalance }),
        lastVisitAt: new Date(),
        visitCount: { increment: 1 },
      },
    });

    // 지연 대상이면 EARN 원장/잔액/추첨을 만들지 않고 예약 행만 남긴다.
    if (shouldDeferStamp) {
      await tx.pendingStampAccrual.create({
        data: buildPendingStampAccrualData({
          storeId: store.id,
          customerId: customer!.id,
          orderId: ordersheetId,
          stampDelta,
          earnMethod: earnMethod as any,
          tableLabel,
          // 이 경로는 원래 항상 적립 알림톡을 보냈다 → 전환 시점에 발송.
          sendAlimtalk: true,
          source: 'IN_APP',
        }),
      });
    }

    // 거래 내역 기록
    const ledger = shouldDeferStamp ? null : await tx.stampLedger.create({
      data: {
        storeId: store.id,
        customerId: customer!.id,
        type: 'EARN',
        delta: stampDelta,
        balance: newBalance,
        ordersheetId: ordersheetId || null,
        earnMethod: earnMethod as any,
        tableLabel: tableLabel,
        reason: manualMode
          ? `스탬프 적립 (${stampDelta}개)`
          : (stampDelta > 1
            ? `첫 방문 스탬프 적립 (${stampDelta}개)`
            : (ordersheetId ? `태그히어 주문 적립 (${ordersheetId})` : '스탬프 적립')),
      },
    });

    // 방문/주문 내역 생성 (ordersheetId 유무와 관계없이 항상 생성)
    const visitOrOrderData = {
      storeId: store.id,
      customerId: customer!.id,
      orderId: ordersheetId || null,
      visitedAt: new Date(),
      totalAmount: totalAmount,
      items: orderItems.length > 0 || tableLabel ? {
        items: orderItems,
        tableNumber: tableLabel,
      } : undefined,
    };
    // 지연 예약 분기는 같은 주문의 방문 기록이 이미 있을 수 있다(포인트 예약 등 다른 경로가 먼저 생성).
    // create 로 두면 (storeId, orderId) 유니크가 터져 예약 트랜잭션이 통째로 롤백되고,
    // 아래 P2002 흡수가 "예약됨"으로 삼켜 스탬프가 조용히 유실된다 → 포인트 예약 경로와 같은 upsert.
    // (즉시 적립 경로는 기존 create 유지)
    if (shouldDeferStamp) {
      await tx.visitOrOrder.upsert({
        where: { storeId_orderId: { storeId: store.id, orderId: ordersheetId! } },
        update: {},
        create: visitOrOrderData,
      });
    } else {
      await tx.visitOrOrder.create({ data: visitOrOrderData });
    }

    // 마일스톤 도달 시 보상 추첨
    // 지연 적립이면 전환 시점(finalizePendingStampAccrual)에서 추첨한다.
    const milestoneResult = ledger
      ? checkMilestoneAndDraw(previousStamps, newBalance, store.stampSetting!)
      : null;
    if (ledger && milestoneResult) {
      await tx.stampLedger.update({
        where: { id: ledger.id },
        data: {
          drawnReward: milestoneResult.reward,
          drawnRewardTier: milestoneResult.tier,
        },
      });
    }

    return { customer: updatedCustomer, ledger, milestoneResult };
    });
  } catch (txErr: any) {
    // 스캔 토큰 소비 실패(경합/만료) → 적립 롤백, 다시 스캔 안내
    if (txErr?.message === 'SCAN_TOKEN_INVALID') {
      throw new StampEarnError('invalid_token', '링크가 만료되었어요. 매장에서 다시 스캔해주세요.');
    }
    // 예약 행은 (storeId, orderId) 유니크라 더블탭·동시 요청에서 진 쪽이 P2002 로 롤백된다.
    // 예약 자체는 이긴 쪽이 이미 만들어 놨으므로 500 대신 선조회 가드와 같은 안내로 흡수한다.
    // (지연 분기에서만 흡수 — 즉시 적립 경로의 다른 유니크 위반은 그대로 500 으로 남긴다)
    // 예약 유니크가 아닌 P2002(예: 방문 기록)는 흡수하면 스탬프가 조용히 유실되므로 그대로 던진다.
    if (
      shouldDeferStamp &&
      txErr?.code === 'P2002' &&
      (await isPendingStampAccrualConflict(txErr, store.id, ordersheetId!))
    ) {
      console.log(`[TagHere Stamp-Earn] 동시 예약 생성 감지, 멱등 응답 - ordersheetId: ${ordersheetId}`);
      throw new StampEarnError('already_reserved', '결제 완료 후 적립될 예약이 있습니다.');
    }
    throw txErr;
  }

  if (shouldDeferStamp) {
    console.log(`[TagHere Stamp-Earn] Stamp accrual reserved - customerId: ${customer.id}, ordersheetId: ${ordersheetId}, stampDelta: ${stampDelta}`);
  } else {
    console.log(`[TagHere Stamp-Earn] Stamp earned - customerId: ${customer.id}, newBalance: ${result.customer.totalStamps}, orderItemsCount: ${orderItems.length}, tableLabel: ${tableLabel}${result.milestoneResult ? `, milestone: ${result.milestoneResult.tier}개 - ${result.milestoneResult.reward}` : ''}`);
  }

  // 9. 알림톡 발송 (비동기)
  // 하이트진로 전용 링크: alimtalkEnabled 설정과 무관하게 발송
  // 지연 적립은 여기서 보내지 않는다 — 실제 적립 시점(finalizePendingStampAccrual)에서 발송.
  const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
  const stampLedgerId = result.ledger?.id;
  const shouldSendAlimtalk = !stampLedgerId
    ? false
    : isHitejinro
      ? !!phoneNumber
      : !!(store.stampSetting?.alimtalkEnabled && phoneNumber);

  if (shouldSendAlimtalk) {
    // 하이트진로: 프랜차이즈 통합 스탬프 보상 설정에서 가져옴
    let rewardsForAlimtalk: RewardEntry[];
    if (isHitejinro && store.franchise?.franchiseStampSetting) {
      const fss = store.franchise.franchiseStampSetting;
      rewardsForAlimtalk = fss.rewards
        ? (fss.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(fss as any);
    } else {
      rewardsForAlimtalk = store.stampSetting?.rewards
        ? (store.stampSetting.rewards as unknown as RewardEntry[])
        : store.stampSetting ? buildRewardsFromLegacy(store.stampSetting as any) : [];
    }
    const rules = rewardsForAlimtalk
      .sort((a, b) => a.tier - b.tier)
      .map(r => {
        const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
        return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
      });
    const stampUsageRule = rules.length > 0
      ? '\n' + rules.join('\n')
      : '\n- 10개 모을시 매장 선물 증정!';

    if (isHitejinro) {
      // 하이트진로 전용 템플릿
      enqueueHitejinroStampEarnedAlimTalk({
        storeId: store.id,
        customerId: customer.id,
        stampLedgerId: stampLedgerId!,
        phone: phoneNumber!,
        variables: {
          storeName: store.name,
          earnedStamps: stampDelta,
          totalStamps: result.customer.totalStamps,
          stampRewards: stampUsageRule,
        },
      }).catch((err) => {
        console.error('[TagHere Stamp-Earn] HiteJinro Stamp AlimTalk enqueue failed:', err);
      });
    } else {
      const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';
      enqueueStampEarnedAlimTalk({
        storeId: store.id,
        customerId: customer.id,
        stampLedgerId: stampLedgerId!,
        phone: phoneNumber!,
        variables: {
          storeName: store.name,
          earnedStamps: stampDelta,
          totalStamps: result.customer.totalStamps,
          stampUsageRule,
          reviewGuide,
        },
      }).catch((err) => {
        console.error('[TagHere Stamp-Earn] Stamp AlimTalk enqueue failed:', err);
      });
    }
  }

  // 10. 성공 응답
  const successRewards: RewardEntry[] = store.stampSetting!.rewards
    ? (store.stampSetting!.rewards as unknown as RewardEntry[])
    : buildRewardsFromLegacy(store.stampSetting as any);
  const successLegacy: Record<string, any> = {};
  for (const entry of successRewards) {
    successLegacy[`reward${entry.tier}Description`] = entry.description;
    successLegacy[`reward${entry.tier}IsRandom`] = entry.options && Array.isArray(entry.options) && entry.options.length > 1;
  }

  return {
    kind: 'EARNED',
    deferred: shouldDeferStamp,
    // 지연 적립이면 잔액이 아직 안 움직였으므로 currentStamps 는 기존 잔액 그대로다.
    currentStamps: result.customer.totalStamps,
    customerId: customer.id,
    storeName: store.name,
    isNewCustomer,
    hasVisitSource: isVisitSourceRecent(customer.visitSourceUpdatedAt),
    rewards: successRewards,
    legacy: successLegacy,
    drawnReward: result.milestoneResult?.reward || null,
    drawnRewardTier: result.milestoneResult?.tier || null,
  };
}
