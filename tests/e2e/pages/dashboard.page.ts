import { Page, Locator, expect } from '@playwright/test';

/**
 * Dashboard Page Object Model
 * Encapsulates dashboard/home page interactions
 */
export class DashboardPage {
  readonly page: Page;
  readonly totalCustomersCard: Locator;
  readonly newCustomersCard: Locator;
  readonly balanceCard: Locator;
  readonly visitorChart: Locator;
  readonly announcementSection: Locator;
  readonly periodSelector: Locator;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.totalCustomersCard = page.locator('[data-testid="total-customers"], :has-text("전체 고객")');
    this.newCustomersCard = page.locator('[data-testid="new-customers"], :has-text("신규 고객")');
    this.balanceCard = page.locator('[data-testid="balance"], :has-text("알림톡 잔액")');
    this.visitorChart = page.locator('[data-testid="visitor-chart"], canvas');
    this.announcementSection = page.locator('[data-testid="announcements"], :has-text("공지사항")');
    this.periodSelector = page.locator('select, [role="combobox"]').filter({ hasText: /일|주|개월/ });
    this.sidebar = page.locator('nav, aside');
  }

  async goto() {
    await this.page.goto('/home');
    await this.page.waitForLoadState('networkidle');
  }

  async expectDashboardLoaded() {
    await expect(this.page).toHaveURL(/\/(home|dashboard)/);
    // Wait for at least one KPI card to be visible
    await expect(this.totalCustomersCard.or(this.newCustomersCard)).toBeVisible({ timeout: 10000 });
  }

  async navigateTo(menuItem: string) {
    await this.sidebar.getByRole('link', { name: menuItem }).click();
  }

  async changePeriod(period: string) {
    await this.periodSelector.click();
    await this.page.locator(`[role="option"]:has-text("${period}")`).click();
  }

  async getKPIValue(cardLocator: Locator): Promise<string> {
    const valueLocator = cardLocator.locator('[class*="text-2xl"], [class*="text-3xl"], strong');
    await expect(valueLocator).toBeVisible();
    return await valueLocator.textContent() || '';
  }
}
