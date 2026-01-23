import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueuePointsEarnedAlimTalk } from '../services/solapi.js';

const router = Router();

// GET /api/customers
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      search,
      gender,
      isVip,
      page = '1',
      limit = '50',
      visitCountMin,
      visitCountExact,
      lastVisitDays,
      startDate,
      endDate,
      dateType = 'lastVisit',
      visitSource,
    } = req.query;
    const storeId = req.user!.storeId;

    const where: any = { storeId, AND: [] };
    const orConditions: any[] = [];

    // Search by name, phone, or memo
    if (search) {
      orConditions.push(
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
        { phoneLastDigits: { contains: search as string } },
        { memo: { contains: search as string } }
      );
    }

    // Filter by gender
    if (gender && gender !== 'all') {
      where.AND.push({ gender });
    }

    // Filter by exact visit count (for 1 or 2)
    if (visitCountExact) {
      const exactVisit = parseInt(visitCountExact as string);
      if (!Number.isNaN(exactVisit)) {
        where.AND.push({ visitCount: exactVisit });
      }
    }
    // Filter by visit count threshold (for 5+, 10+, 20+)
    else if (visitCountMin) {
      const minVisit = parseInt(visitCountMin as string);
      if (!Number.isNaN(minVisit)) {
        where.AND.push({ visitCount: { gte: minVisit } });
      }
    }

    // Filter by last visit within N days (e.g., 7/30/90)
    if (lastVisitDays) {
      const days = parseInt(lastVisitDays as string);
      if (!Number.isNaN(days)) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        where.AND.push({ lastVisitAt: { gte: sinceDate } });
      }
    }

    // Filter by date range (startDate ~ endDate)
    if (startDate || endDate) {
      const dateField = dateType === 'created' ? 'createdAt' : 'lastVisitAt';
      const dateWhere: any = {};

      if (startDate) {
        dateWhere.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateWhere.lte = end;
      }

      where.AND.push({ [dateField]: dateWhere });
    }

    // Filter by VIP (visit count > 20 or total points > 5000)
    if (isVip === 'true') {
      orConditions.push({ visitCount: { gte: 20 } }, { totalPoints: { gte: 5000 } });
    }

    // Filter by visit source
    if (visitSource && visitSource !== 'all') {
      where.AND.push({ visitSource: visitSource as string });
    }

    if (orConditions.length > 0) {
      where.AND.push({ OR: orConditions });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { lastVisitAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.customer.count({ where }),
    ]);

    // Get message counts for all customers in this page
    const customerIds = customers.map((c) => c.id);
    const messageCounts = await prisma.smsMessage.groupBy({
      by: ['customerId'],
      where: { storeId, customerId: { in: customerIds } },
      _count: { id: true },
    });
    const messageCountMap = new Map(
      messageCounts.map((mc) => [mc.customerId, mc._count.id])
    );

    // Get last table label for each customer from 3 sources:
    // 1. VisitOrOrder.items.tableNumber
    // 2. PointLedger.tableLabel
    // 3. StampLedger.tableLabel
    // Use the most recent value across all sources

    // 1. VisitOrOrder에서 조회
    const lastVisitOrders = await prisma.visitOrOrder.findMany({
      where: {
        storeId,
        customerId: { in: customerIds },
      },
      orderBy: { visitedAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        items: true,
        visitedAt: true,
      },
    });

    // 2. PointLedger에서 tableLabel 조회
    const pointTableLabels = await prisma.pointLedger.findMany({
      where: {
        storeId,
        customerId: { in: customerIds },
        tableLabel: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        tableLabel: true,
        createdAt: true,
      },
    });

    // 3. StampLedger에서 tableLabel 조회
    const stampTableLabels = await prisma.stampLedger.findMany({
      where: {
        storeId,
        customerId: { in: customerIds },
        tableLabel: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: {
        customerId: true,
        tableLabel: true,
        createdAt: true,
      },
    });

    // 4. 병합 (가장 최근 값 사용)
    const tableLabelsMap = new Map<string, string>();
    const timestampMap = new Map<string, Date>();

    // VisitOrOrder에서 먼저 처리
    for (const visit of lastVisitOrders) {
      const items = visit.items as { tableNumber?: string } | null;
      if (items?.tableNumber) {
        tableLabelsMap.set(visit.customerId, items.tableNumber);
        timestampMap.set(visit.customerId, visit.visitedAt);
      }
    }

    // PointLedger 처리 (더 최근 값이면 덮어쓰기)
    for (const entry of pointTableLabels) {
      if (entry.tableLabel) {
        const existing = timestampMap.get(entry.customerId);
        if (!existing || entry.createdAt > existing) {
          tableLabelsMap.set(entry.customerId, entry.tableLabel);
          timestampMap.set(entry.customerId, entry.createdAt);
        }
      }
    }

    // StampLedger 처리 (더 최근 값이면 덮어쓰기)
    for (const entry of stampTableLabels) {
      if (entry.tableLabel) {
        const existing = timestampMap.get(entry.customerId);
        if (!existing || entry.createdAt > existing) {
          tableLabelsMap.set(entry.customerId, entry.tableLabel);
          timestampMap.set(entry.customerId, entry.createdAt);
        }
      }
    }

    // Determine VIP status and add message count
    const customersWithVip = customers.map((customer) => ({
      ...customer,
      isVip: customer.visitCount >= 20 || customer.totalPoints >= 5000,
      isNew: customer.visitCount <= 1,
      messageCount: messageCountMap.get(customer.id) || 0,
      lastTableLabel: tableLabelsMap.get(customer.id) || null,
    }));

    res.json({
      customers: customersWithVip,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Customers list error:', error);
    res.status(500).json({ error: '고객 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/customers/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;

    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
      include: {
        pointLedger: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        visitsOrOrders: {
          orderBy: { visitedAt: 'desc' },
          take: 10,
        },
        feedbacks: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    console.log(`[Customer Detail] customerId: ${id}, visitsOrOrdersCount: ${customer.visitsOrOrders.length}`);

    // visitsOrOrders의 items 정규화 (다양한 API 응답 구조 지원)
    const normalizedVisitsOrOrders = customer.visitsOrOrders.map((visit) => {
      let normalizedItems: any[] = [];
      let tableNumber: string | null = null;

      // items 필드의 구조에 따라 처리
      // 새로운 형식: { items: [], tableNumber: string }
      // 기존 형식: [] (배열 직접)
      const itemsData = visit.items as any;
      if (itemsData) {
        if (Array.isArray(itemsData)) {
          // 기존 형식: 배열 직접
          normalizedItems = itemsData.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        } else if (typeof itemsData === 'object') {
          // 새로운 형식: { items: [], tableNumber: string }
          tableNumber = itemsData.tableNumber || null;
          const rawItems = itemsData.items || [];
          normalizedItems = rawItems.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        }
      }
      return {
        ...visit,
        items: normalizedItems,
        tableNumber,
      };
    });

    res.json({
      ...customer,
      visitsOrOrders: normalizedVisitsOrOrders,
      isVip: customer.visitCount >= 20 || customer.totalPoints >= 5000,
      isNew: customer.visitCount <= 1,
    });
  } catch (error) {
    console.error('Customer detail error:', error);
    res.status(500).json({ error: '고객 정보 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/customers/search/phone/:digits
router.get('/search/phone/:digits', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { digits } = req.params;
    const storeId = req.user!.storeId;

    if (digits.length < 4 || digits.length > 8) {
      return res.status(400).json({ error: '전화번호 뒷자리 4~8자리를 입력해주세요.' });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        storeId,
        phoneLastDigits: { endsWith: digits },
      },
    });

    if (!customer) {
      return res.json({ found: false, customer: null });
    }

    res.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        totalPoints: customer.totalPoints,
        visitCount: customer.visitCount,
        isVip: customer.visitCount >= 20 || customer.totalPoints >= 5000,
      },
    });
  } catch (error) {
    console.error('Customer search error:', error);
    res.status(500).json({ error: '고객 검색 중 오류가 발생했습니다.' });
  }
});

// POST /api/customers - Create new customer
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, phone, gender, birthday, birthYear, memo, initialPoints, feedbackRating, feedbackText } = req.body;

    // 필수 필드 검증
    if (!phone) {
      return res.status(400).json({ error: '전화번호는 필수입니다.' });
    }

    // 전화번호 정규화
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const phoneLastDigits = normalizedPhone.slice(-8);

    // 중복 검사 (동일 매장 내 전화번호 뒷자리 중복)
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        storeId,
        phoneLastDigits,
      },
    });

    if (existingCustomer) {
      return res.status(400).json({ error: '이미 등록된 전화번호입니다.' });
    }

    // 고객 생성
    const customer = await prisma.customer.create({
      data: {
        storeId,
        name: name || null,
        phone: normalizedPhone,
        phoneLastDigits,
        gender: gender || null,
        birthday: birthday || null,  // MM-DD 형식 문자열
        birthYear: birthYear || null,  // YYYY 숫자
        memo: memo || null,
        totalPoints: initialPoints || 0,
        visitCount: 1,
        lastVisitAt: new Date(),
        feedbackRating: feedbackRating || null,
        feedbackText: feedbackText || null,
        feedbackAt: feedbackRating || feedbackText ? new Date() : null,
      },
    });

    // 초기 포인트가 있으면 포인트 원장에 기록
    if (initialPoints && initialPoints > 0) {
      await prisma.pointLedger.create({
        data: {
          storeId,
          customerId: customer.id,
          delta: initialPoints,
          balance: initialPoints,
          type: 'EARN',
          reason: '신규 등록 포인트',
        },
      });
    }

    res.status(201).json({
      ...customer,
      isVip: false,
      isNew: true,
    });
  } catch (error) {
    console.error('Customer create error:', error);
    res.status(500).json({ error: '고객 등록 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/customers/:id - Update customer info
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;
    const { name, gender, birthday, birthYear, memo, feedbackRating, feedbackText } = req.body;

    // Check if customer exists and belongs to the store
    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (gender !== undefined) updateData.gender = gender;
    if (birthday !== undefined) {
      updateData.birthday = birthday || null;  // MM-DD 형식 문자열
    }
    if (birthYear !== undefined) {
      updateData.birthYear = birthYear || null;  // YYYY 숫자
    }
    if (memo !== undefined) updateData.memo = memo;
    if (feedbackRating !== undefined) updateData.feedbackRating = feedbackRating;
    if (feedbackText !== undefined) updateData.feedbackText = feedbackText;
    if (feedbackRating !== undefined || feedbackText !== undefined) {
      updateData.feedbackAt = new Date();
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    res.json({
      ...updatedCustomer,
      isVip: updatedCustomer.visitCount >= 20 || updatedCustomer.totalPoints >= 5000,
      isNew: updatedCustomer.visitCount <= 1,
    });
  } catch (error) {
    console.error('Customer update error:', error);
    res.status(500).json({ error: '고객 정보 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/customers/visit-source - Public endpoint to save visit source (from enroll page)
router.post('/visit-source', async (req, res) => {
  try {
    const { customerId, visitSource } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    if (!visitSource) {
      return res.json({ success: true, message: '방문 경로 없음' });
    }

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // Update visit source (기존 값이 있어도 덮어씀)
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: { visitSource },
    });

    res.json({ success: true, visitSource: updatedCustomer.visitSource });
  } catch (error) {
    console.error('Customer visit source error:', error);
    res.status(500).json({ error: '방문 경로 저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/customers/feedback - Public endpoint for customer feedback (from enroll page)
router.post('/feedback', async (req, res) => {
  try {
    const { customerId, feedbackRating, feedbackText, preferredCategories } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    // 피드백 내용이 없으면 성공으로 처리 (빈 피드백은 저장하지 않음)
    if (!feedbackRating && !feedbackText) {
      return res.json({ success: true, message: '피드백 없음' });
    }

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 피드백을 CustomerFeedback 테이블에 누적 저장
    const feedback = await prisma.customerFeedback.create({
      data: {
        customerId,
        rating: feedbackRating || 0,
        text: feedbackText || null,
      },
    });

    // Customer의 최신 피드백 정보도 업데이트 (기존 호환성)
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        feedbackRating: feedbackRating || null,
        feedbackText: feedbackText || null,
        feedbackAt: new Date(),
        // preferredCategories는 ExternalCustomer에만 저장 (아래 upsert 참조)
      },
    });

    // ExternalCustomer 등록 (신규 고객 타겟 서비스)
    if (preferredCategories && preferredCategories.length > 0 && customer.phone) {
      try {
        // ageGroup 계산
        let ageGroup: 'TWENTIES' | 'THIRTIES' | 'FORTIES' | 'FIFTIES' | 'SIXTY_PLUS' | null = null;
        if (customer.birthYear) {
          const age = new Date().getFullYear() - customer.birthYear;
          if (age >= 20 && age < 30) ageGroup = 'TWENTIES';
          else if (age >= 30 && age < 40) ageGroup = 'THIRTIES';
          else if (age >= 40 && age < 50) ageGroup = 'FORTIES';
          else if (age >= 50 && age < 60) ageGroup = 'FIFTIES';
          else if (age >= 60) ageGroup = 'SIXTY_PLUS';
        }

        // Use default region values since Store doesn't have these fields
        const regionSido = '서울특별시';
        const regionSigungu = '강남구';

        if (ageGroup) {
          // upsert: 이미 존재하면 업데이트, 없으면 생성
          await prisma.externalCustomer.upsert({
            where: { phone: customer.phone },
            update: {
              // 기존 고객의 경우 preferredCategories 추가 (기존 것과 병합)
              preferredCategories: JSON.stringify(preferredCategories),
              consentMarketing: true,
              consentAt: new Date(),
            },
            create: {
              phone: customer.phone,
              ageGroup,
              gender: customer.gender,
              regionSido,
              regionSigungu,
              preferredCategories: JSON.stringify(preferredCategories),
              consentMarketing: true,
              consentAt: new Date(),
            },
          });
        }
      } catch (error) {
        // ExternalCustomer 등록 실패해도 피드백 저장은 성공 처리
        console.error('Failed to register ExternalCustomer:', error);
      }
    }

    res.json({ success: true, customer: updatedCustomer, feedback });
  } catch (error) {
    console.error('Customer feedback error:', error);
    res.status(500).json({ error: '피드백 저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/customers/:id/cancel-order-item - Cancel a specific item in an order (supports partial quantity)
router.post('/:id/cancel-order-item', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;
    const { visitOrOrderId, itemIndex, cancelQuantity } = req.body;

    if (!visitOrOrderId || itemIndex === undefined) {
      return res.status(400).json({ error: '주문 ID와 아이템 인덱스가 필요합니다.' });
    }

    // Verify customer exists and belongs to the store (with store name and point rate for AlimTalk)
    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
      include: {
        store: {
          select: { name: true, pointRatePercent: true },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // Find the visit/order
    const visitOrOrder = await prisma.visitOrOrder.findFirst({
      where: { id: visitOrOrderId, storeId, customerId: id },
    });

    if (!visitOrOrder) {
      return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
    }

    // Parse items
    let items: any[] = [];
    const itemsData = visitOrOrder.items as any;
    if (itemsData) {
      if (Array.isArray(itemsData)) {
        items = itemsData;
      } else if (typeof itemsData === 'object' && itemsData.items) {
        items = itemsData.items;
      }
    }

    if (itemIndex < 0 || itemIndex >= items.length) {
      return res.status(400).json({ error: '유효하지 않은 아이템 인덱스입니다.' });
    }

    const targetItem = items[itemIndex];

    // Get item quantity
    const itemTotalQty = targetItem.count || targetItem.quantity || targetItem.qty || 1;
    const alreadyCancelledQty = targetItem.cancelledQuantity || 0;
    const remainingQty = itemTotalQty - alreadyCancelledQty;

    // Check if already fully cancelled
    if (targetItem.cancelled || remainingQty <= 0) {
      return res.status(400).json({ error: '이미 취소된 아이템입니다.' });
    }

    // Determine cancel quantity (default: cancel all remaining)
    const cancelQty = cancelQuantity !== undefined ? Math.min(cancelQuantity, remainingQty) : remainingQty;

    if (cancelQty <= 0) {
      return res.status(400).json({ error: '취소할 수량은 1 이상이어야 합니다.' });
    }

    // Calculate points to deduct using store's pointRatePercent (same as earn logic)
    const pointRatePercent = customer.store.pointRatePercent || 5; // 기본값 5%

    // Debug: log the target item structure
    console.log('[Cancel Order Item] targetItem:', JSON.stringify(targetItem, null, 2));

    const itemPrice = typeof targetItem.price === 'string'
      ? parseInt(targetItem.price, 10)
      : (targetItem.price || 0);

    // Calculate price for cancelled quantity only (not total)
    const cancelledPrice = itemPrice * cancelQty;

    // Debug: log calculated values
    console.log('[Cancel Order Item] itemPrice:', itemPrice, 'cancelQty:', cancelQty, 'cancelledPrice:', cancelledPrice);
    console.log('[Cancel Order Item] pointRatePercent:', pointRatePercent);

    // 적립과 동일한 방식으로 포인트 계산 (취소된 수량 기준)
    const pointsToDeduct = Math.round(cancelledPrice * (pointRatePercent / 100));
    console.log('[Cancel Order Item] pointsToDeduct:', cancelledPrice, '*', pointRatePercent / 100, '=', pointsToDeduct);

    // Update cancelled quantity
    const newCancelledQty = alreadyCancelledQty + cancelQty;
    const isFullyCancelled = newCancelledQty >= itemTotalQty;

    // Mark item as cancelled (partial or full)
    items[itemIndex] = {
      ...targetItem,
      cancelledQuantity: newCancelledQty,
      cancelled: isFullyCancelled,
      cancelledAt: new Date().toISOString(),
    };

    // Update the visit/order with cancelled item
    const updatedItemsData = Array.isArray(itemsData)
      ? items
      : { ...itemsData, items };

    await prisma.visitOrOrder.update({
      where: { id: visitOrOrderId },
      data: { items: updatedItemsData },
    });

    // Deduct points if applicable
    if (pointsToDeduct > 0) {
      // Get current customer points
      const currentCustomer = await prisma.customer.findUnique({
        where: { id },
        select: { totalPoints: true },
      });

      const currentPoints = currentCustomer?.totalPoints || 0;
      const newBalance = Math.max(0, currentPoints - pointsToDeduct);
      const actualDeduction = currentPoints - newBalance;

      if (actualDeduction > 0) {
        // Create point ledger entry for deduction
        const itemName = targetItem.label || targetItem.name || targetItem.menuName || '메뉴';
        const cancelReason = isFullyCancelled
          ? `주문 취소 차감 (${itemName})`
          : `주문 취소 차감 (${itemName} ${cancelQty}개)`;

        await prisma.pointLedger.create({
          data: {
            storeId,
            customerId: id,
            delta: -actualDeduction,
            balance: newBalance,
            type: 'ADJUST',
            reason: cancelReason,
            orderId: visitOrOrder.orderId,
          },
        });

        // Update customer's total points
        await prisma.customer.update({
          where: { id },
          data: { totalPoints: newBalance },
        });

        // Send AlimTalk notification for point deduction (with negative points)
        const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
        if (phoneNumber) {
          // Get the newly created point ledger entry
          const pointLedger = await prisma.pointLedger.findFirst({
            where: { customerId: id, type: 'ADJUST' },
            orderBy: { createdAt: 'desc' },
          });

          if (pointLedger) {
            enqueuePointsEarnedAlimTalk({
              storeId,
              customerId: id,
              pointLedgerId: pointLedger.id,
              phone: phoneNumber,
              variables: {
                storeName: customer.store.name,
                points: -actualDeduction, // 음수로 전달 (예: -550)
                totalPoints: newBalance,
              },
            }).catch((err) => {
              console.error('[Cancel Order Item] AlimTalk enqueue failed:', err);
            });
          }
        }
      }
    }

    // Get menu name for response
    const menuName = targetItem.label || targetItem.name || targetItem.menuName || targetItem.productName || '메뉴';

    // Build response message
    const cancelMessage = isFullyCancelled
      ? `${menuName} 주문이 취소되었습니다.`
      : `${menuName} ${cancelQty}개가 취소되었습니다. (남은 수량: ${itemTotalQty - newCancelledQty}개)`;

    res.json({
      success: true,
      message: cancelMessage,
      pointsDeducted: pointsToDeduct,
      cancelledItem: {
        name: menuName,
        price: cancelledPrice,
        cancelledQuantity: cancelQty,
        totalQuantity: itemTotalQty,
        remainingQuantity: itemTotalQty - newCancelledQty,
        isFullyCancelled,
      },
    });
  } catch (error) {
    console.error('Cancel order item error:', error);
    res.status(500).json({ error: '주문 취소 중 오류가 발생했습니다.' });
  }
});

// GET /api/customers/:id/messages - Get messages sent to a customer
router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;
    const { page = '1', limit = '20' } = req.query;

    // Verify customer exists and belongs to the store
    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [messages, total] = await Promise.all([
      prisma.smsMessage.findMany({
        where: { storeId, customerId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          campaign: {
            select: { title: true },
          },
        },
      }),
      prisma.smsMessage.count({ where: { storeId, customerId: id } }),
    ]);

    // Count by status
    const statusCounts = await prisma.smsMessage.groupBy({
      by: ['status'],
      where: { storeId, customerId: id },
      _count: { id: true },
    });

    const sentCount = statusCounts.find((s) => s.status === 'SENT')?._count.id || 0;
    const failedCount = statusCounts.find((s) => s.status === 'FAILED')?._count.id || 0;

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        status: m.status,
        cost: m.cost,
        failReason: m.failReason,
        sentAt: m.sentAt,
        createdAt: m.createdAt,
        campaignTitle: m.campaign?.title || null,
      })),
      summary: {
        total,
        sent: sentCount,
        failed: failedCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Customer messages error:', error);
    res.status(500).json({ error: '발송 내역 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/customers/:id/orders - Get customer orders with date filtering
router.get('/:id/orders', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;
    const { startDate, endDate, page = '1', limit = '20' } = req.query;

    // Verify customer exists and belongs to the store
    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // Build where clause with date filtering
    const where: any = { storeId, customerId: id };

    if (startDate || endDate) {
      where.visitedAt = {};
      if (startDate) {
        where.visitedAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.visitedAt.lte = end;
      }
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      prisma.visitOrOrder.findMany({
        where,
        orderBy: { visitedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.visitOrOrder.count({ where }),
    ]);

    // Normalize items for response
    const normalizedOrders = orders.map((order) => {
      let normalizedItems: any[] = [];
      let tableNumber: string | null = null;

      const itemsData = order.items as any;
      if (itemsData) {
        if (Array.isArray(itemsData)) {
          normalizedItems = itemsData.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        } else if (typeof itemsData === 'object') {
          tableNumber = itemsData.tableNumber || null;
          const rawItems = itemsData.items || [];
          normalizedItems = rawItems.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
            cancelled: item.cancelled || false,
            cancelledAt: item.cancelledAt || null,
          }));
        }
      }

      return {
        ...order,
        items: normalizedItems,
        tableNumber,
      };
    });

    res.json({
      orders: normalizedOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Customer orders error:', error);
    res.status(500).json({ error: '주문 내역 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
