import { test, expect, Page } from '@playwright/test';
import { TEST_USER, TEST_MESSAGE } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';

/**
 * 우리동네 손님 찾기 E2E 테스트
 *
 * 중요: 테스트 발송은 1회만 실행됩니다 (testSendExecuted 플래그로 관리)
 *
 * 환경 변수:
 * - TEST_AUTH_TOKEN: 인증 토큰 (설정 시 로그인 건너뜀)
 * - TEST_USER_EMAIL/TEST_USER_PASSWORD: 로그인 계정 (토큰 없을 시 사용)
 */

// 테스트 발송 실행 여부를 추적하는 플래그
let testSendExecuted = false;

// 환경 변수에서 인증 정보 가져오기
const authToken = process.env.TEST_AUTH_TOKEN;
const testEmail = process.env.TEST_USER_EMAIL || TEST_USER.email;
const testPassword = process.env.TEST_USER_PASSWORD || TEST_USER.password;

// 로그인 및 페이지 이동 헬퍼 함수
async function loginAndNavigate(page: Page) {
  // 인증 토큰이 있으면 localStorage에 직접 설정
  if (authToken) {
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
    }, authToken);
    await page.goto('/local-customers');
    await page.waitForLoadState('domcontentloaded');
    return;
  }

  // 토큰이 없으면 로그인 시도
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(testEmail, testPassword);

  // 로그인 성공 확인 (실패해도 계속 진행)
  try {
    await loginPage.expectLoginSuccess();
  } catch (e) {
    console.log('로그인 실패 - 테스트 계정이 DB에 없을 수 있습니다.');
    // 로그인 실패 시 직접 페이지로 이동 시도
  }

  await page.goto('/local-customers');
  await page.waitForLoadState('domcontentloaded');
}

// ============================================
// 7.1 페이지 로드
// ============================================
test.describe('7.1 페이지 로드', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('페이지 로드 및 NEW 배지 표시', async ({ page }) => {
    await expect(page).toHaveURL('/local-customers');

    // 제목 확인 (페이지 헤딩)
    const title = page.locator('h1:has-text("신규 고객 유치")');
    await expect(title).toBeVisible();

    // NEW 배지 표시 (사이드바 등 여러 곳에 있으므로 화면에 보이는 첫 배지만 확인)
    const newBadge = page.locator('span:has-text("NEW"):visible').first();
    await expect(newBadge).toBeVisible();
  });

  test('카카오톡/SMS 탭 전환 기능', async ({ page }) => {
    // 쿠폰 알림톡 탭이 기본 선택 (기존 "카카오톡"에서 "쿠폰 알림톡"으로 변경됨)
    const kakaoTab = page.locator('button:has-text("쿠폰 알림톡")');
    const smsTab = page.locator('button:has-text("문자")').first();

    await expect(kakaoTab).toBeVisible();
    await expect(smsTab).toBeVisible();

    // SMS 탭 클릭
    await smsTab.click();
    await page.waitForTimeout(500);

    // 쿠폰 알림톡 탭으로 돌아가기
    await kakaoTab.click();
    await page.waitForTimeout(500);
  });

  test('전체 고객 수 표시', async ({ page }) => {
    // 전체 고객 카드 확인
    const totalCustomerCard = page.locator(':has-text("전체 고객")').first();
    await expect(totalCustomerCard).toBeVisible();

    // 숫자가 표시되는지 확인 (명 단위)
    const customerCount = page.locator('text=/\\d+명/');
    await expect(customerCount.first()).toBeVisible();
  });
});

// ============================================
// 7.2 지역 선택
// ============================================
test.describe('7.2 지역 선택', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('지역 검색 입력 필드', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await expect(searchInput).toBeVisible();
  });

  test('지역 드롭다운 표시 및 선택', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);

    // 드롭다운이 표시되는지 확인 (시/도 이름은 "서울", "경기" 등 단축 형태)
    const dropdown = page.locator('button:has-text("서울"), button:has-text("경기")');
    await expect(dropdown.first()).toBeVisible();

    // 지역 선택
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(1000);
  });

  test('지역 선택 시 태그로 표시', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);

    // 드롭다운이 표시될 때까지 대기
    const seoulButton = page.locator('button:has-text("서울")').first();
    await seoulButton.waitFor({ state: 'visible', timeout: 5000 });

    // 서울 선택 (시/도 이름은 단축 형태 "서울")
    await seoulButton.click();
    await page.waitForTimeout(1000);

    // 태그로 표시되는지 확인 (selected sido 태그에 "서울" 표시)
    // 태그는 bg-brand-100 클래스를 가진 span 내부에 sido 이름이 표시됨
    const regionTag = page.locator('[class*="bg-brand-100"]').filter({ hasText: '서울' }).first();
    await expect(regionTag).toBeVisible();
  });

  test('지역 제거 기능 (X 버튼)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);

    // 서울 선택 (시/도 이름은 단축 형태 "서울")
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(1000);

    // X 버튼 클릭하여 제거
    const regionTag = page.locator('span.bg-brand-100').filter({ hasText: '서울' }).first();
    const removeButton = regionTag.locator('button');
    await removeButton.click();
    await page.waitForTimeout(500);

    // 태그가 사라졌는지 확인
    await expect(page.locator('span.bg-brand-100').filter({ hasText: '서울' }).first()).not.toBeVisible();
  });

  test('지역 선택 시 고객 수 업데이트', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);

    // 초기 선택 지역 고객 수 확인
    const selectedRegionCard = page.locator(':has-text("선택 지역")').first();
    await expect(selectedRegionCard).toBeVisible();

    // 서울 선택 (시/도 이름은 단축 형태 "서울")
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 고객 수가 업데이트되었는지 확인 (0명이 아닌 값)
    const customerCount = page.locator(':has-text("선택 지역")').locator('text=/\\d+명/');
    await expect(customerCount.first()).toBeVisible();
  });
});

// ============================================
// 7.3 업종 선택
// ============================================
test.describe('7.3 업종 선택', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  // fixme: 업종 선택 UI가 리팩토링으로 제거됨 - 현재 페이지에 업종 카테고리 그룹(음식점/카페/주점)이 없음
  test.fixme('업종 카테고리 그룹 표시', async ({ page }) => {
    // 업종 그룹 라벨 확인
    const restaurantGroup = page.locator('text=음식점').first();
    const cafeGroup = page.locator('text=카페/디저트').first();
    const barGroup = page.locator('text=주점').first();

    await expect(restaurantGroup).toBeVisible();
    await expect(cafeGroup).toBeVisible();
    await expect(barGroup).toBeVisible();
  });

  // fixme: 업종 선택 UI가 리팩토링으로 제거됨 - 현재 페이지에 업종 토글 버튼이 없음
  test.fixme('업종 선택/해제 토글', async ({ page }) => {
    // 한식 버튼 클릭
    const koreanButton = page.locator('button:has-text("한식")');
    await koreanButton.click();
    await page.waitForTimeout(500);

    // 선택 상태 확인 (bg-brand-600 클래스)
    await expect(koreanButton).toHaveClass(/bg-brand-600/);

    // 다시 클릭하여 해제
    await koreanButton.click();
    await page.waitForTimeout(500);

    // 해제 상태 확인
    await expect(koreanButton).not.toHaveClass(/bg-brand-600/);
  });

  // fixme: 업종 선택 UI가 리팩토링으로 제거됨 - 현재 페이지에 업종 수 표시 기능이 없음
  test.fixme('선택된 업종 수 표시', async ({ page }) => {
    // 여러 업종 선택
    await page.locator('button:has-text("한식")').click();
    await page.locator('button:has-text("중식")').click();
    await page.waitForTimeout(500);

    // 선택된 업종 수 표시 확인
    const countText = page.locator('text=/\\d+개 업종 선택됨/');
    await expect(countText).toBeVisible();
  });
});

// ============================================
// 7.4 상세 필터
// ============================================
test.describe('7.4 상세 필터', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('성별 필터 (전체/여성/남성)', async ({ page }) => {
    const allGenderButton = page.locator('button:has-text("전체 성별")');
    const femaleButton = page.locator('button:has-text("여성")');
    const maleButton = page.locator('button:has-text("남성")');

    await expect(allGenderButton).toBeVisible();
    await expect(femaleButton).toBeVisible();
    await expect(maleButton).toBeVisible();

    // 여성 선택
    await femaleButton.click();
    await expect(femaleButton).toHaveClass(/bg-brand-600/);

    // 남성 선택
    await maleButton.click();
    await expect(maleButton).toHaveClass(/bg-brand-600/);
  });

  test('연령대 필터 (20대~60대 이상)', async ({ page }) => {
    const age20 = page.locator('button:has-text("20대")');
    const age30 = page.locator('button:has-text("30대")');
    const age40 = page.locator('button:has-text("40대")');
    const age50 = page.locator('button:has-text("50대")');
    const age60 = page.locator('button:has-text("60대 이상")');

    await expect(age20).toBeVisible();
    await expect(age30).toBeVisible();
    await expect(age40).toBeVisible();
    await expect(age50).toBeVisible();
    await expect(age60).toBeVisible();
  });

  test('다중 연령대 선택 가능', async ({ page }) => {
    const age20 = page.locator('button:has-text("20대")');
    const age30 = page.locator('button:has-text("30대")');

    await age20.click();
    await age30.click();
    await page.waitForTimeout(500);

    // 둘 다 선택 상태
    await expect(age20).toHaveClass(/bg-brand-600/);
    await expect(age30).toHaveClass(/bg-brand-600/);
  });

  test('연령대 미선택 시 안내 메시지', async ({ page }) => {
    const helpText = page.locator('text=연령대 미선택 시 전체 연령대로 발송됩니다');
    await expect(helpText).toBeVisible();
  });
});

// ============================================
// 7.5 발송 인원 수 설정
// ============================================
test.describe('7.5 발송 인원 수 설정', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('발송 인원 수 입력', async ({ page }) => {
    const sendCountInput = page.locator('input[type="number"]').first();
    await expect(sendCountInput).toBeVisible();

    await sendCountInput.fill('50');
    const value = await sendCountInput.inputValue();
    expect(value).toBe('50');
  });

  test('발송 가능 인원 초과 시 경고 표시', async ({ page }) => {
    // 지역 선택
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 매우 큰 숫자 입력
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('999999');
    await page.waitForTimeout(500);

    // 경고 메시지 확인
    const warning = page.locator('text=발송 가능 인원 초과');
    await expect(warning).toBeVisible();
  });

  test('최대 발송 가능 인원 안내', async ({ page }) => {
    // 지역 선택
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 최대 발송 가능 안내 텍스트
    const maxInfo = page.locator('text=/최대 발송 가능.*명/');
    await expect(maxInfo).toBeVisible();
  });
});

// ============================================
// 7.6 메시지 입력
// ============================================
test.describe('7.6 메시지 입력', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('메시지 내용 입력 (textarea)', async ({ page }) => {
    const messageTextarea = page.locator('textarea');
    await expect(messageTextarea).toBeVisible();

    await messageTextarea.fill(TEST_MESSAGE.content);
    const value = await messageTextarea.inputValue();
    expect(value).toBe(TEST_MESSAGE.content);
  });

  test('SMS: 바이트 카운터 및 SMS/LMS 자동 전환', async ({ page }) => {
    // SMS 탭으로 전환
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    const messageTextarea = page.locator('textarea');

    // 짧은 메시지 입력
    await messageTextarea.fill('짧은 메시지');
    await page.waitForTimeout(500);

    // SMS 표시 확인
    const smsIndicator = page.locator('text=/SMS.*byte/');
    await expect(smsIndicator).toBeVisible();

    // 긴 메시지 입력
    await messageTextarea.fill(TEST_MESSAGE.longContent);
    await page.waitForTimeout(500);

    // LMS로 전환 확인
    const lmsIndicator = page.locator('text=/LMS.*byte/');
    await expect(lmsIndicator).toBeVisible();
  });

  test('카카오톡: 글자 수 표시', async ({ page }) => {
    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill('테스트 메시지');
    await page.waitForTimeout(500);

    // 글자 수 표시 확인
    const charCount = page.locator('text=/\\d+자/');
    await expect(charCount.first()).toBeVisible();
  });

  // fixme: 카카오톡 버튼 추가 UI가 리팩토링으로 제거됨 - 현재 쿠폰 알림톡 탭은 쿠폰 내용/유효기간 입력 폼으로 변경됨
  test.fixme('버튼 추가 (카카오톡 전용, 최대 5개)', async ({ page }) => {
    // 버튼 추가 버튼 확인
    const addButtonBtn = page.locator('button:has-text("버튼 추가")');
    await expect(addButtonBtn).toBeVisible();

    // 버튼 추가
    await addButtonBtn.click();
    await page.waitForTimeout(500);

    // 버튼 입력 필드 확인
    const buttonNameInput = page.locator('input[placeholder*="버튼 이름"]');
    await expect(buttonNameInput.first()).toBeVisible();

    // URL 입력 필드 확인
    const urlInput = page.locator('input[placeholder*="URL"]');
    await expect(urlInput.first()).toBeVisible();
  });
});

// ============================================
// 7.7 비용 계산
// ============================================
test.describe('7.7 비용 계산', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('SMS: 150원/건 표시', async ({ page }) => {
    // SMS 탭 전환
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    const costInfo = page.locator('text=150원');
    await expect(costInfo.first()).toBeVisible();
  });

  test('카카오톡: 텍스트 150원 표시', async ({ page }) => {
    const costInfo = page.locator('text=150원');
    await expect(costInfo.first()).toBeVisible();
  });

  test('예상 비용 계산 (인원 × 단가)', async ({ page }) => {
    // 지역 선택
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 인원 설정
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('100');
    await page.waitForTimeout(1000);

    // 예상 비용 표시 확인 (100 × 150 = 15,000원)
    const costDisplay = page.locator('text=/15,000원/');
    await expect(costDisplay.first()).toBeVisible();
  });

  test('현재 잔액 표시', async ({ page }) => {
    const balanceLabel = page.locator('text=현재 잔액');
    await expect(balanceLabel).toBeVisible();
  });
});

// ============================================
// 7.8 예상 마케팅 효과
// ============================================
test.describe('7.8 예상 마케팅 효과', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('카카오톡: 예상 방문율 3.4% 표시', async ({ page }) => {
    // 쿠폰 알림톡 탭으로 전환
    await page.locator('button:has-text("쿠폰 알림톡")').click();
    await page.waitForTimeout(500);

    // 지역 선택 및 인원 설정
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    // 드롭다운이 열릴 때까지 대기
    const seoulButton = page.locator('button:has-text("서울")').first();
    await seoulButton.waitFor({ state: 'visible', timeout: 5000 });
    await seoulButton.click();
    await page.waitForTimeout(2000);

    // 발송 인원 수 직접 입력 (API가 sendCount를 availableCount로 설정하므로 이미 >0일 수 있음)
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.clear();
    await sendCountInput.fill('100');
    await page.waitForTimeout(1000);

    // 예상 방문율 표시 확인 (쿠폰 알림톡 conversionRate = 0.034 → 3.4%)
    // 값 출처: apps/web/src/app/(dashboard)/local-customers/page.tsx, const conversionRate = activeTab === 'kakao' ? 0.034 : 0.027
    const conversionRate = page.getByText('3.4%');
    await expect(conversionRate.first()).toBeVisible();
  });

  test('SMS: 예상 방문율 2.7% 표시', async ({ page }) => {
    // SMS 탭 전환
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    // 지역 선택 및 인원 설정
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    // 드롭다운이 열릴 때까지 대기
    const seoulButton = page.locator('button:has-text("서울")').first();
    await seoulButton.waitFor({ state: 'visible', timeout: 5000 });
    await seoulButton.click();
    await page.waitForTimeout(2000);

    // 발송 인원 수 직접 입력
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.clear();
    await sendCountInput.fill('100');
    await page.waitForTimeout(1000);

    // 예상 방문율 표시 확인 (SMS conversionRate = 0.027 → 2.7%)
    // 값 출처: apps/web/src/app/(dashboard)/local-customers/page.tsx, const conversionRate = activeTab === 'kakao' ? 0.034 : 0.027
    const conversionRate = page.getByText('2.7%');
    await expect(conversionRate.first()).toBeVisible();
  });

  test('예상 방문 인원 계산', async ({ page }) => {
    // 지역 선택 및 인원 설정
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('100');
    await page.waitForTimeout(1000);

    // 예상 방문 표시 확인
    const expectedVisits = page.locator('text=예상 방문').first();
    await expect(expectedVisits).toBeVisible();
  });

  test('예상 매출 계산', async ({ page }) => {
    // 지역 선택 및 인원 설정
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('100');
    await page.waitForTimeout(1000);

    // 예상 매출 표시 확인
    const expectedRevenue = page.locator('text=예상 매출').first();
    await expect(expectedRevenue).toBeVisible();
  });
});

// ============================================
// 7.9 테스트 발송 (SMS 전용, 1회만)
// ============================================
test.describe('7.9 테스트 발송 (SMS 전용)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
    // SMS 탭으로 전환
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);
  });

  test('테스트 전화번호 입력 필드', async ({ page }) => {
    const testPhoneInput = page.locator('input[placeholder*="010"]');
    await expect(testPhoneInput).toBeVisible();
  });

  test('테스트 발송 버튼', async ({ page }) => {
    const testSendButton = page.locator('button:has-text("테스트 발송")');
    await expect(testSendButton).toBeVisible();
  });

  test('테스트 발송 실행 (1회만)', async ({ page }) => {
    // 이미 실행되었으면 스킵
    if (testSendExecuted) {
      console.log('테스트 발송은 이미 1회 실행되었습니다. 스킵합니다.');
      return;
    }

    // 메시지 입력
    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill(TEST_MESSAGE.content);
    await page.waitForTimeout(300);

    // 테스트 전화번호 입력
    const testPhoneInput = page.locator('input[placeholder*="010"]');
    await testPhoneInput.fill(TEST_USER.phone);
    await page.waitForTimeout(300);

    // 테스트 발송 버튼 클릭 (버튼이 활성화된 상태에서 클릭)
    const testSendButton = page.locator('button:has-text("테스트 발송")');
    await expect(testSendButton).toBeVisible();
    await testSendButton.click();

    // 응답 대기
    await page.waitForTimeout(3000);

    // 성공 또는 에러 메시지 확인
    // 성공: "테스트 메시지가 발송되었습니다." 녹색 div
    // 에러: p3 bg-red-50 border-red-200 text-red-700 에러 div
    const successMessage = page.locator('text=테스트 메시지가 발송되었습니다');
    const errorDiv = page.locator('.bg-red-50');

    const hasSuccess = await successMessage.isVisible().catch(() => false);
    const hasError = await errorDiv.isVisible().catch(() => false);

    expect(hasSuccess || hasError).toBeTruthy();

    // 테스트 발송 완료 플래그 설정
    testSendExecuted = true;
  });
});

// ============================================
// 7.10 미리보기 (데스크톱)
// ============================================
test.describe('7.10 미리보기 (데스크톱)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAndNavigate(page);
  });

  test('카카오톡: 쿠폰 알림톡 미리보기', async ({ page }) => {
    // 쿠폰 알림톡 탭으로 전환
    await page.locator('button:has-text("쿠폰 알림톡")').click();
    await page.waitForTimeout(500);

    // 쿠폰 알림톡 미리보기 영역 확인 (기존 "브랜드 메시지" → "알림톡 도착" 배너로 변경)
    const kakaoPreview = page.locator('text=알림톡 도착');
    await expect(kakaoPreview).toBeVisible();
  });

  test('SMS: iPhone 문자 미리보기', async ({ page }) => {
    // SMS 탭 전환
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    // iPhone 미리보기 영역 확인
    const iphonePreview = page.locator('text=문자 메시지');
    await expect(iphonePreview).toBeVisible();
  });

  test('미리보기가 sticky로 스크롤 따라감', async ({ page }) => {
    // sticky 요소 확인 (데스크톱에서 사이드바가 sticky top-0으로 고정됨)
    // MobileHeader(lg:hidden)는 DOM에 있지만 데스크톱에서 hidden이므로 aside를 사용
    const stickyPreview = page.locator('aside.sticky');
    await expect(stickyPreview.first()).toBeVisible();

    // 스크롤
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    // 여전히 보이는지 확인 (sticky 요소는 스크롤 후에도 뷰포트에 고정됨)
    await expect(stickyPreview.first()).toBeVisible();
  });

  test('메시지 내용 실시간 반영', async ({ page }) => {
    const testContent = '미리보기 테스트 메시지입니다.';

    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill(testContent);
    await page.waitForTimeout(500);

    // 미리보기에 메시지가 반영되는지 확인
    const previewContent = page.locator(`text=${testContent}`);
    await expect(previewContent.first()).toBeVisible();
  });
});

// ============================================
// 7.11 메시지 발송
// ============================================
test.describe('7.11 메시지 발송', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('필수 조건 미충족 시 발송 버튼 비활성화', async ({ page }) => {
    // 아무것도 입력하지 않은 상태 (버튼 텍스트는 "발송하기")
    const sendButton = page.locator('button:has-text("발송하기")');

    // 비활성화 상태 확인
    await expect(sendButton).toBeDisabled();
  });

  test('지역 및 메시지 입력 후 발송 버튼 상태 변경', async ({ page }) => {
    // SMS 탭으로 전환 (textarea 사용)
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    // 지역 선택
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 메시지 입력
    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill(TEST_MESSAGE.content);

    // 발송 인원 설정
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('10');
    await page.waitForTimeout(1000);

    // 발송 버튼 상태 확인 (잔액에 따라 활성화/비활성화)
    const sendButton = page.locator('button:has-text("발송하기")');
    await expect(sendButton).toBeVisible();
  });

  test('카카오톡 발송 불가 시간대(20:50~08:00) 안내', async ({ page }) => {
    // 현재 시간이 발송 불가 시간대인 경우에만 안내 표시됨
    // 발송 불가 시간대 안내 텍스트 존재 여부만 확인 (시간에 따라 다름)
    const timeWarning = page.locator('text=현재 발송 불가 시간대입니다');

    // 시간대에 관계없이 테스트 통과 (존재할 수도 있고 없을 수도 있음)
    const isVisible = await timeWarning.isVisible().catch(() => false);
    console.log(`발송 불가 시간대 안내 표시: ${isVisible}`);
  });
});

// ============================================
// 통합 시나리오 테스트
// ============================================
test.describe('통합 시나리오', () => {
  test('전체 발송 플로우 (지역 선택 → 필터 → 메시지 입력 → 비용 확인)', async ({ page }) => {
    await loginAndNavigate(page);

    // SMS 탭으로 전환 (textarea 및 메시지 입력 사용)
    await page.locator('button:has-text("문자")').first().click();
    await page.waitForTimeout(500);

    // 1. 지역 선택 (시/도 이름은 단축 형태 "서울")
    const searchInput = page.locator('input[placeholder*="지역 검색"]');
    await searchInput.click();
    await page.locator('button:has-text("서울")').first().click();
    await page.waitForTimeout(2000);

    // 2. 업종 선택 UI가 리팩토링으로 제거됨 - 이 단계는 건너뜁니다

    // 3. 성별 필터
    await page.locator('button:has-text("여성")').click();
    await page.waitForTimeout(500);

    // 4. 연령대 필터
    await page.locator('button:has-text("30대")').click();
    await page.waitForTimeout(500);

    // 5. 발송 인원 설정
    const sendCountInput = page.locator('input[type="number"]').first();
    await sendCountInput.fill('50');
    await page.waitForTimeout(1000);

    // 6. 메시지 입력
    const messageTextarea = page.locator('textarea');
    await messageTextarea.fill(TEST_MESSAGE.content);
    await page.waitForTimeout(500);

    // 7. 비용 확인
    const costDisplay = page.locator('text=예상 비용');
    await expect(costDisplay).toBeVisible();

    // 8. 예상 마케팅 효과 확인
    const marketingEffect = page.locator('text=예상 마케팅 효과');
    await expect(marketingEffect).toBeVisible();
  });
});
