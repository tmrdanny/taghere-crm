import { test as setup, expect } from '@playwright/test';
import { TEST_USER } from '../fixtures/test-data';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

/**
 * Authentication Setup
 * This runs before all tests to set up authenticated state
 */
setup('authenticate', async ({ page }) => {
  // Go to login page
  await page.goto('/login');

  // Fill login form
  await page.locator('input[type="email"], input[name="email"]').fill(TEST_USER.email);
  await page.locator('input[type="password"]').fill(TEST_USER.password);

  // Submit login
  await page.locator('button[type="submit"]').click();

  // Wait for successful redirect to dashboard
  await expect(page).toHaveURL(/\/(home|dashboard)/, { timeout: 10000 });

  // Save storage state (includes localStorage token)
  await page.context().storageState({ path: authFile });
});
