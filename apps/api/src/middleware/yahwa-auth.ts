import { Request, Response, NextFunction } from 'express';

/**
 * 야화(외부 파트너) 고정 API Key 인증 미들웨어
 *
 * - 헤더: Authorization: Bearer <YAHWA_API_KEY>
 * - 잘못된/누락 키 → 401 { "error": "unauthorized" }
 * - 환경(sandbox/production)은 배포 환경별 env 값으로 분리한다.
 * - YAHWA_API_KEY 는 콤마로 여러 개 지정 가능(키 로테이션 대응).
 */
export interface YahwaRequest extends Request {
  yahwaVerified?: boolean;
}

function getValidKeys(): string[] {
  return (process.env.YAHWA_API_KEY || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export const yahwaAuthMiddleware = (req: YahwaRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const validKeys = getValidKeys();

  if (validKeys.length === 0) {
    // 키가 서버에 설정되지 않은 경우에도 보안상 인증 실패로 처리
    console.error('[Yahwa] YAHWA_API_KEY is not configured');
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!validKeys.includes(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.yahwaVerified = true;
  next();
};
