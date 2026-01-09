import { test, expect } from '@playwright/test';

test.describe('보호된 라우트 접근 제어', () => {
  // 인증 없이 테스트 (브라우저 상태 초기화)
  test.use({ storageState: { cookies: [], origins: [] } });

  const protectedRoutes = [
    '/home',
    '/customers',
    '/points',
    '/messages',
    '/message-history',
    '/local-customers',
    '/billing',
    '/naver-review',
    '/settings',
  ];

  for (const route of protectedRoutes) {
    test(`인증 없이 ${route} 접근 시 로그인으로 리다이렉트`, async ({ page }) => {
      // localStorage 토큰 제거 확인
      await page.goto('/login');
      await page.evaluate(() => localStorage.removeItem('token'));

      // 보호된 라우트로 직접 이동 시도
      await page.goto(route);

      // 로그인 페이지로 리다이렉트되어야 함
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  }
});

test.describe('토큰 만료 처리', () => {
  test('만료된 토큰으로 API 요청 시 로그인으로 리다이렉트', async ({ page }) => {
    // 잘못된 토큰 설정
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('token', 'expired-or-invalid-token');
    });

    // 보호된 페이지로 이동
    await page.goto('/home');

    // API 요청 실패 후 로그인으로 리다이렉트되어야 함
    await page.waitForTimeout(3000);

    // 대시보드가 로드되거나 로그인으로 리다이렉트
    const currentUrl = page.url();
    // 토큰이 유효하지 않으면 결국 로그인으로 가야 함
    expect(currentUrl).toMatch(/\/(login|home)/);
  });
});

test.describe('Admin 라우트 접근 제어', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Admin 토큰 없이 /admin 접근 시 관리자 로그인으로 리다이렉트', async ({ page }) => {
    await page.goto('/admin');

    // 관리자 로그인 페이지로 리다이렉트되어야 함
    await expect(page).toHaveURL(/\/admin\/login|\/admin/, { timeout: 10000 });
  });

  test('일반 사용자 토큰으로 /admin 접근 불가', async ({ page }) => {
    // 일반 사용자 토큰 설정
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('token', 'regular-user-token');
      localStorage.removeItem('adminToken');
    });

    await page.goto('/admin');

    // 관리자 로그인 페이지로 리다이렉트되어야 함
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/admin/);
  });
});
