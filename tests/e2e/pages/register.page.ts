import { Page, Locator, expect } from '@playwright/test';

/**
 * Register Page Object Model
 * Encapsulates all registration page interactions
 */
export class RegisterPage {
  readonly page: Page;
  readonly storeNameInput: Locator;
  readonly categorySelect: Locator;
  readonly ownerNameInput: Locator;
  readonly phoneInput: Locator;
  readonly businessRegNumberInput: Locator;
  readonly addressSearchButton: Locator;
  readonly addressInput: Locator;
  readonly naverPlaceUrlInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.storeNameInput = page.locator('input[name="storeName"]');
    this.categorySelect = page.locator('select[name="category"]');
    this.ownerNameInput = page.locator('input[name="ownerName"]');
    this.phoneInput = page.locator('input[name="phone"]');
    this.businessRegNumberInput = page.locator('input[name="businessRegNumber"]');
    this.addressSearchButton = page.locator('button:has-text("주소 검색")');
    this.addressInput = page.locator('input[name="address"]');
    this.naverPlaceUrlInput = page.locator('input[name="naverPlaceUrl"]');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"]').first();
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[class*="error"], [class*="alert"]');
    this.loginLink = page.locator('a[href="/login"]');
  }

  async goto() {
    await this.page.goto('/register');
    await this.page.waitForLoadState('networkidle');
  }

  async fillRegistrationForm(data: {
    storeName: string;
    category: string;
    ownerName: string;
    phone: string;
    businessRegNumber: string;
    address: string;
    naverPlaceUrl?: string;
    email: string;
    password: string;
  }) {
    await this.storeNameInput.fill(data.storeName);
    await this.categorySelect.selectOption({ label: data.category });
    await this.ownerNameInput.fill(data.ownerName);
    await this.phoneInput.fill(data.phone);
    await this.businessRegNumberInput.fill(data.businessRegNumber);

    // Address is typically read-only, set via Daum Postcode
    // For E2E tests, we might need to mock this or use a workaround
    if (data.address) {
      await this.addressInput.fill(data.address);
    }

    if (data.naverPlaceUrl) {
      await this.naverPlaceUrlInput.fill(data.naverPlaceUrl);
    }

    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectRegistrationSuccess() {
    await expect(this.page).toHaveURL(/\/(home|dashboard)/);
  }

  async expectRegistrationError(errorText?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (errorText) {
      await expect(this.errorMessage).toContainText(errorText);
    }
  }

  async goToLogin() {
    await this.loginLink.click();
    await expect(this.page).toHaveURL('/login');
  }
}
