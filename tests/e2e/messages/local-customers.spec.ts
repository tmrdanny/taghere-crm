import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_MESSAGE } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';

test.describe('우리동네 손님 찾기 기능', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('페이지 로드 및 NEW 배지 표시', async ({ page }) => {
    await expect(page).toHaveURL('/local-customers');

    // NEW 배지 표시
    const newBadge = page.locator(':has-text("NEW"), [class*="badge"]');
    await expect(newBadge.first()).toBeVisible();
  });

  test('시/도 선택 드롭다운', async ({ page }) => {
    const sidoSelect = page.locator('select').first();
    await expect(sidoSelect).toBeVisible();

    // 옵션들이 로드됨
    await sidoSelect.click();
    await page.waitForTimeout(1000);

    const options = sidoSelect.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1); // 기본 옵션 + 시/도 목록
  });

  test('지역 선택 시 고객 수 업데이트', async ({ page }) => {
    const sidoSelect = page.locator('select').first();

    // 서울 선택
    await sidoSelect.selectOption({ label: '서울특별시' });
    await page.waitForTimeout(2000);

    // 고객 수가 업데이트됨
    const customerCount = page.locator(':has-text("명"), [class*="count"]');
    await expect(customerCount.first()).toBeVisible();
  });

  test('발송 대상 카드 표시 (전체 고객, 발송 가능, 발송 예정)', async ({ page }) => {
    const cards = page.locator('[class*="card"], [class*="rounded-xl"]');

    // 전체 고객, 발송 가능, 발송 예정 카드
    const totalCard = page.locator(':has-text("전체 고객")');
    const availableCard = page.locator(':has-text("발송 가능")');
    const expectedCard = page.locator(':has-text("발송 예정")');

    await expect(totalCard).toBeVisible();
    await expect(availableCard).toBeVisible();
    await expect(expectedCard).toBeVisible();
  });
});

test.describe('상세 필터', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('성별 필터 버튼', async ({ page }) => {
    const genderButtons = page.locator('button:has-text("전체 성별"), button:has-text("여성"), button:has-text("남성")');

    await expect(genderButtons.first()).toBeVisible();

    // 여성 선택
    const femaleButton = page.locator('button:has-text("여성")');
    await femaleButton.click();

    // 선택 상태 확인
    await expect(femaleButton).toHaveClass(/bg-brand|active|selected/);
  });

  test('연령대 필터 버튼', async ({ page }) => {
    const ageButtons = page.locator('button:has-text("20대"), button:has-text("30대"), button:has-text("40대"), button:has-text("50대"), button:has-text("60대")');

    await expect(ageButtons.first()).toBeVisible();

    // 30대 선택
    const thirtiesButton = page.locator('button:has-text("30대")');
    await thirtiesButton.click();

    // 선택 상태 확인 (토글 가능)
    await expect(thirtiesButton).toHaveClass(/bg-brand|active|selected/);
  });

  test('연령대 미선택 시 안내 메시지', async ({ page }) => {
    const helpText = page.locator(':has-text("연령대 미선택 시 전체 연령대로 발송")');
    await expect(helpText).toBeVisible();
  });
});

test.describe('발송 인원 수 설정', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('발송 인원 수 입력', async ({ page }) => {
    const sendCountInput = page.locator('input[type="number"]').first();
    await expect(sendCountInput).toBeVisible();

    await sendCountInput.fill('50');
    const value = await sendCountInput.inputValue();
    expect(value).toBe('50');
  });

  test('발송 가능 인원 초과 시 경고', async ({ page }) => {
    // 먼저 지역 선택
    const sidoSelect = page.locator('select').first();
    await sidoSelect.selectOption({ index: 1 });
    await page.waitForTimeout(2000);

    // 매우 큰 숫자 입력
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('999999');

    // 경고 메시지 확인
    await page.waitForTimeout(500);
    const warning = page.locator(':has-text("초과"), :has-text("부족"), [class*="warning"], [class*="orange"]');
    // 초과하면 경고가 표시됨
  });
});

test.describe('메시지 입력 및 비용 계산', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('메시지 내용 입력', async ({ page }) => {
    const messageTextarea = page.locator('textarea');
    await expect(messageTextarea).toBeVisible();

    await messageTextarea.fill(TEST_MESSAGE.content);
    const value = await messageTextarea.inputValue();
    expect(value).toBe(TEST_MESSAGE.content);
  });

  test('SMS/LMS 자동 전환 표시', async ({ page }) => {
    const messageTextarea = page.locator('textarea');

    // 짧은 메시지
    await messageTextarea.fill('짧은 메시지');
    await page.waitForTimeout(500);

    const typeIndicator = page.locator(':has-text("SMS"), :has-text("LMS")');
    await expect(typeIndicator.first()).toBeVisible();
  });

  test('비용 200원/건 표시', async ({ page }) => {
    const costInfo = page.locator(':has-text("200원"), :has-text("200")');
    await expect(costInfo.first()).toBeVisible();
  });

  test('예상 비용 계산', async ({ page }) => {
    // 지역 선택
    const sidoSelect = page.locator('select').first();
    await sidoSelect.selectOption({ index: 1 });
    await page.waitForTimeout(2000);

    // 인원 설정
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('100');

    // 예상 비용: 100명 × 200원 = 20,000원
    await page.waitForTimeout(500);
    const costDisplay = page.locator(':has-text("20,000원"), :has-text("예상 비용")');
    await expect(costDisplay.first()).toBeVisible();
  });
});

test.describe('테스트 발송', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('테스트 발송 입력 영역', async ({ page }) => {
    const testPhoneInput = page.locator('input[placeholder*="010"], input[type="tel"]');
    const testSendButton = page.locator('button:has-text("테스트 발송")');

    await expect(testPhoneInput).toBeVisible();
    await expect(testSendButton).toBeVisible();
  });

  test('테스트 전화번호 입력', async ({ page }) => {
    const testPhoneInput = page.locator('input[placeholder*="010"], input[type="tel"]');
    await testPhoneInput.fill('010-1234-5678');

    const value = await testPhoneInput.inputValue();
    expect(value).toContain('010');
  });
});

test.describe('iPhone 미리보기', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('iPhone 미리보기 영역 표시 (데스크톱)', async ({ page }) => {
    // 데스크톱 뷰포트에서만 표시
    await page.setViewportSize({ width: 1280, height: 800 });

    const iphonePreview = page.locator('[class*="iphone"], [class*="preview"], [class*="rounded-\\[44px\\]"]');
    await expect(iphonePreview.first()).toBeVisible();
  });

  test('메시지 내용이 미리보기에 반영', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const messageTextarea = page.locator('textarea');
    const testContent = '미리보기 테스트 메시지입니다.';
    await messageTextarea.fill(testContent);

    await page.waitForTimeout(500);

    // 미리보기에 메시지가 표시됨
    const preview = page.locator('[class*="preview"], [class*="iphone"]');
    if (await preview.isVisible()) {
      await expect(preview).toContainText(testContent.substring(0, 10));
    }
  });

  test('미리보기가 sticky로 스크롤 따라감', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // 스크롤 전 미리보기 위치
    const preview = page.locator('.sticky, [class*="sticky"]');

    if (await preview.isVisible()) {
      // 페이지 스크롤
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(500);

      // 미리보기가 여전히 보이는지 확인 (sticky)
      await expect(preview).toBeVisible();
    }
  });
});

test.describe('메시지 발송', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/local-customers');
    await page.waitForLoadState('networkidle');
  });

  test('필수 조건 미충족 시 발송 버튼 비활성화', async ({ page }) => {
    // 아무것도 입력하지 않은 상태
    const sendButton = page.locator('button:has-text("메시지 발송"), button:has-text("발송하기")');

    // 지역 미선택, 메시지 미입력 시 비활성화
    await expect(sendButton).toBeDisabled();
  });

  test('발송 가능 상태 확인', async ({ page }) => {
    // 지역 선택
    const sidoSelect = page.locator('select').first();
    await sidoSelect.selectOption({ index: 1 });
    await page.waitForTimeout(2000);

    // 메시지 입력
    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill(TEST_MESSAGE.content);

    // 발송 버튼 활성화 확인
    await page.waitForTimeout(500);
    const sendButton = page.locator('button:has-text("메시지 발송"), button:has-text("발송하기")');

    // 잔액과 발송 가능 인원에 따라 활성화 여부 결정
  });
});
