import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import rateLimit from 'express-rate-limit';

// Load environment variables (production uses system env, dev uses .env file)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

// 필수 환경변수 검증
const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
];

const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Import routes
import authRoutes from './routes/auth.js';
import customersRoutes from './routes/customers.js';
import pointsRoutes from './routes/points.js';
import dashboardRoutes from './routes/dashboard.js';
import reviewAutomationRoutes from './routes/review-automation.js';
import walletRoutes from './routes/wallet.js';
import settingsRoutes from './routes/settings.js';
import cardsRoutes from './routes/cards.js';
import kakaoRoutes from './routes/kakao.js';
import naverRoutes from './routes/naver.js';
import taghereRoutes from './routes/taghere.js';
import alimtalkRoutes from './routes/alimtalk.js';
import naverReviewRoutes from './routes/naver-review.js';
import paymentsRoutes from './routes/payments.js';
import storesRoutes from './routes/stores.js';
import adminRoutes from './routes/admin.js';
import smsRoutes from './routes/sms.js';
import localCustomersRoutes from './routes/local-customers.js';
import brandMessageRoutes from './routes/brand-message.js';
import publicRoutes from './routes/public.js';
import membershipRoutes from './routes/membership.js';
import franchiseAuthRoutes from './routes/franchise-auth.js';
import franchiseRoutes from './routes/franchise.js';
import franchiseSmsRoutes from './routes/franchise-sms.js';
import franchiseLocalCustomersRoutes from './routes/franchise-local-customers.js';
import franchiseAutomationRoutes from './routes/franchise-automation.js';
import waitingRoutes from './routes/waiting.js';
import waitingTypesRoutes from './routes/waiting-types.js';
import waitingSettingsRoutes from './routes/waiting-settings.js';
import publicWaitingRoutes from './routes/public-waiting.js';
import stampSettingsRoutes from './routes/stamp-settings.js';
import stampsRoutes from './routes/stamps.js';
import monthlyCreditRoutes from './routes/monthly-credit.js';
import visitSourceSettingsRoutes from './routes/visit-source-settings.js';
import insightsRoutes from './routes/insights.js';
import retargetCouponRoutes from './routes/retarget-coupon.js';
import automationRoutes from './routes/automation.js';
import storeProductsRoutes from './routes/store-products.js';
import storeOrdersRoutes from './routes/store-orders.js';
import surveyQuestionsRoutes from './routes/survey-questions.js';
import myPageRoutes from './routes/my-page.js';
import externalRoutes from './routes/external.js';
import { startAlimTalkWorker } from './services/alimtalk-worker.js';
import { startSmsWorker } from './services/sms-worker.js';
import { startExternalSmsWorker } from './services/external-sms-worker.js';
import { startBrandMessageWorker } from './services/brand-message-worker.js';
import { startAutomationWorker } from './services/automation-worker.js';
import { startChatResetWorker } from './services/chat-reset-worker.js';
import { initChatSocket } from './services/chat-socket.js';
import chatSettingsRoutes from './routes/chat-settings.js';
import publicChatRoutes from './routes/public-chat.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';

// 정적 + 동적 origin 목록 (환경변수 로딩 실패에도 동작 보장)
const allowedOrigins = [
  // Production URLs (하드코딩으로 안정성 확보)
  'https://taghere-crm-web-g96p.onrender.com',
  'https://www.taghere-crm-web-g96p.onrender.com',
  // 환경변수 (추가 도메인 지원)
  PUBLIC_APP_URL,
  // Development
  'http://localhost:3999',
  'http://localhost:3000',
].filter(Boolean) as string[];

// CORS 디버깅 로그 (production에서 문제 추적용)
const corsDebug = process.env.CORS_DEBUG === 'true';

app.use(cors({
  origin: (origin, callback) => {
    // 디버깅 로그
    if (corsDebug) {
      console.log('[CORS] Request origin:', origin);
      console.log('[CORS] Allowed origins:', allowedOrigins);
    }

    // No origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Origin 정규화 (trailing slash 제거, 소문자)
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // 실패 시 로그 (항상)
    console.error('[CORS] Blocked origin:', origin, 'Allowed:', allowedOrigins);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  // 추가 헤더 명시
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // Preflight 캐시 24시간
}));
app.use(express.json());

// Rate Limiting - 일반 API (15분에 5000요청)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5000,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limiting - 인증 관련 (15분에 20요청)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limiting - 포인트 적립 (1분에 10요청)
const earnLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10,
  message: { error: '포인트 적립 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/franchise/auth/login', authLimiter);
app.use('/api/taghere/auto-earn', earnLimiter);

// Static file serving for uploads (MMS images)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'TagHere CRM API',
    version: '1.0.0',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/auth/me',
      'GET /api/customers',
      'GET /api/customers/:id',
      'GET /api/customers/search/phone/:digits',
      'POST /api/points/earn',
      'POST /api/points/use',
      'GET /api/points/recent',
      'GET /api/dashboard/summary',
      'GET /api/dashboard/review-chart',
      'GET /api/review-automation/settings',
      'POST /api/review-automation/settings',
      'GET /api/review-automation/logs',
      'GET /api/wallet',
      'POST /api/wallet/topup',
      'GET /api/wallet/transactions',
      'GET /api/settings/point-policy',
      'POST /api/settings/point-policy',
      'GET /api/settings/store',
      'GET /api/cards',
      'POST /api/cards',
      'DELETE /api/cards/:id',
      'POST /api/taghere/order-event',
      'GET /auth/kakao/start',
      'GET /auth/kakao/callback',
      'GET /api/alimtalk/config',
      'PUT /api/alimtalk/config',
      'GET /api/alimtalk/logs',
      'GET /api/alimtalk/stats',
      'POST /api/alimtalk/retry/:id',
    ],
  });
});

// Register API routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/review-automation', reviewAutomationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/taghere', taghereRoutes);
app.use('/api/alimtalk', alimtalkRoutes);
app.use('/api/naver-review', naverReviewRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/local-customers', localCustomersRoutes);
app.use('/api/brand-message', brandMessageRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/membership', membershipRoutes);

// Waiting routes
app.use('/api/waiting', waitingRoutes);
app.use('/api/waiting/types', waitingTypesRoutes);
app.use('/api/waiting/settings', waitingSettingsRoutes);
app.use('/api/public/waiting', publicWaitingRoutes);

// Stamp routes
app.use('/api/stamp-settings', stampSettingsRoutes);
app.use('/api/stamps', stampsRoutes);

// Chat routes
app.use('/api/chat', chatSettingsRoutes);
app.use('/api/public/chat', publicChatRoutes);

// Monthly credit routes
app.use('/api/monthly-credit', monthlyCreditRoutes);

// Visit source settings routes
app.use('/api/visit-source-settings', visitSourceSettingsRoutes);

// Insights routes
app.use('/api/insights', insightsRoutes);

// Retarget coupon routes
app.use('/api/retarget-coupon', retargetCouponRoutes);

// Automation routes
app.use('/api/automation', automationRoutes);

// Store routes
app.use('/api/store-products', storeProductsRoutes);
app.use('/api/store-orders', storeOrdersRoutes);
app.use('/api/survey-questions', surveyQuestionsRoutes);

// My Page routes (public)
app.use('/api/my-page', myPageRoutes);

// External routes
app.use('/api/external', externalRoutes);

// Franchise routes
app.use('/api/franchise/auth', franchiseAuthRoutes);
app.use('/api/franchise/sms', franchiseSmsRoutes);
app.use('/api/franchise/local-customers', franchiseLocalCustomersRoutes);
app.use('/api/franchise/automation', franchiseAutomationRoutes);
app.use('/api/franchise', franchiseRoutes);

// OAuth routes (without /api prefix)
app.use('/auth/kakao', kakaoRoutes);
app.use('/auth/naver', naverRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const httpServer = http.createServer(app);
initChatSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📚 API documentation at http://localhost:${PORT}/api`);

  // Start background workers
  startAlimTalkWorker();
  startSmsWorker();
  startExternalSmsWorker();
  startBrandMessageWorker();
  startAutomationWorker();
  startChatResetWorker();
});
