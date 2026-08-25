import { Router } from 'express';
import ordersheetRouter, { orderDetailsRouter } from './ordersheet.js';
import webhooksRouter from './webhooks.js';
import stampScanRouter from './stamp-scan.js';
import tableLinkRouter from './table-link.js';
import foodCourtRouter from './food-court.js';
import stampEarnRouter from './stamp-earn.js';
import surveyRouter from './survey.js';

// taghere.ts 갓파일 분해 — 원래 등록 순서 그대로 조립 (라우트 인벤토리 스냅샷으로 검증)
const router = Router();
router.use(ordersheetRouter);
router.use(webhooksRouter);
router.use(stampScanRouter);
router.use(tableLinkRouter);
router.use(foodCourtRouter);
router.use(stampEarnRouter);
router.use(surveyRouter);
router.use(orderDetailsRouter);

export default router;
