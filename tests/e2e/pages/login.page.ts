import { Page, Locator, expect } from '@playwright/test';

/**
 * Login Page Object Model
 * Encapsulates all login page interactions
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"], input[name="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[class*="error"], [class*="alert"]');
    this.registerLink = page.locator('a[href="/register"]');
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectLoginSuccess() {
    // 로그인 성공 시 메인 페이지(/) 또는 대시보드로 리디렉션
    // 로그인 페이지에서 벗어났는지 확인 (최대 10초 대기)
    await expect(this.page).not.toHaveURL('/login', { timeout: 10000 });
  }

  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible();
  }

  async goToRegister() {
    await this.registerLink.click();
    await expect(this.page).toHaveURL('/register');
  }
}
