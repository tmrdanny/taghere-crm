import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 태그히어 서버 연동 설정
const TAGHERE_CRM_BASE_URL = process.env.TAGHERE_CRM_BASE_URL || 'https://taghere-crm-web-dev.onrender.com';
const TAGHERE_API_BASE = process.env.TAGHERE_API_URL || 'https://api.d.tag-here.com';
const TAGHERE_WEBHOOK_URL = process.env.TAGHERE_WEBHOOK_URL || `${TAGHERE_API_BASE}/webhook/crm`;
const TAGHERE_WEBHOOK_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || process.env.TAGHERE_WEBHOOK_TOKEN || process.env.TAGHERE_DEV_API_TOKEN || '';

// 매장 생성 시 태그히어 서버에 CRM 활성화 알림
async function notifyTaghereCrmOnStoreCreate(userId: string, slug: string): Promise<void> {
  console.log(`[TagHere CRM] notifyTaghereCrmOnStoreCreate called - userId: ${userId}, slug: ${slug}`);
  console.log(`[TagHere CRM] TAGHERE_WEBHOOK_TOKEN configured: ${!!TAGHERE_WEBHOOK_TOKEN}, length: ${TAGHERE_WEBHOOK_TOKEN.length}`);

  if (!TAGHERE_WEBHOOK_TOKEN) {
    console.log('[TagHere CRM] TAGHERE_WEBHOOK_TOKEN not configured, skipping notification');
    return;
  }

  // 기본값: 포인트 적립 URL
  const redirectUrl = `${TAGHERE_CRM_BASE_URL}/taghere-enroll/${slug}?ordersheetId={ordersheetId}`;
  const requestBody = { userId, redirectUrl };

  console.log(`[TagHere CRM] Sending request to ${TAGHERE_WEBHOOK_URL}/on`);
  console.log(`[TagHere CRM] Request body:`, JSON.stringify(requestBody));

  try {
    const response = await fetch(`${TAGHERE_WEBHOOK_URL}/on`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAGHERE_WEBHOOK_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[TagHere CRM] Store create on failed: status=${response.status}, body=${responseText}`);
    } else {
      console.log(`[TagHere CRM] Store create on success - userId: ${userId}, slug: ${slug}, response: ${responseText}`);
    }
  } catch (error) {
    console.error('[TagHere CRM] Store create on error:', error);
  }
}

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

function generateSlug(storeName: string): string {
  let slug = '';

  for (const char of storeName) {
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

  return slug || 'store';
}

async function getUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.store.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// POST /api/auth/register - 회원가입
router.post('/register', async (req, res) => {
  try {
    const { storeName, category, ownerName, phone, businessRegNumber, address, naverPlaceUrl, email, password } = req.body;

    // 필수 필드 검증
    if (!storeName || !ownerName || !phone || !businessRegNumber || !address || !email || !password) {
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    // 이메일 중복 체크
    const existingUser = await prisma.staffUser.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }

    // 사업자등록번호 중복 체크
    const existingStore = await prisma.store.findUnique({
      where: { businessRegNumber },
    });

    if (existingStore) {
      return res.status(400).json({ error: '이미 등록된 사업자등록번호입니다.' });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    // slug 생성
    const baseSlug = generateSlug(storeName);
    const slug = await getUniqueSlug(baseSlug);

    // 트랜잭션으로 Store, StaffUser, Wallet 동시 생성
    const result = await prisma.$transaction(async (tx) => {
      // Store 생성 (기본 포인트 적립률 5%)
      const store = await tx.store.create({
        data: {
          name: storeName,
          category: category || null,
          slug,
          ownerName,
          phone,
          businessRegNumber,
          address,
          naverPlaceUrl: naverPlaceUrl?.trim() || null,
          pointRatePercent: 5,
        },
      });

      // Wallet 생성 (초기 충전금 500원)
      await tx.wallet.create({
        data: {
          storeId: store.id,
          balance: 500,
        },
      });

      // 기본 웨이팅 설정 생성 (접수 중 상태)
      await tx.waitingSetting.create({
        data: {
          storeId: store.id,
          operationStatus: 'ACCEPTING',
        },
      });

      // 기본 웨이팅 유형 생성 (홀, 5분)
      await tx.waitingType.create({
        data: {
          storeId: store.id,
          name: '홀',
          avgWaitTimePerTeam: 5,
          sortOrder: 0,
          isActive: true,
        },
      });

      // StaffUser 생성 (OWNER 권한)
      const user = await tx.staffUser.create({
        data: {
          storeId: store.id,
          email,
          passwordHash,
          name: ownerName,
          role: 'OWNER',
        },
        include: { store: true },
      });

      return user;
    });

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        id: result.id,
        email: result.email,
        storeId: result.storeId,
        role: result.role,
        isAdmin: result.isAdmin,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    // 태그히어 서버에 CRM 활성화 알림 (비동기, 에러가 발생해도 회원가입은 성공 처리)
    notifyTaghereCrmOnStoreCreate(email, slug).catch((err) => {
      console.error('[Auth] Failed to notify TagHere on store create:', err);
    });

    res.status(201).json({
      token,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        isAdmin: result.isAdmin,
        profileImage: result.profileImage,
        store: {
          id: result.store.id,
          name: result.store.name,
        },
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const user = await prisma.staffUser.findUnique({
      where: { email },
      include: { store: true },
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
        storeId: user.storeId,
        role: user.role,
        isAdmin: user.isAdmin,
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
        role: user.role,
        isAdmin: user.isAdmin,
        profileImage: user.profileImage,
        store: {
          id: user.store.id,
          name: user.store.name,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});

// GET /api/me
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.staffUser.findUnique({
      where: { id: req.user!.id },
      include: { store: true },
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
      profileImage: user.profileImage,
      store: {
        id: user.store.id,
        name: user.store.name,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
