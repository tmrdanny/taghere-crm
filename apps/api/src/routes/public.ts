import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/public/gain-customer
 * 고객 정보 수집 폼 제출 (로그인 불필요)
 */
router.post('/gain-customer', async (req: Request, res: Response) => {
  try {
    // 요청 데이터 로깅
    console.log('[gain-customer] Request body:', JSON.stringify(req.body, null, 2));

    const {
      phone,
      gender,
      ageGroup,
      regionSido,
      regionSigungu,
      preferredCategories,
      consentMarketing,
    } = req.body;

    // 필수 필드 검증
    if (!phone) {
      return res.status(400).json({ error: '연락처를 입력해주세요.' });
    }
    if (!ageGroup) {
      return res.status(400).json({ error: '연령대 정보가 필요합니다.' });
    }
    if (!regionSido) {
      return res.status(400).json({ error: '시/도를 선택해주세요.' });
    }
    if (!regionSigungu) {
      return res.status(400).json({ error: '시/군/구를 선택해주세요.' });
    }
    if (!consentMarketing) {
      return res.status(400).json({ error: '마케팅 수신 동의가 필요합니다.' });
    }

    // 전화번호 정규화 (숫자만)
    const normalizedPhone = phone.replace(/[^0-9]/g, '');

    // 전화번호 형식 검증 (10-11자리)
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    // 기존 고객 확인
    const existingCustomer = await prisma.externalCustomer.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingCustomer) {
      // 기존 고객 업데이트
      await prisma.externalCustomer.update({
        where: { phone: normalizedPhone },
        data: {
          gender: gender || null,
          ageGroup,
          regionSido,
          regionSigungu,
          preferredCategories: preferredCategories
            ? JSON.stringify(preferredCategories)
            : null,
          consentMarketing: true,
          consentAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: '정보가 업데이트되었습니다.',
        isNew: false,
      });
    }

    // 신규 고객 생성
    await prisma.externalCustomer.create({
      data: {
        phone: normalizedPhone,
        gender: gender || null,
        ageGroup,
        regionSido,
        regionSigungu,
        preferredCategories: preferredCategories
          ? JSON.stringify(preferredCategories)
          : null,
        consentMarketing: true,
        consentAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: '등록이 완료되었습니다.',
      isNew: true,
    });
  } catch (error: any) {
    console.error('Error in gain-customer:', error);
    console.error('Error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    });

    // Prisma 유효성 검증 에러인 경우 더 구체적인 메시지 반환
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: '이미 등록된 전화번호입니다.' });
    }
    if (error?.code === 'P2003') {
      return res.status(400).json({ error: '잘못된 참조 데이터입니다.' });
    }

    res.status(500).json({
      error: '등록 중 오류가 발생했습니다.',
      detail: error?.message,
      code: error?.code,
    });
  }
});

/**
 * GET /api/public/regions
 * 지역 목록 조회 (폼에서 사용)
 */
router.get('/regions', async (req: Request, res: Response) => {
  try {
    const sidos = [
      '서울',
      '경기',
      '인천',
      '부산',
      '대구',
      '광주',
      '대전',
      '울산',
      '세종',
      '강원',
      '충북',
      '충남',
      '전북',
      '전남',
      '경북',
      '경남',
      '제주',
    ];

    res.json({ sidos });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ error: '지역 목록을 불러오는 중 오류가 발생했습니다.' });
  }
});

/**
 * GET /api/public/coupon/:code
 * 쿠폰 정보 조회 (직원 확인 페이지용)
 */
router.get('/coupon/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ error: '쿠폰 코드가 필요합니다.' });
    }

    const coupon = await (prisma as any).retargetCoupon.findUnique({
      where: { code },
      include: {
        store: {
          select: { name: true },
        },
      },
    });

    if (!coupon) {
      return res.status(404).json({ error: '존재하지 않는 쿠폰입니다.' });
    }

    // 전화번호 마스킹 (010-****-5678)
    const phone = coupon.phone || '';
    const maskedPhone = phone.length >= 8
      ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}`
      : phone;

    res.json({
      code: coupon.code,
      storeName: coupon.store.name,
      couponContent: coupon.couponContent,
      expiryDate: coupon.expiryDate,
      phone: maskedPhone,
      isUsed: !!coupon.usedAt,
      usedAt: coupon.usedAt,
      usedBy: coupon.usedBy,
      createdAt: coupon.createdAt,
    });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({ error: '쿠폰 정보를 불러오는 중 오류가 발생했습니다.' });
  }
});

/**
 * POST /api/public/coupon/:code/use
 * 쿠폰 사용 완료 처리
 */
router.post('/coupon/:code/use', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ error: '쿠폰 코드가 필요합니다.' });
    }

    const coupon = await (prisma as any).retargetCoupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return res.status(404).json({ error: '존재하지 않는 쿠폰입니다.' });
    }

    if (coupon.usedAt) {
      return res.status(400).json({
        error: '이미 사용된 쿠폰입니다.',
        usedAt: coupon.usedAt,
      });
    }

    // 직원명 가져오기
    const { staffName } = req.body || {};

    // 쿠폰 사용 처리
    const updatedCoupon = await (prisma as any).retargetCoupon.update({
      where: { code },
      data: {
        usedAt: new Date(),
        usedBy: staffName || '직원 확인',
      },
    });

    res.json({
      success: true,
      message: '쿠폰이 사용 처리되었습니다.',
      usedAt: updatedCoupon.usedAt,
    });
  } catch (error) {
    console.error('Error using coupon:', error);
    res.status(500).json({ error: '쿠폰 사용 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
