// 로그인 없이 여는 사장님 링크 — 알림톡 버튼(…/o/{토큰})으로 보낸다.
//
// - 토큰 원문은 저장하지 않고 sha256 만 저장한다 (DB 가 새도 링크를 만들 수 없게).
// - 링크는 14일 동안 유효하고, 열면 그 매장 사장님 계정으로 12시간짜리 로그인 토큰을 준다.
//   (관리자 "매장으로 로그인" 과 같은 방식 — 링크는 매장에 등록된 사장님 번호로만 보낸다)
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

export const OWNER_LINK_TTL_DAYS = 14;
const SESSION_TTL = '12h';

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** 웹 주소 — 알림톡 버튼 링크의 앞부분 (템플릿에 고정된 도메인과 같아야 한다) */
export function ownerLinkBase(): string {
  return (env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com').replace(/\/$/, '');
}

export async function createOwnerLink(p: { storeId: string; purpose: 'REPORT' | 'TOPUP'; noticeId?: string }): Promise<{ token: string; url: string }> {
  // URL 에 넣기 좋은 22자 (128bit)
  const token = crypto.randomBytes(16).toString('base64url');
  await prisma.ownerLink.create({
    data: {
      storeId: p.storeId,
      tokenHash: hash(token),
      purpose: p.purpose,
      noticeId: p.noticeId ?? null,
      expiresAt: new Date(Date.now() + OWNER_LINK_TTL_DAYS * 86400000),
    },
  });
  return { token, url: `${ownerLinkBase()}/o/${token}` };
}

export interface OpenedLink {
  linkId: string;
  storeId: string;
  purpose: string;
  /** 사장님 계정으로 쓰는 12시간 로그인 토큰 (계정이 없는 매장이면 null) */
  session: string | null;
}

/** 링크 열기 — 유효하면 열람 기록을 남기고 로그인 토큰을 준다 */
export async function openOwnerLink(token: string): Promise<OpenedLink | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const link = await prisma.ownerLink.findUnique({ where: { tokenHash: hash(token) } });
  if (!link || link.expiresAt.getTime() < Date.now()) return null;

  const now = new Date();
  await prisma.ownerLink.update({
    where: { id: link.id },
    data: { openCount: { increment: 1 }, lastOpenedAt: now, firstOpenedAt: link.firstOpenedAt ?? now },
  });

  // 사장님(OWNER) 계정 우선, 없으면 가장 먼저 만든 계정
  const users = await prisma.staffUser.findMany({
    where: { storeId: link.storeId },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const user = users.find((u) => u.role === 'OWNER') ?? users[0];
  const session =
    user && env.JWT_SECRET
      ? jwt.sign(
          { id: user.id, email: user.email, storeId: link.storeId, role: user.role, isAdmin: false, via: 'owner-link' },
          env.JWT_SECRET,
          { expiresIn: SESSION_TTL }
        )
      : null;

  return { linkId: link.id, storeId: link.storeId, purpose: link.purpose, session };
}
