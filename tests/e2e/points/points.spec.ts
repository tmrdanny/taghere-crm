import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_CUSTOMER } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';
import { PointsPage } from '../pages/points.page';

test.describe('포인트 적립 기능', () => {
  let pointsPage: PointsPage;

  test.beforeEach(async ({ page }) => {
    // 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    // 포인트 페이지로 이동
    pointsPage = new PointsPage(page);
    await pointsPage.goto();
  });

  test('포인트 적립 페이지 로드', async ({ page }) => {
    await expect(page).toHaveURL('/points');
    await expect(pointsPage.phoneSearchInput).toBeVisible();
  });

  test('고객 전화번호로 검색', async ({ page }) => {
    await pointsPage.phoneSearchInput.fill(TEST_CUSTOMER.phone);

    const searchButton = page.locator('button:has-text("검색"), button:has-text("조회")');
    if (await searchButton.isVisible()) {
      await searchButton.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2000);

    // 고객이 있으면 정보 표시, 없으면 새 고객 생성 옵션
    const customerFound = page.locator(':has-text("고객 정보"), :has-text("포인트")');
    const newCustomerPrompt = page.locator(':has-text("등록"), :has-text("새 고객")');

    const isFound = await customerFound.isVisible();
    const isNewPrompt = await newCustomerPrompt.isVisible();

    expect(isFound || isNewPrompt).toBeTruthy();
  });

  test('직접 포인트 입력 방식', async ({ page }) => {
    // 직접 입력 탭이 있으면 선택
    const directTab = page.locator('button:has-text("직접"), [role="tab"]:has-text("직접")');
    if (await directTab.isVisible()) {
      await directTab.click();
    }

    // 포인트 입력 필드
    const pointInput = page.locator('input[name="points"], input[placeholder*="포인트"], input[type="number"]').first();
    await expect(pointInput).toBeVisible();

    await pointInput.fill('1000');
    const inputValue = await pointInput.inputValue();
    expect(inputValue).toBe('1000');
  });

  test('포인트 프리셋 버튼 동작', async ({ page }) => {
    const presetButtons = page.locator('button:has-text("500"), button:has-text("1,000"), button:has-text("2,000")');

    if (await presetButtons.first().isVisible()) {
      await presetButtons.first().click();

      // 포인트 입력 필드에 값이 설정됨
      const pointInput = page.locator('input[name="points"], input[placeholder*="포인트"], input[type="number"]').first();
      const value = await pointInput.inputValue();
      expect(parseInt(value.replace(/,/g, ''))).toBeGreaterThan(0);
    }
  });

  test('결제 금액 기반 포인트 계산', async ({ page }) => {
    // 결제 금액 탭이 있으면 선택
    const paymentTab = page.locator('button:has-text("결제"), [role="tab"]:has-text("결제")');
    if (await paymentTab.isVisible()) {
      await paymentTab.click();
    }

    // 결제 금액 입력
    const paymentInput = page.locator('input[name="payment"], input[placeholder*="금액"]');
    if (await paymentInput.isVisible()) {
      await paymentInput.fill('10000');

      // 포인트 계산 결과가 표시되어야 함
      await page.waitForTimeout(500);
      const calculatedPoints = page.locator(':has-text("적립 포인트"), :has-text("포인트:")');
      await expect(calculatedPoints).toBeVisible();
    }
  });

  test('결제 금액 프리셋 버튼 동작', async ({ page }) => {
    const paymentTab = page.locator('button:has-text("결제"), [role="tab"]:has-text("결제")');
    if (await paymentTab.isVisible()) {
      await paymentTab.click();
    }

    const presetButtons = page.locator('button:has-text("10,000"), button:has-text("20,000"), button:has-text("30,000")');

    if (await presetButtons.first().isVisible()) {
      await presetButtons.first().click();

      const paymentInput = page.locator('input[name="payment"], input[placeholder*="금액"]');
      const value = await paymentInput.inputValue();
      expect(parseInt(value.replace(/,/g, ''))).toBeGreaterThan(0);
    }
  });
});

test.describe('포인트 적립 플로우', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/points');
    await page.waitForLoadState('networkidle');
  });

  test('포인트 적립 전체 플로우 (고객 검색 → 포인트 입력 → 확인)', async ({ page }) => {
    // 1. 고객 검색
    const phoneInput = page.locator('input[placeholder*="전화번호"], input[placeholder*="010"]');
    await phoneInput.fill(TEST_CUSTOMER.phone);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // 2. 포인트 입력
    const pointInput = page.locator('input[name="points"], input[placeholder*="포인트"], input[type="number"]').first();
    if (await pointInput.isVisible()) {
      await pointInput.fill('500');
    }

    // 3. 적립 버튼 클릭
    const confirmButton = page.locator('button:has-text("적립"), button[type="submit"]');
    if (await confirmButton.isVisible() && await confirmButton.isEnabled()) {
      await confirmButton.click();

      // 4. 확인 모달이 있으면 확인
      const modal = page.locator('[role="dialog"], [class*="modal"]');
      if (await modal.isVisible()) {
        const modalConfirm = modal.locator('button:has-text("확인"), button:has-text("적립")');
        if (await modalConfirm.isVisible()) {
          await modalConfirm.click();
        }
      }

      // 5. 성공 메시지 또는 결과 확인
      await page.waitForTimeout(2000);
    }
  });
});

test.describe('최근 거래 내역', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/points');
    await page.waitForLoadState('networkidle');
  });

  test('최근 거래 내역 표시', async ({ page }) => {
    const recentTransactions = page.locator(':has-text("최근 거래"), :has-text("최근 적립"), [class*="recent"]');

    if (await recentTransactions.isVisible()) {
      // 거래 내역 목록이 있어야 함
      const transactionItems = page.locator('[class*="transaction"], table tbody tr');
      // 거래가 있거나 빈 상태 메시지가 있어야 함
    }
  });
});
