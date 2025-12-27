import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  fetchAndSaveNaverReviewStats,
  getNaverReviewChartData,
  getDailyReviewGrowth,
} from '../services/naver-review.js';

const router = Router();

// GET /api/naver-review/stats - 네이버 리뷰 통계 조회
router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const growth = await getDailyReviewGrowth(storeId);

    res.json(growth);
  } catch (error) {
    console.error('Naver review stats error:', error);
    res.status(500).json({ error: '네이버 리뷰 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/naver-review/chart - 네이버 리뷰 차트 데이터 조회
router.get('/chart', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const days = parseInt(req.query.days as string) || 7;

    const chartData = await getNaverReviewChartData(storeId, days);

    res.json({ chartData });
  } catch (error) {
    console.error('Naver review chart error:', error);
    res.status(500).json({ error: '네이버 리뷰 차트 데이터 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/naver-review/refresh - 네이버 리뷰 수 새로고침
router.post('/refresh', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const counts = await fetchAndSaveNaverReviewStats(storeId);

    if (!counts) {
      return res.status(400).json({
        error: '네이버 플레이스 URL이 설정되지 않았거나 리뷰 수를 가져올 수 없습니다.',
      });
    }

    // 업데이트된 통계도 함께 반환
    const growth = await getDailyReviewGrowth(storeId);

    res.json({
      success: true,
      counts,
      stats: growth,
    });
  } catch (error) {
    console.error('Naver review refresh error:', error);
    res.status(500).json({ error: '네이버 리뷰 새로고침 중 오류가 발생했습니다.' });
  }
});

export default router;
