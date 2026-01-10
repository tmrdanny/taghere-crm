import { defineConfig, devices } from '@playwright/test';

/**
 * TagHere CRM E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3999',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Setup project for authentication
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Desktop Chrome
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },

    // Mobile Safari (iPhone 14)
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
      },
      dependencies: ['setup'],
    },
  ],

  // Run local dev server before starting tests
  // Set SKIP_WEB_SERVER=true to use already running servers
  ...(process.env.SKIP_WEB_SERVER
    ? {}
    : {
        webServer: [
          {
            command: 'npm run dev:api',
            url: 'http://localhost:4000/health',
            reuseExistingServer: true,
            timeout: 120 * 1000,
          },
          {
            command: 'npm run dev:web',
            url: 'http://localhost:3999',
            reuseExistingServer: true,
            timeout: 120 * 1000,
          },
        ],
      }),
});
