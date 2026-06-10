import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { maskPhone } from '../utils/masking.js';
import {
  MetacityCustomerInfo,
  MetacityPointBalance,
  MetacityService,
  resolveMetacityCustomer,
  syncToMetacity,
} from '../services/metacity.js';
import { sidoToShort } from '../utils/address-parser.js';
import { fetchOrder } from '../services/taghere-api.js';

const router = Router();

/**
 * 주문 메뉴/테이블 정보를 V2(TagHere) 주문 API 에서 조회해 VisitOrOrder.items 형태로 변환한다.
 * 통합 /transaction 과 단독 /standalone-visit 가 동일한 구조로 메뉴 데이터를 CRM 에 반영하기 위한 공용 헬퍼.
 * 실패해도(주문 조회 실패 등) undefined 를 반환할 뿐 호출 측 흐름에는 영향을 주지 않는다.
 */
async function buildVisitOrderItems(
  orderId: string,
  taghereVersion: string,
): Promise<{ items: any[]; tableNumber: string | null } | undefined> {
  try {
    const orderData = await fetchOrder(orderId, taghereVersion);
    if (!orderData) return undefined;
    const rawItems = orderData.content?.items || (orderData as any).orderItems || (orderData as any).items || [];
    const items = rawItems.map((item: any) => ({
      name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
      quantity: item.count || item.quantity || item.qty || item.amount || 1,
      price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
      option: item.option || null,
    }));
    let tableLabel = orderData.content?.tableLabel || (orderData as any).tableLabel || (orderData as any).content?.tableNumber || (orderData as any).tableNumber || null;
    if (!tableLabel) {
      const tableID = (orderData as any).tableID || (orderData as any).content?.tableID;
      if (tableID && typeof tableID === 'string' && tableID.length < 10) {
        tableLabel = tableID;
      }
    }
    if (items.length > 0 || tableLabel) {
      return { items, tableNumber: tableLabel };
    }
    return undefined;
  } catch (err: any) {
    console.warn(`[Point Webhook] 주문 메뉴 조회 실패(흐름은 계속): orderId=${orderId}, ${err?.message}`);
    return undefined;
  }
}

/**
 * 매직포스 매장에서 메타씨티 회원 식별 + 잔액 조회.
 * 핸들러 안에서 service 인스턴스 생성 + resolveMetacityCustomer 호출 패턴을 한 줄로 묶는다.
 */
async function lookupMetacityCustomer(
  metacityStoreIdx: string,
  customer: Parameters<typeof resolveMetacityCustomer>[1],
): Promise<MetacityCustomerInfo | null> {
  const service = new MetacityService({ metacityStoreIdx });
  return resolveMetacityCustomer(service, customer);
}

/**
 * POST /api/taghere/webhook/point/customer-search
 *
 * MagicPos 포인트 연동: 고객 검색 + 포인트 조회
 * - 전화번호로 고객 검색
 * - MetaCity 연동 매장이면 MetaCity에서 조회/생성 후 로컬 고객 생성
 */
router.post('/customer-search', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, phone } = req.body;

    // 1. 파라미터 검증
    if (!storeSlug || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone은 필수입니다.',
      });
    }

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        metacityEnabled: true,
        metacityStoreIdx: true,
        addressSido: true,
        addressSigungu: true,
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 3. 전화번호 정규화
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    // +82 국제번호 처리
    let normalizedDigits = phoneDigits;
    if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
      normalizedDigits = '0' + normalizedDigits.slice(2);
    }
    const phoneLastDigits = normalizedDigits.slice(-8);

    // 4. 고객 검색
    let isNewCustomer = false;
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        phoneLastDigits,
      },
    });

    // 5. 고객이 없는 경우: 로컬 고객 생성 (MetaCity 동기화는 포인트 트랜잭션 시 syncToMetacity가 처리)
    if (!customer) {
      isNewCustomer = true;
      const formattedPhone = normalizedDigits.length === 11
        ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
        : normalizedDigits;

      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          phone: formattedPhone,
          phoneLastDigits,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido ?? null),
          regionSigungu: store.addressSigungu || null,
          consentMarketing: true,
          consentAt: new Date(),
        },
      });

      console.log(`[Point Webhook] Customer created locally - customerId: ${customer.id}, storeId: ${store.id}`);
    }

    // 6. 포인트 잔액 계산 (매장 타입에 따라 분기)
    //    - 매직포스 연동 매장(metacityEnabled=true): 메타씨티가 진실원천. CUST_SEARCH 응답의 ABLE_POINT 사용.
    //    - 일반 매장: 기존대로 CRM 로컬 값 사용.
    let ablePoint: number = customer.totalPoints;
    let totalPoint = 0;

    if (store.metacityEnabled && store.metacityStoreIdx) {
      const info = await lookupMetacityCustomer(store.metacityStoreIdx, customer);
      if (info) {
        ablePoint = info.ablePoint;
        totalPoint = info.totPoint;
        // 정식 식별된 CUST_ID 만 캐시 갱신 (phoneDigits 폴백은 캐시하지 않음 — 다음 호출에서 정상 식별 재시도)
        if (!info.isFallback && info.custId !== customer.metacityCustId) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: { metacityCustId: info.custId, metacitySyncedAt: new Date() },
          });
        }
      } else {
        // 메타씨티 호출 실패 → 0 으로 fallback (현행 정책)
        console.warn('[Point Webhook] 메타씨티 잔액 조회 실패, 0 으로 응답:', customer.id);
        ablePoint = 0;
        totalPoint = 0;
      }
    } else if (store.metacityEnabled && !store.metacityStoreIdx) {
      // 매장 설정 오류: 활성화는 켜져있지만 매장코드 없음 → 0 fallback + WARN
      // (조회 경로는 화면 표시용이라 5xx 대신 0 응답 — /transaction 과 응답 형식이 다른 의도된 차이)
      console.warn('[Point Webhook] metacityEnabled=true 인데 metacityStoreIdx 비어있음:', store.id);
      ablePoint = 0;
      totalPoint = 0;
    } else {
      // 일반 매장: 기존 로직 (CRM PointLedger EARN 합계)
      const totalAccumulated = await prisma.pointLedger.aggregate({
        where: {
          customerId: customer.id,
          storeId: store.id,
          type: 'EARN',
        },
        _sum: { delta: true },
      });
      totalPoint = totalAccumulated._sum.delta || 0;
    }

    // 7. 응답
    res.json({
      success: true,
      data: {
        crmCustomerId: customer.id,
        custName: customer.name || '고객',
        phone: maskPhone(customer.phone),
        ablePoint,
        totalPoint,
        saveRatePercent: store.pointRatePercent,
        grade: null,
        isNewCustomer,
      },
    });
  } catch (error: any) {
    console.error('[Point Webhook] Customer search error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '고객 검색 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/point/transaction
 *
 * MagicPos 포인트 연동: 포인트 적립/사용 트랜잭션
 * - 주문 완료 시 포인트 사용 + 적립 처리
 * - MetaCity 연동 매장이면 동기화
 */
router.post('/transaction', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, crmCustomerId, orderId, purAmt, usedPoint } = req.body;

    // 1. 파라미터 검증
    if (!storeSlug || !crmCustomerId || !orderId || purAmt === undefined) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, crmCustomerId, orderId, purAmt는 필수입니다.',
      });
    }

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        metacityEnabled: true,
        metacityStoreIdx: true,
        taghereVersion: true,
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 3. 고객 조회
    const customer = await prisma.customer.findFirst({
      where: {
        id: crmCustomerId,
        storeId: store.id,
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'customer_not_found',
        message: '고객을 찾을 수 없습니다.',
      });
    }

    // [매직포스 매장 분기]
    // 매직포스 연동 매장(metacityEnabled=true)은 포인트의 진실원천이 메타씨티이므로
    // CRM 의 PointLedger / Customer.totalPoints 에는 write 하지 않는다.
    // VisitOrOrder + Customer.visitCount/lastVisitAt (방문 통계)만 유지한다.
    if (store.metacityEnabled) {
      // 매장 설정 오류: 활성화는 켜져있지만 매장코드(STORE_IDX)가 비어있음 → 동기화 불가
      // (트랜잭션은 실제 데이터 변경이라 5xx 의미의 success:false 로 명확히 알림 — /customer-search 와 다른 의도된 응답 형식)
      if (!store.metacityStoreIdx) {
        console.warn('[Point Webhook] metacityEnabled=true 인데 metacityStoreIdx 비어있음:', store.id);
        return res.json({
          success: false,
          error: 'metacity_store_idx_missing',
          message: '매직포스 매장 설정 오류 (storeIdx 누락)',
        });
      }

      // 멱등성: VisitOrOrder 존재 시 메타씨티 재요청 없이 CUST_SEARCH 로 현재 잔액만 응답
      const existingVisit = await prisma.visitOrOrder.findUnique({
        where: { storeId_orderId: { storeId: store.id, orderId } },
      });

      if (existingVisit) {
        console.log(`[Point Webhook] 이미 처리된 주문 (매직포스), 잔액 재조회: orderId=${orderId}`);
        const info = await lookupMetacityCustomer(store.metacityStoreIdx, customer);
        return res.json({
          success: true,
          data: {
            savedPoint: 0,
            usedPoint: 0,
            balance: info?.ablePoint ?? 0,
          },
        });
      }

      // 적립 포인트 계산 + 오늘 첫 방문 체크 (VisitOrOrder 기반)
      const savePoint = Math.round((purAmt * store.pointRatePercent) / 100);
      const effectiveUsedPoint = usedPoint || 0;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayVisit = await prisma.visitOrOrder.findFirst({
        where: {
          customerId: customer.id,
          storeId: store.id,
          visitedAt: { gte: todayStart, lte: todayEnd },
        },
      });
      const isFirstVisitToday = !todayVisit;

      // 메타씨티 POINT_COMBINE 동기 호출 — 응답의 ABLE_POINT 가 진실원천
      // 잔액 부족 등은 메타씨티가 에러로 반환 → catch 후 CUST_SEARCH 폴백
      let metacityBalance: MetacityPointBalance | null = null;
      try {
        metacityBalance = await syncToMetacity({
          store: {
            id: store.id,
            metacityEnabled: true,
            metacityStoreIdx: store.metacityStoreIdx,
          },
          customer,
          operationType: 'POINT_COMBINE',
          orderNo: orderId.slice(0, 20), // 스펙 1.7.3: ORDER_NO 최대 20자
          purAmt: purAmt > 0 ? purAmt : 0,
          usedPoint: effectiveUsedPoint,
          savePoint,
        });
      } catch (err: any) {
        // 메타씨티 측 에러(중복 ORDER_NO / 잔액 부족 등) → CUST_SEARCH 로 현재 잔액 폴백
        console.warn('[Point Webhook] POINT_COMBINE 실패, CUST_SEARCH 폴백:', err?.message);
        const info = await lookupMetacityCustomer(store.metacityStoreIdx, customer);
        if (info) {
          metacityBalance = info;
        }
      }

      if (!metacityBalance) {
        // 메타씨티 호출 + 폴백까지 모두 실패
        console.error('[Point Webhook] 메타씨티 동기화 완전 실패:', orderId);
        return res.json({
          success: false,
          error: 'metacity_sync_failed',
          message: '메타씨티 포인트 처리 실패',
        });
      }

      // 메타씨티에는 이미 반영됨 → CRM 로컬 방문 통계만 갱신
      // (PointLedger / Customer.totalPoints 에는 write 하지 않음)
      const magicposOrderItems = await buildVisitOrderItems(orderId, store.taghereVersion);
      await prisma.$transaction([
        prisma.visitOrOrder.upsert({
          where: { storeId_orderId: { storeId: store.id, orderId } },
          update: {},
          create: {
            storeId: store.id,
            customerId: customer.id,
            orderId,
            visitedAt: new Date(),
            totalAmount: purAmt > 0 ? purAmt : null,
            ...(magicposOrderItems && { items: magicposOrderItems }),
          },
        }),
        prisma.customer.update({
          where: { id: customer.id },
          data: {
            ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
            lastVisitAt: new Date(),
          },
        }),
      ]);

      console.log(
        `[Point Webhook] Metacity transaction completed - customerId: ${customer.id}, storeId: ${store.id}, used: ${effectiveUsedPoint}, saved: ${savePoint}, balance(metacity): ${metacityBalance.ablePoint}`,
      );

      return res.json({
        success: true,
        data: {
          savedPoint: savePoint,
          usedPoint: effectiveUsedPoint,
          balance: metacityBalance.ablePoint,
        },
      });
    }

    // 4. 멱등성 체크: 동일 orderId로 이미 처리된 건이 있으면 이전 결과 반환
    const existingLedger = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        orderId,
      },
    });

    if (existingLedger) {
      console.log(`[Point Webhook] 이미 처리된 주문, 기존 결과 반환: orderId=${orderId}`);
      // 해당 orderId의 적립/사용 합산
      const ledgers = await prisma.pointLedger.findMany({
        where: { customerId: customer.id, storeId: store.id, orderId },
      });
      const savedPoint = ledgers.filter(l => l.type === 'EARN').reduce((sum, l) => sum + l.delta, 0);
      const usedPointResult = Math.abs(ledgers.filter(l => l.type === 'USE').reduce((sum, l) => sum + l.delta, 0));
      return res.json({
        success: true,
        data: {
          savedPoint,
          usedPoint: usedPointResult,
          balance: customer.totalPoints,
        },
      });
    }

    // 5. 적립 포인트 계산
    const savePoint = Math.round(purAmt * store.pointRatePercent / 100);
    const effectiveUsedPoint = usedPoint || 0;

    // 6. 포인트 사용 검증
    if (effectiveUsedPoint > 0 && customer.totalPoints < effectiveUsedPoint) {
      return res.status(400).json({
        success: false,
        error: 'insufficient_points',
        message: '보유 포인트가 부족합니다.',
      });
    }

    // 7. 오늘 첫 방문인지 확인
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'EARN',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });
    const isFirstVisitToday = !todayVisit;

    // 8. 트랜잭션 처리
    let currentBalance = customer.totalPoints;
    const transactionOps: any[] = [];

    // 8-1. 포인트 사용
    if (effectiveUsedPoint > 0) {
      currentBalance -= effectiveUsedPoint;
      transactionOps.push(
        prisma.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: -effectiveUsedPoint,
            balance: currentBalance,
            type: 'USE',
            reason: `MagicPos 포인트 사용 (orderId: ${orderId})`,
            orderId,
          },
        }),
      );
    }

    // 8-2. 포인트 적립
    if (savePoint > 0) {
      currentBalance += savePoint;
      transactionOps.push(
        prisma.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: savePoint,
            balance: currentBalance,
            type: 'EARN',
            reason: `MagicPos 포인트 적립 (orderId: ${orderId})`,
            orderId,
          },
        }),
      );
    }

    // 8-3. 고객 포인트 + 방문횟수 업데이트
    transactionOps.push(
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: currentBalance,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
    );

    // 8-4. 주문 내역 기록 (upsert: 동일 orderId 재요청 시 중복 방지). 메뉴/테이블도 함께 보강.
    const orderItemsData = await buildVisitOrderItems(orderId, store.taghereVersion);
    transactionOps.push(
      prisma.visitOrOrder.upsert({
        where: {
          storeId_orderId: {
            storeId: store.id,
            orderId,
          },
        },
        update: {},
        create: {
          storeId: store.id,
          customerId: customer.id,
          orderId,
          visitedAt: new Date(),
          totalAmount: purAmt > 0 ? purAmt : null,
          ...(orderItemsData && { items: orderItemsData }),
        },
      }),
    );

    await prisma.$transaction(transactionOps);

    console.log(`[Point Webhook] Transaction completed - customerId: ${customer.id}, storeId: ${store.id}, usedPoint: ${effectiveUsedPoint}, savePoint: ${savePoint}, balance: ${currentBalance}`);

    // 매직포스 매장은 위 분기에서 이미 return 됨 → 여기는 일반 매장 경로.
    // 메타씨티 동기화는 매직포스 매장에서만 의미가 있으므로 호출하지 않는다.

    // 9. 응답
    res.json({
      success: true,
      data: {
        savedPoint: savePoint,
        usedPoint: effectiveUsedPoint,
        balance: currentBalance,
      },
    });
  } catch (error: any) {
    console.error('[Point Webhook] Transaction error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '포인트 트랜잭션 처리 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/point/standalone-member-snapshot
 *
 * 매직포스 단독 회원(STANDALONE) 매장에서 V2 가 8100 으로 회원 조회 후,
 * 마케팅 목적으로 CRM 에 손님 정보 스냅샷을 전송하는 엔드포인트.
 * (단독 매장의 포인트는 메타씨티 POS 가 진실원천이므로 totalPoints/PointLedger 는 갱신하지 않음)
 */
router.post('/standalone-member-snapshot', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, phone, custCd, custName } = req.body as {
      storeSlug?: string;
      phone?: string;
      custCd?: string | null;
      custName?: string | null;
    };

    if (!storeSlug || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone은 필수입니다.',
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: { id: true, addressSido: true, addressSigungu: true },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    const phoneDigits = phone.replace(/[^0-9]/g, '');
    let normalizedDigits = phoneDigits;
    if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
      normalizedDigits = '0' + normalizedDigits.slice(2);
    }
    const phoneLastDigits = normalizedDigits.slice(-8);
    const formattedPhone = normalizedDigits.length === 11
      ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
      : normalizedDigits;

    const existing = await prisma.customer.findFirst({
      where: { storeId: store.id, phoneLastDigits },
    });

    const trimmedCustCd = typeof custCd === 'string' ? custCd.trim() : '';
    const trimmedCustName = typeof custName === 'string' ? custName.trim() : '';

    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...(trimmedCustCd && { metacityCustCd: trimmedCustCd, metacitySyncedAt: new Date() }),
          ...(trimmedCustName && !existing.name && { name: trimmedCustName }),
        },
      });
    } else {
      await prisma.customer.create({
        data: {
          storeId: store.id,
          phone: formattedPhone,
          phoneLastDigits,
          name: trimmedCustName || null,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido ?? null),
          regionSigungu: store.addressSigungu || null,
          consentMarketing: true,
          consentAt: new Date(),
          metacityCustCd: trimmedCustCd || null,
          metacitySyncedAt: trimmedCustCd ? new Date() : null,
        },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Point Webhook] Standalone member snapshot error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '단독 매장 회원 스냅샷 처리 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/point/standalone-visit
 *
 * 매직포스 단독 회원(STANDALONE) 매장에서 V2 가 결제 완료 시 마케팅 visit 통계용으로 전송.
 * CRM `/transaction` 호출이 스킵되는 STANDALONE 매장에서 visit/lastVisitAt 통계를 유지하기 위함.
 * 멱등성: 동일 orderId 의 VisitOrOrder 가 이미 존재하면 skip.
 */
router.post('/standalone-visit', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, phone, custCd, orderId, totalAmount } = req.body as {
      storeSlug?: string;
      phone?: string;
      custCd?: string | null;
      orderId?: string;
      totalAmount?: number;
    };

    if (!storeSlug || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone, orderId는 필수입니다.',
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: { id: true, addressSido: true, addressSigungu: true, taghereVersion: true },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    const phoneDigits = phone.replace(/[^0-9]/g, '');
    let normalizedDigits = phoneDigits;
    if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
      normalizedDigits = '0' + normalizedDigits.slice(2);
    }
    const phoneLastDigits = normalizedDigits.slice(-8);
    const formattedPhone = normalizedDigits.length === 11
      ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
      : normalizedDigits;
    const trimmedCustCd = typeof custCd === 'string' ? custCd.trim() : '';

    // 멱등성: 동일 orderId 가 이미 처리됐으면 skip
    const existingVisit = await prisma.visitOrOrder.findUnique({
      where: { storeId_orderId: { storeId: store.id, orderId } },
    });

    if (existingVisit) {
      return res.json({ success: true, skipped: true });
    }

    // 고객 find/create
    let customer = await prisma.customer.findFirst({
      where: { storeId: store.id, phoneLastDigits },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          phone: formattedPhone,
          phoneLastDigits,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido ?? null),
          regionSigungu: store.addressSigungu || null,
          consentMarketing: true,
          consentAt: new Date(),
          metacityCustCd: trimmedCustCd || null,
          metacitySyncedAt: trimmedCustCd ? new Date() : null,
        },
      });
    } else if (trimmedCustCd && customer.metacityCustCd !== trimmedCustCd) {
      // 캐시된 CUST_CD 갱신
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustCd: trimmedCustCd, metacitySyncedAt: new Date() },
      });
    }

    // 오늘 첫 방문인지 확인 (VisitOrOrder 기반)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayVisit = await prisma.visitOrOrder.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        visitedAt: { gte: todayStart, lte: todayEnd },
      },
    });
    const isFirstVisitToday = !todayVisit;

    // 주문 메뉴 정보 보강 — 통합 /transaction 과 동일하게 VisitOrOrder.items 에 메뉴/테이블을 기록한다.
    const orderItemsData = await buildVisitOrderItems(orderId, store.taghereVersion);

    await prisma.$transaction([
      prisma.visitOrOrder.upsert({
        where: { storeId_orderId: { storeId: store.id, orderId } },
        update: {},
        create: {
          storeId: store.id,
          customerId: customer.id,
          orderId,
          visitedAt: new Date(),
          totalAmount: totalAmount && totalAmount > 0 ? totalAmount : null,
          ...(orderItemsData && { items: orderItemsData }),
        },
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
    ]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Point Webhook] Standalone visit error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '단독 매장 visit 처리 중 오류가 발생했습니다.',
    });
  }
});

/** 문자열 정규화: null/빈문자 → undefined, 그 외 String() + trim */
function asStr(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * 유연 추출용 소스 수집: { data: { content: [...] } } 봉투/flat/중첩을 모두 평탄화해
 * 객체들의 배열로 반환한다(흔한 봉투 키만 제한적으로 재귀, depth 가드).
 */
function collectSources(body: any): any[] {
  const out: any[] = [];
  const visit = (v: any, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (Array.isArray(v)) { v.forEach((e) => visit(e, depth + 1)); return; }
    out.push(v);
    for (const k of ['data', 'content', 'payload', 'body', 'result', 'item', 'items']) {
      if (v[k] !== undefined) visit(v[k], depth + 1);
    }
  };
  visit(body, 0);
  return out;
}

/** 별칭(대소문자 무시) 중 먼저 발견되는 비어있지 않은 값을 반환 */
function pickField(sources: any[], aliases: string[]): any {
  const lowers = aliases.map((a) => a.toLowerCase());
  for (const src of sources) {
    for (const key of Object.keys(src)) {
      if (lowers.includes(key.toLowerCase())) {
        const val = src[key];
        if (val !== undefined && val !== null && val !== '') return val;
      }
    }
  }
  return undefined;
}

/**
 * POST /api/taghere/webhook/point/metacity-point-event
 *
 * MagicPos(메타씨티) POS 단말에서 발생한 포인트 적립/사용을 CRM 에 반영하는 인바운드 웹훅.
 *
 * [매핑 확정 전 — 캡처 우선 모드]
 * - 어떤 JSON 형식이 와도 수신하고, 원문(raw)을 통째로 로깅한다(매직포스 실제 페이로드 관찰용).
 * - 별칭 기반 best-effort 로 매장/고객/잔액/거래키를 추출 → 추출되면 CRM 에 반영,
 *   필수값을 못 찾으면 원문만 남기고 success:true(mapped:false) 로 응답(연동 깨지지 않게).
 * - 실제 페이로드 확인 후 collectSources/pickField 별칭을 확정/조정하면 됨.
 *
 * 반영 규칙: Customer.totalPoints = balance(authoritative set) + PointLedger 이력,
 *           멱등키 externalTxId(=txId)로 중복/echo 방지. balance/savePoint/usedPoint 는 재계산하지 않음.
 * 주의: 태그히어 모바일오더 포인트는 이미 /transaction 이 기록하므로 이 웹훅으로 중복 전송 금지.
 */
router.post('/metacity-point-event', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    // 0. 원문 로깅 — 매핑 확정 전, 매직포스가 실제 보내는 페이로드를 그대로 관찰
    console.log('[Point Webhook] metacity-point-event RAW:', JSON.stringify(req.body));

    // 1. 유연 추출 (별칭 기반 best-effort). 실제 페이로드 확인 후 별칭을 조정/확정하면 됨.
    const sources = collectSources(req.body);
    const metacityStoreIdx = asStr(pickField(sources, ['metacityStoreIdx', 'storeIdx', 'STORE_IDX', 'store_idx']));
    const storeSlug = asStr(pickField(sources, ['storeSlug', 'slug']));
    const txId = asStr(pickField(sources, ['txId', 'txid', 'transactionId', 'ORDER_NO', 'order_no', 'orderNo', 'orderId']));
    const phone = asStr(pickField(sources, ['phone', 'CP_NO', 'cp_no', 'cpNo', 'tel', 'mobile', 'phoneNumber']));
    const custId = asStr(pickField(sources, ['custId', 'CUST_ID', 'cust_id']));
    // 단독 회원(STANDALONE) 식별자 CUST_CD — 통합 회원 CUST_ID 와 별개 컬럼(Customer.metacityCustCd)으로 캐싱.
    // (메타시티 실제 페이로드 미확인 — 별칭은 raw 로그 관찰 후 확정 가능)
    const custCd = asStr(pickField(sources, ['custCd', 'CUST_CD', 'cust_cd']));
    const balanceRaw = pickField(sources, ['balance', 'ablePoint', 'ABLE_POINT', 'able_point', 'remainPoint', 'remainingPoint']);
    const saveRaw = pickField(sources, ['savePoint', 'SAVE_POINT', 'save_point', 'earnPoint', 'accruePoint', 'addPoint']);
    const useRaw = pickField(sources, ['usedPoint', 'USED_POINT', 'used_point', 'usePoint', 'deductPoint']);
    const purAmtRaw = pickField(sources, ['purAmt', 'PUR_AMT', 'pur_amt', 'amount', 'payAmount', 'totalAmount']);

    // 2. 매핑 필수값 점검 — 부족하면 원문만 남기고 성공 응답(캡처 단계, 연동 안 깨지게)
    const missing: string[] = [];
    if (!metacityStoreIdx && !storeSlug) missing.push('store');
    if (!txId) missing.push('txId');
    if (!phone && !custId) missing.push('phone|custId');
    if (balanceRaw === undefined || balanceRaw === null || balanceRaw === '') missing.push('balance');
    if (missing.length > 0) {
      console.warn(`[Point Webhook] metacity-point-event 매핑 보류(누락: ${missing.join(', ')}) — 위 RAW 로그 참조`);
      return res.json({ success: true, mapped: false, missing });
    }

    const balanceNum = Math.round(Number(balanceRaw));
    const saveNum = Math.max(0, Math.round(Number(saveRaw || 0)));
    const useNum = Math.max(0, Math.round(Number(useRaw || 0)));
    const purAmtNum = Math.max(0, Math.round(Number(purAmtRaw || 0)));
    if (!Number.isFinite(balanceNum) || balanceNum < 0) {
      console.warn(`[Point Webhook] metacity-point-event balance 해석 불가(${JSON.stringify(balanceRaw)}) — 매핑 보류`);
      return res.json({ success: true, mapped: false, reason: 'invalid_balance' });
    }

    // 3. 매장 조회 (metacityStoreIdx 우선, storeSlug 폴백). 매직포스 연동 매장만.
    const store = await prisma.store.findFirst({
      where: metacityStoreIdx ? { metacityStoreIdx } : { slug: storeSlug! },
      select: {
        id: true,
        name: true,
        metacityEnabled: true,
        metacityStoreIdx: true,
        addressSido: true,
        addressSigungu: true,
      },
    });

    if (!store || !store.metacityEnabled) {
      console.warn(`[Point Webhook] metacity-point-event 매장 매핑 보류 (storeIdx=${metacityStoreIdx}, slug=${storeSlug}, found=${!!store}, metacityEnabled=${store?.metacityEnabled}) — RAW 로그 참조`);
      return res.json({ success: true, mapped: false, reason: store ? 'not_metacity_store' : 'store_not_found' });
    }

    // 4. 고객 식별 — 전화번호 우선(없으면 custId 캐시만으론 신규 생성 불가하므로 보류)
    if (!phone) {
      console.warn(`[Point Webhook] metacity-point-event 전화번호 없음(custId=${custId}) — find-or-create 불가, 매핑 보류`);
      return res.json({ success: true, mapped: false, reason: 'no_phone' });
    }

    // 5. 전화번호 정규화
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    let normalizedDigits = phoneDigits;
    if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
      normalizedDigits = '0' + normalizedDigits.slice(2);
    }
    const phoneLastDigits = normalizedDigits.slice(-8);

    // 4. 고객 find-or-create
    let customer = await prisma.customer.findFirst({
      where: { storeId: store.id, phoneLastDigits },
    });

    const trimmedCustId = typeof custId === 'string' ? custId.trim() : '';
    const trimmedCustCd = typeof custCd === 'string' ? custCd.trim() : '';

    if (!customer) {
      const formattedPhone = normalizedDigits.length === 11
        ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
        : normalizedDigits;

      try {
        customer = await prisma.customer.create({
          data: {
            storeId: store.id,
            phone: formattedPhone,
            phoneLastDigits,
            totalPoints: 0,
            visitCount: 0,
            regionSido: sidoToShort(store.addressSido ?? null),
            regionSigungu: store.addressSigungu || null,
            consentMarketing: true,
            consentAt: new Date(),
            metacityCustId: trimmedCustId || null,
            metacityCustCd: trimmedCustCd || null,
            metacitySyncedAt: (trimmedCustId || trimmedCustCd) ? new Date() : null,
          },
        });
        console.log(`[Point Webhook] Customer created locally (metacity-point-event) - customerId: ${customer.id}, storeId: ${store.id}`);
      } catch (e: any) {
        // 동시 첫 거래 경쟁: customers @@unique([storeId, phoneLastDigits]) 충돌 → 승자 재조회
        if (e?.code === 'P2002') {
          customer = await prisma.customer.findFirst({ where: { storeId: store.id, phoneLastDigits } });
        }
        if (!customer) throw e;
      }
    } else {
      // 식별자(CUST_ID/CUST_CD) 캐시 갱신 — 통합은 metacityCustId, 단독은 metacityCustCd.
      const idChanged = trimmedCustId && customer.metacityCustId !== trimmedCustId;
      const cdChanged = trimmedCustCd && customer.metacityCustCd !== trimmedCustCd;
      if (idChanged || cdChanged) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            ...(idChanged && { metacityCustId: trimmedCustId }),
            ...(cdChanged && { metacityCustCd: trimmedCustCd }),
            metacitySyncedAt: new Date(),
          },
        });
      }
    }

    const customerId = customer.id;

    // 5. 멱등성: 동일 txId(externalTxId) 또는 echo(ledger.id == txId) 처리 건이면 현재 잔액 반환
    const duplicate = await prisma.pointLedger.findFirst({
      where: {
        storeId: store.id,
        OR: [{ externalTxId: txId }, { id: txId }],
      },
    });

    if (duplicate) {
      console.log(`[Point Webhook] 이미 처리된 POS 거래, skip: txId=${txId}`);
      const current = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { totalPoints: true },
      });
      return res.json({
        success: true,
        data: { balance: current?.totalPoints ?? balanceNum },
      });
    }

    // 6. 오늘 첫 방문 여부 (PointLedger 기반, /transaction 과 동일 기준)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayLedger = await prisma.pointLedger.findFirst({
      where: {
        customerId,
        storeId: store.id,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });
    const isFirstVisitToday = !todayLedger;

    // 7. 이력 행 구성
    //    - balance(거래 후 최종 잔액)는 진실원천. 사용→적립 순서로 잔액 스냅샷 역산.
    //    - @@unique([storeId, externalTxId]) 때문에 대표 행 1개에만 externalTxId 부여(나머지 null).
    const ledgerCreates: Array<{ delta: number; balance: number; type: 'EARN' | 'USE' | 'ADJUST'; reason: string }> = [];
    if (useNum > 0) {
      ledgerCreates.push({
        delta: -useNum,
        balance: balanceNum - saveNum,
        type: 'USE',
        reason: `매직포스 POS 포인트 사용 (txId: ${txId})`,
      });
    }
    if (saveNum > 0) {
      ledgerCreates.push({
        delta: saveNum,
        balance: balanceNum,
        type: 'EARN',
        reason: `매직포스 POS 포인트 적립 (txId: ${txId})`,
      });
    }
    if (ledgerCreates.length === 0) {
      // 적립/사용 0 인 잔액 보정성 이벤트 — 멱등키 보존을 위해 ADJUST 1건 기록
      ledgerCreates.push({
        delta: 0,
        balance: balanceNum,
        type: 'ADJUST',
        reason: `매직포스 POS 잔액 동기화 (txId: ${txId})`,
      });
    }

    const ops: any[] = ledgerCreates.map((row, idx) =>
      prisma.pointLedger.create({
        data: {
          storeId: store.id,
          customerId,
          delta: row.delta,
          balance: row.balance,
          type: row.type,
          reason: row.reason,
          // 대표 행(마지막) 에만 externalTxId 부여 → unique 충돌 방지 + 멱등키 보존
          externalTxId: idx === ledgerCreates.length - 1 ? txId : null,
        },
      }),
    );

    // 8. totalPoints = balance (authoritative set) + 방문 통계
    ops.push(
      prisma.customer.update({
        where: { id: customerId },
        data: {
          totalPoints: balanceNum,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
    );

    await prisma.$transaction(ops);

    console.log(
      `[Point Webhook] Metacity POS event applied - customerId: ${customerId}, storeId: ${store.id}, used: ${useNum}, saved: ${saveNum}, balance: ${balanceNum}, purAmt: ${purAmtNum}`,
    );

    return res.json({
      success: true,
      data: { balance: balanceNum },
    });
  } catch (error: any) {
    // externalTxId unique 위반(동시 중복 요청)일 때만 멱등 처리로 간주하고 성공 반환.
    // (고객/기타 제약조건 위반을 성공으로 오인하면 포인트가 유실되므로 target 을 확인)
    const target = error?.meta?.target;
    const isLedgerDup = error?.code === 'P2002' && (
      Array.isArray(target) ? target.includes('externalTxId') : typeof target === 'string' && target.includes('externalTxId')
    );
    if (isLedgerDup) {
      console.warn('[Point Webhook] metacity-point-event 동시 중복 요청(externalTxId P2002), 멱등 처리');
      return res.json({ success: true, idempotent: true });
    }
    console.error('[Point Webhook] Metacity point event error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'POS 포인트 이벤트 처리 중 오류가 발생했습니다.',
    });
  }
});

export default router;
