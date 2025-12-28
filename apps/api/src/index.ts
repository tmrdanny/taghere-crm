import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables (production uses system env, dev uses .env file)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
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
import taghereRoutes from './routes/taghere.js';
import alimtalkRoutes from './routes/alimtalk.js';
import naverReviewRoutes from './routes/naver-review.js';
import paymentsRoutes from './routes/payments.js';
import storesRoutes from './routes/stores.js';
import adminRoutes from './routes/admin.js';
import smsRoutes from './routes/sms.js';
import { startAlimTalkWorker } from './services/alimtalk-worker.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration
const allowedOrigins = [
  process.env.PUBLIC_APP_URL,
  'http://localhost:3999',
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

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

// Kakao OAuth routes (without /api prefix)
app.use('/auth/kakao', kakaoRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📚 API documentation at http://localhost:${PORT}/api`);

  // Start AlimTalk worker
  startAlimTalkWorker();
});
