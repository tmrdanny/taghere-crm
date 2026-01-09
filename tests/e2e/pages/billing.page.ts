import { Page, Locator, expect } from '@playwright/test';

/**
 * Billing Page Object Model
 * Encapsulates wallet/payment page interactions
 */
export class BillingPage {
  readonly page: Page;
  readonly currentBalance: Locator;
  readonly amountPresets: Locator;
  readonly customAmountInput: Locator;
  readonly addAmountButton: Locator;
  readonly paymentWidget: Locator;
  readonly confirmButton: Locator;
  readonly transactionHistory: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.currentBalance = page.locator('[data-testid="current-balance"], :has-text("현재 잔액")');
    this.amountPresets = page.locator('[data-testid="amount-presets"] button, button:has-text("50,000"), button:has-text("100,000")');
    this.customAmountInput = page.locator('input[name="amount"], input[placeholder*="금액"]');
    this.addAmountButton = page.locator('button:has-text("+50,000"), button:has-text("+5만")');
    this.paymentWidget = page.locator('#payment-widget, [data-testid="payment-widget"]');
    this.confirmButton = page.locator('button:has-text("충전"), button:has-text("결제")');
    this.transactionHistory = page.locator('[data-testid="transaction-history"], table');
    this.successMessage = page.locator('[class*="success"], :has-text("충전 완료")');
    this.errorMessage = page.locator('[class*="error"], [class*="alert"]');
  }

  async goto() {
    await this.page.goto('/billing');
    await this.page.waitForLoadState('networkidle');
  }

  async getCurrentBalance(): Promise<number> {
    const text = await this.currentBalance.textContent();
    const match = text?.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  async selectAmountPreset(amount: number) {
    const formattedAmount = amount.toLocaleString();
    await this.page.locator(`button:has-text("${formattedAmount}")`).click();
  }

  async enterCustomAmount(amount: number) {
    await this.customAmountInput.fill(amount.toString());
  }

  async clickAddAmount() {
    await this.addAmountButton.click();
  }

  async expectPaymentWidgetVisible() {
    await expect(this.paymentWidget).toBeVisible({ timeout: 10000 });
  }

  async expectTransactionInHistory(type: string, amount: number) {
    const row = this.transactionHistory.locator(`tr:has-text("${type}"):has-text("${amount.toLocaleString()}")`);
    await expect(row).toBeVisible();
  }

  async expectChargeSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectChargeError() {
    await expect(this.errorMessage).toBeVisible();
  }

  async getTransactionCount(): Promise<number> {
    const rows = this.transactionHistory.locator('tbody tr');
    return await rows.count();
  }
}
