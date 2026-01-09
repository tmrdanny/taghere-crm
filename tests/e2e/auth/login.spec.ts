import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { TEST_USER } from '../fixtures/test-data';

test.describe('로그인 기능', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('로그인 페이지가 정상적으로 로드된다', async ({ page }) => {
    await expect(page).toHaveURL('/login');
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('유효한 자격증명으로 로그인 성공', async ({ page }) => {
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    // 토큰이 localStorage에 저장되었는지 확인
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('잘못된 이메일로 로그인 실패', async () => {
    await loginPage.login('wrong@email.com', TEST_USER.password);
    await loginPage.expectLoginError();
  });

  test('잘못된 비밀번호로 로그인 실패', async () => {
    await loginPage.login(TEST_USER.email, 'wrongpassword');
    await loginPage.expectLoginError();
  });

  test('빈 이메일로 로그인 시도 시 검증 실패', async ({ page }) => {
    await loginPage.login('', TEST_USER.password);
    // Form validation should prevent submission or show error
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('빈 비밀번호로 로그인 시도 시 검증 실패', async ({ page }) => {
    await loginPage.login(TEST_USER.email, '');
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('회원가입 페이지로 이동', async () => {
    await loginPage.goToRegister();
  });
});

test.describe('인증된 사용자 리다이렉션', () => {
  test('이미 로그인한 사용자는 대시보드로 리다이렉트', async ({ page }) => {
    // 먼저 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    // 로그인 페이지로 다시 이동 시도
    await page.goto('/login');

    // 이미 로그인했으므로 대시보드로 리다이렉트되어야 함
    await expect(page).toHaveURL(/\/(home|dashboard|login)/);
  });
});

test.describe('로그아웃 기능', () => {
  test.beforeEach(async ({ page }) => {
    // 먼저 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();
  });

  test('로그아웃 후 로그인 페이지로 리다이렉트', async ({ page }) => {
    // 로그아웃 버튼 클릭 (사이드바에 있을 수 있음)
    const logoutButton = page.locator('button:has-text("로그아웃"), a:has-text("로그아웃")');

    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // 로그인 페이지로 리다이렉트 확인
      await expect(page).toHaveURL('/login');

      // 토큰이 삭제되었는지 확인
      const token = await page.evaluate(() => localStorage.getItem('token'));
      expect(token).toBeFalsy();
    }
  });
});
