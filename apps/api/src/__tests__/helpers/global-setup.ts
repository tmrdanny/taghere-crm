// vitest globalSetup — 테스트 DB 스키마를 최신 prisma 스키마로 동기화한다.
// build 스크립트와 동일하게 db push 사용 (마이그레이션 이력은 사실상 미사용).
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://taghere:taghere123@localhost:5433/taghere_crm_test';

export default function globalSetup() {
  // 이 파일 위치: apps/api/src/__tests__/helpers → 레포 루트는 5단계 위
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../../../../..');
  execSync(
    `npx prisma db push --schema=${path.join(repoRoot, 'prisma/schema.prisma')} --skip-generate --accept-data-loss`,
    {
      cwd: path.join(repoRoot, 'apps/api'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'inherit',
    }
  );
}
