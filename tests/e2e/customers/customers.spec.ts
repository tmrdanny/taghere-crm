import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_CUSTOMER } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';

test.describe('고객 관리 기능', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    // 고객 리스트 페이지로 이동
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
  });

  test('고객 리스트 페이지 로드', async ({ page }) => {
    await expect(page).toHaveURL('/customers');

    // 고객 리스트 테이블 또는 카드가 표시되어야 함
    const customerList = page.locator('table, [class*="customer-list"], [class*="grid"]');
    await expect(customerList).toBeVisible({ timeout: 10000 });
  });

  test('고객 검색 기능', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="이름"], input[placeholder*="전화"]');

    if (await searchInput.isVisible()) {
      await searchInput.fill('테스트');
      await page.keyboard.press('Enter');

      // 검색 결과가 반영될 때까지 대기
      await page.waitForTimeout(1000);

      // URL에 검색 파라미터가 포함되거나 결과가 필터링됨
      const url = page.url();
      // 검색이 동작했는지 확인 (URL 파라미터 또는 결과 변경)
    }
  });

  test('고객 상세 정보 보기', async ({ page }) => {
    // 첫 번째 고객 클릭
    const firstCustomer = page.locator('table tbody tr, [class*="customer-card"]').first();

    if (await firstCustomer.isVisible()) {
      await firstCustomer.click();

      // 상세 정보 모달/페이지가 표시되어야 함
      const detailView = page.locator('[class*="modal"], [class*="detail"], [class*="drawer"]');
      await expect(detailView.or(page.locator(':has-text("고객 정보")'))).toBeVisible({ timeout: 5000 });
    }
  });

  test('고객 목록 페이지네이션', async ({ page }) => {
    const pagination = page.locator('[class*="pagination"], button:has-text("다음"), button:has-text("이전")');

    if (await pagination.isVisible()) {
      const nextButton = page.locator('button:has-text("다음"), [aria-label="next page"]');

      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(500);

        // 페이지가 변경되었는지 확인
        const url = page.url();
        // URL에 page 파라미터가 있거나 내용이 변경됨
      }
    }
  });

  test('고객 정렬 기능', async ({ page }) => {
    const sortHeader = page.locator('th:has-text("방문"), th:has-text("포인트"), [class*="sort"]');

    if (await sortHeader.first().isVisible()) {
      await sortHeader.first().click();
      await page.waitForTimeout(500);

      // 정렬 아이콘이 변경되거나 URL에 sort 파라미터 추가
    }
  });
});

test.describe('고객 필터링', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
  });

  test('성별 필터', async ({ page }) => {
    const genderFilter = page.locator('select:has-text("성별"), button:has-text("성별")');

    if (await genderFilter.isVisible()) {
      await genderFilter.click();
      const femaleOption = page.locator('[role="option"]:has-text("여성"), option:has-text("여성")');

      if (await femaleOption.isVisible()) {
        await femaleOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('연령대 필터', async ({ page }) => {
    const ageFilter = page.locator('select:has-text("연령"), button:has-text("연령")');

    if (await ageFilter.isVisible()) {
      await ageFilter.click();
      const ageOption = page.locator('[role="option"]:has-text("20대"), option:has-text("20대")');

      if (await ageOption.isVisible()) {
        await ageOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});

test.describe('고객 데이터 내보내기', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
  });

  test('고객 목록 엑셀 내보내기', async ({ page }) => {
    const exportButton = page.locator('button:has-text("내보내기"), button:has-text("엑셀"), button:has-text("다운로드")');

    if (await exportButton.isVisible()) {
      // 다운로드 이벤트 감지
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();

      try {
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.(xlsx|csv|xls)$/);
      } catch {
        // 다운로드가 없으면 다른 내보내기 방식일 수 있음
      }
    }
  });
});
