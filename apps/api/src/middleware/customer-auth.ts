import { Request, Response, NextFunction } from 'express';
import { verifyCustomerToken, CustomerTokenPayload } from '../utils/customer-token.js';

export interface CustomerAuthRequest extends Request {
  customer?: CustomerTokenPayload;
}

/** 고객 마이페이지 전용 인증 — 고객 토큰(typ: customer)만 통과시킨다 */
export function customerAuthMiddleware(req: CustomerAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  const payload = verifyCustomerToken(authHeader.split(' ')[1]);
  if (!payload) {
    return res.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해주세요.' });
  }

  req.customer = payload;
  next();
}
