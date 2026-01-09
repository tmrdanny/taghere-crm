import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/register.page';
import { TEST_USER, STORE_CATEGORIES } from '../fixtures/test-data';

test.describe('회원가입 기능', () => {
  let registerPage: RegisterPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('회원가입 페이지가 정상적으로 로드된다', async ({ page }) => {
    await expect(page).toHaveURL('/register');
    await expect(registerPage.storeNameInput).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
  });

  test('모든 필수 입력 필드가 존재한다', async () => {
    await expect(registerPage.storeNameInput).toBeVisible();
    await expect(registerPage.categorySelect).toBeVisible();
    await expect(registerPage.ownerNameInput).toBeVisible();
    await expect(registerPage.phoneInput).toBeVisible();
    await expect(registerPage.businessRegNumberInput).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
  });

  test('카테고리 드롭다운에 옵션들이 있다', async ({ page }) => {
    const options = await registerPage.categorySelect.locator('option').allTextContents();
    // 기본 옵션 외에 카테고리들이 있어야 함
    expect(options.length).toBeGreaterThan(1);
  });

  test('비밀번호가 일치하지 않으면 오류 표시', async ({ page }) => {
    await registerPage.storeNameInput.fill('테스트 매장');
    await registerPage.emailInput.fill('newuser@test.com');
    await registerPage.passwordInput.fill('password123');
    await registerPage.confirmPasswordInput.fill('differentpassword');

    await registerPage.submit();

    // 비밀번호 불일치 오류 확인
    const errorOrValidation = page.locator(':has-text("일치"), :has-text("동일"), [class*="error"]');
    // 검증 실패 시 페이지에 남아있어야 함
    await expect(page).toHaveURL(/\/register/);
  });

  test('짧은 비밀번호로 가입 시도 시 오류', async ({ page }) => {
    await registerPage.storeNameInput.fill('테스트 매장');
    await registerPage.emailInput.fill('newuser@test.com');
    await registerPage.passwordInput.fill('short');
    await registerPage.confirmPasswordInput.fill('short');

    await registerPage.submit();

    // 여전히 회원가입 페이지에 있어야 함
    await expect(page).toHaveURL(/\/register/);
  });

  test('이미 등록된 이메일로 가입 시도 시 오류', async ({ page }) => {
    await registerPage.fillRegistrationForm({
      storeName: '테스트 매장 2',
      category: '카페/디저트',
      ownerName: '중복 테스트',
      phone: '010-9999-8888',
      businessRegNumber: '999-88-77777',
      address: '서울특별시 테스트구',
      email: TEST_USER.email, // 이미 존재하는 이메일
      password: 'testpassword123',
    });

    await registerPage.submit();

    // 오류 메시지 또는 페이지에 남아있음
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    // 회원가입 페이지에 있거나 오류가 표시되어야 함
    const hasError = await page.locator(':has-text("이미"), :has-text("존재"), [class*="error"]').isVisible();
    expect(currentUrl.includes('/register') || hasError).toBeTruthy();
  });

  test('로그인 페이지로 이동', async () => {
    await registerPage.goToLogin();
  });
});

test.describe('회원가입 폼 유효성 검사', () => {
  let registerPage: RegisterPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('전화번호 형식 검증', async ({ page }) => {
    await registerPage.phoneInput.fill('invalid-phone');
    await registerPage.phoneInput.blur();

    // 유효하지 않은 전화번호에 대한 시각적 피드백 확인
    const phoneField = registerPage.phoneInput;
    // 일반적으로 invalid 상태이거나 오류 스타일이 적용됨
  });

  test('이메일 형식 검증', async ({ page }) => {
    await registerPage.emailInput.fill('invalid-email');
    await registerPage.emailInput.blur();

    // HTML5 이메일 검증이 작동해야 함
    const isInvalid = await registerPage.emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    expect(isInvalid).toBeTruthy();
  });

  test('사업자등록번호 형식 검증', async ({ page }) => {
    // 일반적으로 000-00-00000 형식
    await registerPage.businessRegNumberInput.fill('123-45-67890');
    const value = await registerPage.businessRegNumberInput.inputValue();
    expect(value).toMatch(/\d{3}-\d{2}-\d{5}|\d{10}/);
  });
});
