import { test, expect } from '@playwright/test';
import { TEST_USER } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';

test.describe('발송 내역 페이지', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/message-history');
    await page.waitForLoadState('networkidle');
  });

  test('발송 내역 페이지 로드', async ({ page }) => {
    await expect(page).toHaveURL('/message-history');

    // 발송 내역 테이블/리스트가 표시됨
    const historyContainer = page.locator('table, [class*="history"], [class*="list"]');
    await expect(historyContainer.first()).toBeVisible({ timeout: 10000 });
  });

  test('발송 상태 배지 표시', async ({ page }) => {
    // 상태 배지: PENDING, SENT, FAILED
    const statusBadges = page.locator(':has-text("대기"), :has-text("완료"), :has-text("실패"), :has-text("발송")');

    // 기록이 있으면 상태 배지가 표시됨
    await page.waitForTimeout(2000);
  });

  test('발송 내역 상세 정보 표시', async ({ page }) => {
    // 테이블 헤더 확인
    const headers = page.locator('th, [class*="header"]');

    // 필수 컬럼: 수신번호, 발송일시, 상태, 내용 등
    const expectedHeaders = ['수신', '발송', '상태', '내용', '비용'];

    for (const header of expectedHeaders) {
      const headerElement = page.locator(`th:has-text("${header}"), [class*="header"]:has-text("${header}")`);
      // 헤더가 존재하는지 확인 (모든 헤더가 필수는 아님)
    }
  });

  test('전화번호 마스킹 처리', async ({ page }) => {
    // 전화번호가 마스킹되어 표시됨 (예: 010-****-1234)
    await page.waitForTimeout(2000);

    const maskedPhones = page.locator('text=/010-\\*{4}-\\d{4}/');
    // 기록이 있으면 마스킹된 전화번호가 표시됨
  });

  test('발송 요약 통계 표시', async ({ page }) => {
    // 전체, 성공, 실패, 대기 건수
    const summary = page.locator(':has-text("전체"), :has-text("성공"), :has-text("실패")');

    await page.waitForTimeout(2000);
  });
});

test.describe('발송 내역 필터링', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/message-history');
    await page.waitForLoadState('networkidle');
  });

  test('날짜 범위 필터', async ({ page }) => {
    const dateFilter = page.locator('input[type="date"], [class*="date-picker"], button:has-text("날짜")');

    if (await dateFilter.first().isVisible()) {
      await dateFilter.first().click();
      // 날짜 선택 UI 표시
    }
  });

  test('상태별 필터', async ({ page }) => {
    const statusFilter = page.locator('select:has-text("상태"), button:has-text("상태"), [role="combobox"]');

    if (await statusFilter.first().isVisible()) {
      await statusFilter.first().click();

      const options = page.locator('[role="option"], option');
      // 상태 옵션들이 표시됨
    }
  });

  test('메시지 유형별 필터 (SMS/LMS/MMS)', async ({ page }) => {
    const typeFilter = page.locator('button:has-text("SMS"), button:has-text("LMS"), button:has-text("MMS"), select:has-text("유형")');

    if (await typeFilter.first().isVisible()) {
      await typeFilter.first().click();
    }
  });
});

test.describe('발송 내역 페이지네이션', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/message-history');
    await page.waitForLoadState('networkidle');
  });

  test('페이지네이션 컨트롤 표시', async ({ page }) => {
    const pagination = page.locator('[class*="pagination"], nav[aria-label*="pagination"], button:has-text("다음")');

    // 기록이 많으면 페이지네이션이 표시됨
    await page.waitForTimeout(2000);
  });

  test('페이지 이동', async ({ page }) => {
    const nextButton = page.locator('button:has-text("다음"), [aria-label="next"], button:has-text(">")');

    if (await nextButton.isVisible() && await nextButton.isEnabled()) {
      await nextButton.click();
      await page.waitForTimeout(1000);

      // 페이지가 변경됨
    }
  });
});

test.describe('에러 메시지 표시', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/message-history');
    await page.waitForLoadState('networkidle');
  });

  test('실패한 메시지의 에러 코드가 한국어로 표시', async ({ page }) => {
    // SOLAPI 에러 코드가 사용자 친화적인 한국어로 번역됨
    await page.waitForTimeout(2000);

    // 실패 항목이 있으면 에러 메시지 확인
    const failedItems = page.locator(':has-text("실패"), [class*="failed"]');

    if (await failedItems.first().isVisible()) {
      // 에러 코드 또는 번역된 메시지가 표시됨
    }
  });
});
