import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 소스가 NodeNext 스타일 `.js` specifier로 `.ts` 파일을 참조하므로
    // Vite 리졸버가 실제 .ts 파일을 찾도록 확장자를 제거해준다.
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 실 DB를 사용하는 특성화 테스트가 서로 간섭하지 않도록 파일 단위 직렬 실행
    fileParallelism: false,
    // 테스트 DB로 DATABASE_URL 교체 (모든 테스트 import보다 먼저 실행)
    setupFiles: ['src/__tests__/helpers/test-env.ts'],
    // 테스트 DB 스키마 동기화 (db push)
    globalSetup: ['src/__tests__/helpers/global-setup.ts'],
  },
});
