import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

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

    // Filter by VIP (visit count > 20 or total points > 5000)
    if (isVip === 'true') {
      orConditions.push({ visitCount: { gte: 20 } }, { totalPoints: { gte: 5000 } });
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

    // Determine VIP status
    const customersWithVip = customers.map((customer) => ({
      ...customer,
      isVip: customer.visitCount >= 20 || customer.totalPoints >= 5000,
      isNew: customer.visitCount <= 1,
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
          }));
        } else if (typeof itemsData === 'object') {
          // 새로운 형식: { items: [], tableNumber: string }
          tableNumber = itemsData.tableNumber || null;
          const rawItems = itemsData.items || [];
          normalizedItems = rawItems.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
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

// POST /api/customers/feedback - Public endpoint for customer feedback (from enroll page)
router.post('/feedback', async (req, res) => {
  try {
    const { customerId, feedbackRating, feedbackText } = req.body;

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
      },
    });

    res.json({ success: true, customer: updatedCustomer, feedback });
  } catch (error) {
    console.error('Customer feedback error:', error);
    res.status(500).json({ error: '피드백 저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/customers/:id/cancel-order-item - Cancel a specific item in an order
router.post('/:id/cancel-order-item', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;
    const { visitOrOrderId, itemIndex } = req.body;

    if (!visitOrOrderId || itemIndex === undefined) {
      return res.status(400).json({ error: '주문 ID와 아이템 인덱스가 필요합니다.' });
    }

    // Verify customer exists and belongs to the store
    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
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

    const cancelledItem = items[itemIndex];

    // Check if already cancelled
    if (cancelledItem.cancelled) {
      return res.status(400).json({ error: '이미 취소된 아이템입니다.' });
    }

    // Calculate points to deduct
    // Get the store's point policy
    const pointPolicy = await prisma.pointPolicy.findUnique({
      where: { storeId },
    });

    const itemPrice = typeof cancelledItem.price === 'string'
      ? parseInt(cancelledItem.price, 10)
      : (cancelledItem.price || cancelledItem.totalPrice || 0);
    const itemQty = cancelledItem.count || cancelledItem.quantity || cancelledItem.qty || 1;
    const itemTotalPrice = itemPrice * itemQty;

    let pointsToDeduct = 0;
    if (pointPolicy) {
      if (pointPolicy.type === 'PERCENT') {
        pointsToDeduct = Math.floor(itemTotalPrice * (pointPolicy.value / 100));
      } else {
        // FIXED: 고정 포인트는 주문당이므로, 아이템 개별 취소시에는 비율로 계산
        // 전체 주문 금액 대비 해당 아이템 금액 비율로 포인트 차감
        const totalAmount = visitOrOrder.totalAmount || 0;
        if (totalAmount > 0) {
          pointsToDeduct = Math.floor(pointPolicy.value * (itemTotalPrice / totalAmount));
        }
      }
    }

    // Mark item as cancelled
    items[itemIndex] = { ...cancelledItem, cancelled: true, cancelledAt: new Date().toISOString() };

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
        await prisma.pointLedger.create({
          data: {
            storeId,
            customerId: id,
            delta: -actualDeduction,
            balance: newBalance,
            type: 'ADJUST',
            reason: `주문 취소 차감 (${cancelledItem.label || cancelledItem.name || cancelledItem.menuName || '메뉴'})`,
            orderId: visitOrOrder.orderId,
          },
        });

        // Update customer's total points
        await prisma.customer.update({
          where: { id },
          data: { totalPoints: newBalance },
        });
      }
    }

    // Get menu name for response
    const menuName = cancelledItem.label || cancelledItem.name || cancelledItem.menuName || cancelledItem.productName || '메뉴';

    res.json({
      success: true,
      message: `${menuName} 주문이 취소되었습니다.`,
      pointsDeducted: pointsToDeduct,
      cancelledItem: {
        name: menuName,
        price: itemTotalPrice,
      },
    });
  } catch (error) {
    console.error('Cancel order item error:', error);
    res.status(500).json({ error: '주문 취소 중 오류가 발생했습니다.' });
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
