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
    const {
      phone,
      gender,
      ageGroup,
      regionSido,
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
      return res.status(400).json({ error: '지역 정보가 필요합니다.' });
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
          regionSigungu: '', // 폼에서는 시/군/구 미수집
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
        regionSigungu: '',
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
  } catch (error) {
    console.error('Error in gain-customer:', error);
    res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
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

export default router;
