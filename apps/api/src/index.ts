// 환경변수 로딩을 최우선으로 (라우트 등 다른 모듈 import보다 먼저 실행되어야 함)
import './load-env.js';
import http from 'http';
import { warnMissingEnv } from './config/env.js';

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

// 선택 환경변수 그룹 누락 경고 (warn-only)
warnMissingEnv();

import { app } from './app.js';
import { startAlimTalkWorker } from './services/alimtalk-worker.js';
import { startSmsWorker } from './services/sms-worker.js';
import { startExternalSmsWorker } from './services/external-sms-worker.js';
import { startBrandMessageWorker } from './services/brand-message-worker.js';
import { startAutomationWorker } from './services/automation-worker.js';
import { startChatResetWorker } from './services/chat-reset-worker.js';
import { startPlaceBoosterWorker } from './services/place-booster-worker.js';
import { startUniqueCustomerSyncWorker } from './services/unique-customer-sync.js';
import { startYahwaCountSyncWorker } from './services/yahwa-count-sync-worker.js';
import { startPendingAccrualWorker } from './services/pending-accrual-worker.js';
import { bootstrapEnableYahwaStoresByName } from './services/yahwa-bootstrap.js';
import { scheduleScanEntrySecretBackfill } from './utils/stamp-scan-secret.js';
import { initChatSocket } from './services/chat-socket.js';

const PORT = process.env.PORT || 4000;

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
  startPlaceBoosterWorker();
  startUniqueCustomerSyncWorker();
  startYahwaCountSyncWorker();
  startPendingAccrualWorker();
  void bootstrapEnableYahwaStoresByName();
  // 스탬프 QR 입구 secret 미발급 매장 백필 (멱등 — 이미 발급된 매장은 건드리지 않음)
  scheduleScanEntrySecretBackfill();
});