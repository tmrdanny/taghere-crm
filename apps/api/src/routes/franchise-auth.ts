import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';

const router = Router();

// 한글을 로마자로 변환 (간단한 음차 테이블)
const koreanToRoman: { [key: string]: string } = {
  'ㄱ': 'g', 'ㄲ': 'kk', 'ㄴ': 'n', 'ㄷ': 'd', 'ㄸ': 'tt', 'ㄹ': 'r', 'ㅁ': 'm',
  'ㅂ': 'b', 'ㅃ': 'pp', 'ㅅ': 's', 'ㅆ': 'ss', 'ㅇ': '', 'ㅈ': 'j', 'ㅉ': 'jj',
  'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h',
  'ㅏ': 'a', 'ㅐ': 'ae', 'ㅑ': 'ya', 'ㅒ': 'yae', 'ㅓ': 'eo', 'ㅔ': 'e', 'ㅕ': 'yeo',
  'ㅖ': 'ye', 'ㅗ': 'o', 'ㅘ': 'wa', 'ㅙ': 'wae', 'ㅚ': 'oe', 'ㅛ': 'yo', 'ㅜ': 'u',
  'ㅝ': 'wo', 'ㅞ': 'we', 'ㅟ': 'wi', 'ㅠ': 'yu', 'ㅡ': 'eu', 'ㅢ': 'ui', 'ㅣ': 'i',
};

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JONG_ROMAN: { [key: string]: string } = {
  '': '', 'ㄱ': 'k', 'ㄲ': 'k', 'ㄳ': 'ks', 'ㄴ': 'n', 'ㄵ': 'nj', 'ㄶ': 'nh',
  'ㄷ': 't', 'ㄹ': 'l', 'ㄺ': 'lk', 'ㄻ': 'lm', 'ㄼ': 'lb', 'ㄽ': 'ls', 'ㄾ': 'lt',
  'ㄿ': 'lp', 'ㅀ': 'lh', 'ㅁ': 'm', 'ㅂ': 'p', 'ㅄ': 'ps', 'ㅅ': 't', 'ㅆ': 't',
  'ㅇ': 'ng', 'ㅈ': 't', 'ㅊ': 't', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h',
};

function koreanCharToRoman(char: string): string {
  const code = char.charCodeAt(0);

  // 한글 음절 범위 (가 ~ 힣)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const syllableIndex = code - 0xAC00;
    const choIndex = Math.floor(syllableIndex / (21 * 28));
    const jungIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
    const jongIndex = syllableIndex % 28;

    const cho = koreanToRoman[CHO[choIndex]] || '';
    const jung = koreanToRoman[JUNG[jungIndex]] || '';
    const jong = JONG_ROMAN[JONG[jongIndex]] || '';

    return cho + jung + jong;
  }

  return char;
}

function generateSlug(brandName: string): string {
  let slug = '';

  for (const char of brandName) {
    const code = char.charCodeAt(0);

    if (code >= 0xAC00 && code <= 0xD7A3) {
      // 한글
      slug += koreanCharToRoman(char);
    } else if (/[a-zA-Z0-9]/.test(char)) {
      // 영문/숫자
      slug += char.toLowerCase();
    } else if (char === ' ' || char === '-' || char === '_') {
      // 공백/하이픈
      slug += '-';
    }
    // 그 외 특수문자는 무시
  }

  // 연속된 하이픈 제거 및 앞뒤 하이픈 제거
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');

  return slug || 'franchise';
}

async function getUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.franchise.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// POST /api/franchise/auth/register - 프랜차이즈 회원가입
router.post('/register', async (req, res) => {
  try {
    const { brandName, ownerName, email, password, phone } = req.body;

    // 필수 필드 검증
    if (!brandName || !ownerName || !email || !password) {
      return res.status(400).json({ error: '필수 필드를 모두 입력해주세요. (브랜드명, 대표자명, 이메일, 비밀번호)' });
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '유효한 이메일 형식을 입력해주세요.' });
    }

    // 이메일 중복 체크 (프랜차이즈 사용자)
    const existingUser = await prisma.franchiseUser.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    // slug 생성
    const baseSlug = generateSlug(brandName);
    const slug = await getUniqueSlug(baseSlug);

    // 트랜잭션으로 Franchise, FranchiseWallet, FranchiseUser 동시 생성
    const result = await prisma.$transaction(async (tx) => {
      // Franchise 생성
      const franchise = await tx.franchise.create({
        data: {
          name: brandName,
          slug,
        },
      });

      // FranchiseWallet 생성 (초기 잔액 0)
      await tx.franchiseWallet.create({
        data: {
          franchiseId: franchise.id,
          balance: 0,
        },
      });

      // FranchiseUser 생성 (OWNER 역할)
      const user = await tx.franchiseUser.create({
        data: {
          franchiseId: franchise.id,
          email,
          passwordHash,
          name: ownerName,
          phone: phone || null,
          role: 'OWNER',
        },
        include: { franchise: true },
      });

      return user;
    });

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        id: result.id,
        email: result.email,
        franchiseId: result.franchiseId,
        role: result.role,
        isFranchise: true,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        phone: result.phone,
        role: result.role,
        franchise: {
          id: result.franchise.id,
          name: result.franchise.name,
          slug: result.franchise.slug,
        },
      },
    });
  } catch (error) {
    console.error('Franchise register error:', error);
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
  }
});

// POST /api/franchise/auth/login - 프랜차이즈 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const user = await prisma.franchiseUser.findUnique({
      where: { email },
      include: { franchise: true },
    });

    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        franchiseId: user.franchiseId,
        role: user.role,
        isFranchise: true,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        franchise: {
          id: user.franchise.id,
          name: user.franchise.name,
          slug: user.franchise.slug,
          logoUrl: user.franchise.logoUrl,
        },
      },
    });
  } catch (error) {
    console.error('Franchise login error:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/auth/me - 현재 사용자 정보
router.get('/me', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const user = await prisma.franchiseUser.findUnique({
      where: { id: req.franchiseUser!.id },
      include: { franchise: true },
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      franchise: {
        id: user.franchise.id,
        name: user.franchise.name,
        slug: user.franchise.slug,
        logoUrl: user.franchise.logoUrl,
      },
    });
  } catch (error) {
    console.error('Franchise me error:', error);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/auth/logo - 프랜차이즈 로고 이미지 제공
router.get('/logo', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: {
        logo: true,
        logoMimeType: true,
      },
    });

    if (!franchise || !franchise.logo || !franchise.logoMimeType) {
      return res.status(404).json({ error: '로고를 찾을 수 없습니다.' });
    }

    res.set('Content-Type', franchise.logoMimeType);
    res.set('Cache-Control', 'public, max-age=86400'); // 1일 캐시
    res.send(franchise.logo);
  } catch (error) {
    console.error('Failed to fetch franchise logo:', error);
    res.status(500).json({ error: '로고 조회에 실패했습니다.' });
  }
});

export default router;
