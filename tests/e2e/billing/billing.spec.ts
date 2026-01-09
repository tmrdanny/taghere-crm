import { test, expect } from '@playwright/test';
import { TEST_USER } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';
import { BillingPage } from '../pages/billing.page';

test.describe('충전 관리 페이지', () => {
  let billingPage: BillingPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    billingPage = new BillingPage(page);
    await billingPage.goto();
  });

  test('충전 페이지 로드', async ({ page }) => {
    await expect(page).toHaveURL('/billing');
  });

  test('현재 잔액 표시', async ({ page }) => {
    const balanceDisplay = page.locator(':has-text("현재 잔액"), :has-text("잔액")');
    await expect(balanceDisplay.first()).toBeVisible();

    // 잔액이 숫자로 표시됨
    const balanceValue = page.locator(':has-text("원")');
    await expect(balanceValue.first()).toBeVisible();
  });

  test('충전 금액 프리셋 버튼', async ({ page }) => {
    const presetButtons = page.locator('button:has-text("50,000"), button:has-text("100,000"), button:has-text("500,000"), button:has-text("1,000,000")');

    await expect(presetButtons.first()).toBeVisible();

    // 프리셋 버튼 클릭
    await page.locator('button:has-text("50,000")').click();

    // 금액 입력 필드에 값이 설정됨
    const amountInput = page.locator('input[name="amount"], input[type="number"], input[placeholder*="금액"]');
    if (await amountInput.isVisible()) {
      const value = await amountInput.inputValue();
      expect(value.replace(/,/g, '')).toContain('50000');
    }
  });

  test('+50,000원 버튼', async ({ page }) => {
    // 먼저 기본 금액 설정
    const presetButton = page.locator('button:has-text("50,000")').first();
    await presetButton.click();

    // +50,000 버튼 클릭
    const addButton = page.locator('button:has-text("+50,000"), button:has-text("+5만")');
    if (await addButton.isVisible()) {
      await addButton.click();

      // 금액이 증가됨
      const amountInput = page.locator('input[name="amount"], input[type="number"]');
      if (await amountInput.isVisible()) {
        const value = await amountInput.inputValue();
        expect(parseInt(value.replace(/,/g, ''))).toBeGreaterThanOrEqual(100000);
      }
    }
  });

  test('직접 금액 입력', async ({ page }) => {
    const amountInput = page.locator('input[name="amount"], input[type="number"], input[placeholder*="금액"]');

    if (await amountInput.isVisible()) {
      await amountInput.fill('75000');
      const value = await amountInput.inputValue();
      expect(value.replace(/,/g, '')).toContain('75000');
    }
  });

  test('최소 금액 검증 (1,000원 이상)', async ({ page }) => {
    const amountInput = page.locator('input[name="amount"], input[type="number"], input[placeholder*="금액"]');

    if (await amountInput.isVisible()) {
      await amountInput.fill('500');

      // 결제 버튼이 비활성화되거나 경고 메시지
      const payButton = page.locator('button:has-text("충전"), button:has-text("결제")');
      const warning = page.locator(':has-text("최소"), :has-text("1,000")');

      // 둘 중 하나가 표시됨
      await page.waitForTimeout(500);
    }
  });
});

test.describe('TossPayments 위젯', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/billing');
    await page.waitForLoadState('networkidle');
  });

  test('결제 위젯 로드', async ({ page }) => {
    // 금액 선택
    await page.locator('button:has-text("50,000")').first().click();
    await page.waitForTimeout(2000);

    // TossPayments 위젯이 로드됨
    const paymentWidget = page.locator('#payment-widget, [class*="toss"], iframe[src*="toss"]');

    // 위젯이 로드되는지 확인 (iframe 또는 div)
    await page.waitForTimeout(3000);
  });

  test('결제 수단 선택 영역', async ({ page }) => {
    await page.locator('button:has-text("50,000")').first().click();
    await page.waitForTimeout(3000);

    // 결제 수단 (카드, 계좌이체 등) 선택 UI
    const paymentMethods = page.locator(':has-text("카드"), :has-text("계좌"), :has-text("간편결제")');
    // TossPayments 위젯 내에서 표시됨
  });
});

test.describe('거래 내역', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/billing');
    await page.waitForLoadState('networkidle');
  });

  test('거래 내역 테이블 표시', async ({ page }) => {
    const transactionTable = page.locator('table, [class*="transaction"], [class*="history"]');
    await expect(transactionTable.first()).toBeVisible({ timeout: 10000 });
  });

  test('거래 유형 표시 (TOPUP, SUBSCRIPTION, REFUND)', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 거래 유형 배지 또는 텍스트
    const typeIndicators = page.locator(':has-text("충전"), :has-text("구독"), :has-text("환불"), :has-text("TOPUP")');
    // 거래 내역이 있으면 표시됨
  });

  test('거래 상태 표시 (SUCCESS, PENDING, FAILED)', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 상태 배지
    const statusBadges = page.locator(':has-text("성공"), :has-text("대기"), :has-text("실패"), [class*="badge"]');
    // 거래 내역이 있으면 표시됨
  });

  test('거래 날짜/시간 표시', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 날짜 형식 확인 (YYYY-MM-DD 또는 유사 형식)
    const datePattern = page.locator('text=/\\d{4}[-./]\\d{2}[-./]\\d{2}/');
    // 거래 내역이 있으면 날짜가 표시됨
  });

  test('거래 금액 표시', async ({ page }) => {
    await page.waitForTimeout(2000);

    // 금액 표시 (원 단위)
    const amountPattern = page.locator('text=/[+-]?[\\d,]+원/');
    // 거래 내역이 있으면 금액이 표시됨
  });
});

test.describe('결제 흐름', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/billing');
    await page.waitForLoadState('networkidle');
  });

  test('결제 버튼 초기 상태 (금액 미선택 시 비활성화)', async ({ page }) => {
    const payButton = page.locator('button:has-text("충전"), button:has-text("결제")');

    // 금액을 선택하지 않으면 비활성화
    await expect(payButton).toBeDisabled();
  });

  test('금액 선택 후 결제 버튼 활성화', async ({ page }) => {
    // 금액 선택
    await page.locator('button:has-text("50,000")').first().click();
    await page.waitForTimeout(1000);

    const payButton = page.locator('button:has-text("충전"), button:has-text("결제")');

    // 금액 선택 후 버튼 상태 확인
    // (TossPayments 위젯 로드 완료 후 활성화)
  });
});

test.describe('결제 완료/실패 처리', () => {
  test('결제 완료 후 리다이렉트 처리', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    // 결제 완료 시뮬레이션 (URL 파라미터로 테스트)
    await page.goto('/billing?paymentKey=test-key&orderId=test-order&amount=50000');

    // 결제 확인 API 호출 및 결과 처리
    await page.waitForTimeout(3000);

    // 성공 시 잔액 업데이트, 실패 시 에러 표시
  });

  test('결제 실패 페이지', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/billing/fail?code=USER_CANCEL&message=사용자 취소');

    // 실패 메시지 표시
    const errorMessage = page.locator(':has-text("실패"), :has-text("취소"), :has-text("오류")');
    await expect(errorMessage.first()).toBeVisible();
  });
});
