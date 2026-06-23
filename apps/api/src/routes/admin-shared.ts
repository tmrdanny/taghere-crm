import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 어드민 라우터 공통 타입/미들웨어
// admin.ts 및 도메인별 어드민 서브라우터에서 공유한다.

export interface AdminRequest extends Request {
  isAdmin?: boolean;
}

// 어드민 계정 (환경변수 필수)
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'taghere';
// 비밀번호는 bcrypt 해시로 저장 (ADMIN_PASSWORD_HASH 환경변수 사용)
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// 어드민 JWT 검증 미들웨어
export const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { isSystemAdmin: boolean };

    if (!decoded.isSystemAdmin) {
      return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};
