import { Page, Locator, expect } from '@playwright/test';

/**
 * Points Page Object Model
 * Encapsulates point management page interactions
 */
export class PointsPage {
  readonly page: Page;
  readonly phoneSearchInput: Locator;
  readonly searchButton: Locator;
  readonly customerInfo: Locator;
  readonly directPointsTab: Locator;
  readonly paymentPointsTab: Locator;
  readonly pointInput: Locator;
  readonly paymentInput: Locator;
  readonly pointPresets: Locator;
  readonly paymentPresets: Locator;
  readonly confirmButton: Locator;
  readonly confirmModal: Locator;
  readonly modalConfirmButton: Locator;
  readonly successMessage: Locator;
  readonly recentTransactions: Locator;
  readonly testSendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.phoneSearchInput = page.locator('input[placeholder*="전화번호"], input[placeholder*="010"]');
    this.searchButton = page.locator('button:has-text("검색"), button:has-text("조회")');
    this.customerInfo = page.locator('[data-testid="customer-info"], [class*="customer"]');
    this.directPointsTab = page.locator('button:has-text("직접 입력"), [role="tab"]:has-text("직접")');
    this.paymentPointsTab = page.locator('button:has-text("결제 금액"), [role="tab"]:has-text("결제")');
    this.pointInput = page.locator('input[name="points"], input[placeholder*="포인트"]');
    this.paymentInput = page.locator('input[name="payment"], input[placeholder*="금액"]');
    this.pointPresets = page.locator('[data-testid="point-presets"] button, button:has-text("500"), button:has-text("1,000")');
    this.paymentPresets = page.locator('[data-testid="payment-presets"] button, button:has-text("10,000"), button:has-text("20,000")');
    this.confirmButton = page.locator('button:has-text("적립"), button[type="submit"]');
    this.confirmModal = page.locator('[role="dialog"], [class*="modal"]');
    this.modalConfirmButton = this.confirmModal.locator('button:has-text("확인"), button:has-text("적립")');
    this.successMessage = page.locator('[class*="success"], [class*="toast"]:has-text("완료")');
    this.recentTransactions = page.locator('[data-testid="recent-transactions"], :has-text("최근 거래")');
    this.testSendButton = page.locator('button:has-text("테스트 발송")');
  }

  async goto() {
    await this.page.goto('/points');
    await this.page.waitForLoadState('networkidle');
  }

  async searchCustomer(phone: string) {
    await this.phoneSearchInput.fill(phone);
    await this.searchButton.click();
    await this.page.waitForResponse((res) => res.url().includes('/customers') && res.status() === 200);
  }

  async selectDirectPoints() {
    await this.directPointsTab.click();
  }

  async selectPaymentPoints() {
    await this.paymentPointsTab.click();
  }

  async enterPoints(amount: number) {
    await this.pointInput.fill(amount.toString());
  }

  async enterPayment(amount: number) {
    await this.paymentInput.fill(amount.toString());
  }

  async selectPointPreset(amount: number) {
    await this.page.locator(`button:has-text("${amount.toLocaleString()}")`).first().click();
  }

  async selectPaymentPreset(amount: number) {
    await this.page.locator(`button:has-text("${amount.toLocaleString()}")`).first().click();
  }

  async confirmPointAward() {
    await this.confirmButton.click();
    // If there's a confirmation modal, confirm it
    if (await this.confirmModal.isVisible()) {
      await this.modalConfirmButton.click();
    }
  }

  async expectPointAwardSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 5000 });
  }

  async expectCustomerFound() {
    await expect(this.customerInfo).toBeVisible();
  }

  async expectCustomerNotFound() {
    const notFoundMessage = this.page.locator(':has-text("고객을 찾을 수 없"), :has-text("등록되지 않은")');
    await expect(notFoundMessage).toBeVisible();
  }
}
