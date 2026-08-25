// vitest setupFiles — 테스트 파일의 어떤 import보다 먼저 실행된다.
// lib/prisma.ts가 모듈 로드 시점에 process.env.DATABASE_URL을 읽으므로,
// 여기서 테스트 DB로 교체해야 실 DB(taghere_crm)를 건드리지 않는다.
// (load-env.ts의 dotenv.config()는 override 없음 — 먼저 설정된 값이 우선)
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://taghere:taghere123@localhost:5433/taghere_crm_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
