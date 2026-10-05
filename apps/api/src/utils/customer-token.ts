// 고객 마이페이지 로그인 증표(JWT)
//
// 사장님·프랜차이즈 인증은 JWT_SECRET 을 쓰고 토큰 종류(typ)를 확인하지 않는다.
// 같은 키를 쓰면 고객 토큰으로 사장님 API 가 열리므로 고객 전용 키(CUSTOMER_JWT_SECRET)를 따로 쓴다.
// 키가 없으면 index.ts 필수 환경변수 검사에서 서버가 뜨지 않는다 — JWT_SECRET 으로 대신 쓰는 경로는 두지 않는다.

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type CustomerLoginProvider = 'kakao' | 'naver';

export interface CustomerTokenPayload {
  typ: 'customer';
  provider: CustomerLoginProvider;
  /** 정규화된 휴대폰 번호(01012345678). 번호 제공에 동의하지 않았으면 없음 */
  phone?: string;
  /** 카카오 로그인일 때만 */
  kakaoId?: string;
  /** 발급 시각(초) — jwt 가 채운다 */
  iat?: number;
}

const TOKEN_TTL = '30d';

function getSecret(): string {
  const secret = env.CUSTOMER_JWT_SECRET;
  if (!secret) {
    throw new Error('CUSTOMER_JWT_SECRET is not configured');
  }
  return secret;
}

export function signCustomerToken(payload: Omit<CustomerTokenPayload, 'typ' | 'iat'>): string {
  const body: CustomerTokenPayload = { typ: 'customer', provider: payload.provider };
  if (payload.phone) body.phone = payload.phone;
  if (payload.kakaoId) body.kakaoId = payload.kakaoId;
  return jwt.sign(body, getSecret(), { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

/** 유효한 고객 토큰이면 내용을, 아니면 null 을 돌려준다 */
export function verifyCustomerToken(token: string): CustomerTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as CustomerTokenPayload;
    if (decoded?.typ !== 'customer') return null;
    if (!decoded.phone && !decoded.kakaoId) return null;
    return decoded;
  } catch {
    return null;
  }
}
