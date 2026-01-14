import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface FranchiseAuthRequest extends Request {
  franchiseUser?: {
    id: string;
    email: string;
    franchiseId: string;
    role: string;
    isFranchise: true;
  };
}

export async function franchiseAuthMiddleware(
  req: FranchiseAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      franchiseId: string;
      role: string;
      isFranchise?: boolean;
    };

    // 프랜차이즈 토큰인지 확인
    if (!decoded.isFranchise || !decoded.franchiseId) {
      return res.status(401).json({ error: '프랜차이즈 계정이 아닙니다.' });
    }

    req.franchiseUser = {
      id: decoded.id,
      email: decoded.email,
      franchiseId: decoded.franchiseId,
      role: decoded.role,
      isFranchise: true,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}
