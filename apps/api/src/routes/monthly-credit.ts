/**
 * 월별 무료 메시지 크레딧 API
 *
 * - GET /api/monthly-credit/status - 현재 월 크레딧 상태 조회
 * - GET /api/monthly-credit/history - 크레딧 사용 내역 조회
 */

import { Router, Request, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import {
  getCreditStatus,
  getCreditUsageHistory,
  getCurrentYearMonth,
} from '../services/credit-service.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

/**
 * GET /api/monthly-credit/status
 * 현재 월 무료 크레딧 상태 조회
 */
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;

    const status = await getCreditStatus(storeId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Failed to get monthly credit status:', error);
    res.status(500).json({
      success: false,
      error: '크레딧 상태 조회 중 오류가 발생했습니다.',
    });
  }
});

/**
 * GET /api/monthly-credit/history
 * 크레딧 사용 내역 조회
 *
 * Query params:
 * - yearMonth: 조회할 연월 (예: "2026-01", 기본값: 현재 월)
 * - limit: 조회 개수 (기본값: 50)
 */
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const { yearMonth, limit } = req.query;

    const targetYearMonth = (yearMonth as string) || getCurrentYearMonth();
    const limitNum = parseInt(limit as string, 10) || 50;

    const history = await getCreditUsageHistory(storeId, targetYearMonth, limitNum);

    res.json({
      success: true,
      data: {
        yearMonth: targetYearMonth,
        history,
      },
    });
  } catch (error) {
    console.error('Failed to get credit usage history:', error);
    res.status(500).json({
      success: false,
      error: '크레딧 사용 내역 조회 중 오류가 발생했습니다.',
    });
  }
});

export default router;
