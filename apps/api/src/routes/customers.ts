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

    res.json({
      ...customer,
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
    const { name, phone, gender, birthday, memo, initialPoints, feedbackRating, feedbackText } = req.body;

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
        birthday: birthday ? new Date(birthday) : null,
        memo: memo || null,
        totalPoints: initialPoints || 0,
        visitCount: 0,
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
    const { name, gender, birthday, memo, feedbackRating, feedbackText } = req.body;

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
      updateData.birthday = birthday ? new Date(birthday) : null;
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

export default router;
