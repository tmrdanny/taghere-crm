import { Request, Response, NextFunction } from 'express';
import { isValidWebhookToken } from '../services/taghere-api.js';

export interface WebhookRequest extends Request {
  webhookVerified?: boolean;
}

export const webhookAuthMiddleware = (req: WebhookRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header required',
      message: 'Bearer 토큰이 필요합니다.'
    });
  }

  const token = authHeader.split(' ')[1];

  if (!isValidWebhookToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid token',
      message: '유효하지 않은 토큰입니다.'
    });
  }

  req.webhookVerified = true;
  next();
};
