import dotenv from 'dotenv';
import path from 'path';

// 환경변수 로딩 — 반드시 다른 모듈(라우트 등)보다 먼저 import 되어야 한다.
// 일부 모듈이 import 시점(모듈 로드)에 process.env를 읽으므로,
// dotenv.config()가 그보다 먼저 실행되도록 별도 모듈로 분리한다.
// 운영(NODE_ENV=production)은 시스템 env를 사용하므로 .env를 로드하지 않는다.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}
