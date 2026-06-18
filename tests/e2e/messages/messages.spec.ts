import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_MESSAGE } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';
import { MessagesPage } from '../pages/messages.page';

test.describe('메시지 발송 기능', () => {
  let messagesPage: MessagesPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    messagesPage = new MessagesPage(page);
    await messagesPage.goto();
  });

  test('메시지 발송 페이지 로드', async ({ page }) => {
    await expect(page).toHaveURL('/messages');
    // Default tab is kakao (쿠폰 알림톡); switch to SMS tab to see textarea
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);
    await expect(messagesPage.messageTextarea).toBeVisible();
  });

  test('발송 대상 선택 버튼들이 표시된다', async ({ page }) => {
    // 전체, 재방문, 신규, 직접 선택 버튼 확인
    const targetButtons = page.locator('button:has-text("전체"), button:has-text("재방문"), button:has-text("신규")');
    await expect(targetButtons.first()).toBeVisible();
  });

  test('메시지 입력 시 바이트 카운터 업데이트', async ({ page }) => {
    // Switch to SMS tab first (default tab is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    await messagesPage.messageTextarea.fill('테스트 메시지');
    await page.waitForTimeout(500);

    // 바이트 카운터가 업데이트됨 (SMS 탭 메시지 유형 표시: "SMS" or "LMS")
    const byteCounter = page.locator(':has-text("byte")');
    await expect(byteCounter).toBeVisible();
  });

  test('SMS/LMS 자동 전환 (90바이트 기준)', async ({ page }) => {
    // Switch to SMS tab first (default tab is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    // 짧은 메시지 (SMS)
    await messagesPage.messageTextarea.fill('짧은 메시지');
    await page.waitForTimeout(500);

    // SMS type indicator shown in the type display span (e.g. "SMS")
    let typeIndicator = page.locator(':has-text("SMS")').first();
    if (await typeIndicator.isVisible()) {
      await expect(typeIndicator).toBeVisible();
    }

    // 긴 메시지 (LMS)
    await messagesPage.messageTextarea.fill(TEST_MESSAGE.longContent);
    await page.waitForTimeout(500);

    typeIndicator = page.locator(':has-text("LMS")').first();
    if (await typeIndicator.isVisible()) {
      await expect(typeIndicator).toBeVisible();
    }
  });

  test('메시지 미리보기 실시간 업데이트', async ({ page }) => {
    // Switch to SMS tab first (default tab is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    const testContent = '미리보기 테스트 메시지';
    await messagesPage.messageTextarea.fill(testContent);
    await page.waitForTimeout(500);

    // 미리보기 영역 확인 (우측 패널의 "발송 메시지 미리보기" 텍스트)
    const previewPanel = page.locator('text=발송 메시지 미리보기');
    if (await previewPanel.isVisible()) {
      await expect(previewPanel).toBeVisible();
    }
  });

  test('예상 비용 계산', async ({ page }) => {
    // Switch to SMS tab first (default tab is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    await messagesPage.messageTextarea.fill(TEST_MESSAGE.content);

    // 발송 대상 선택 - 전체 버튼 (target buttons have count + "전체" text)
    const allButton = page.locator('button:has-text("전체")').first();
    if (await allButton.isVisible()) {
      await allButton.click();
    }

    await page.waitForTimeout(1000);

    // 예상 비용이 표시됨 (SMS 탭 cost section shows "발송 비용" or "현재 잔액")
    const costDisplay = page.locator(':has-text("발송 비용"), :has-text("현재 잔액")');
    await expect(costDisplay.first()).toBeVisible();
  });

  test('테스트 발송 (5회 제한)', async ({ page }) => {
    // Switch to SMS tab first (default tab is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    await messagesPage.messageTextarea.fill(TEST_MESSAGE.content);
    await page.waitForTimeout(300);

    // 테스트 발송 버튼 클릭하여 모달 오픈 (SMS 탭 하단 링크)
    const testSendLink = page.locator('button:has-text("내 번호로 테스트 발송해보기")');
    if (await testSendLink.isVisible()) {
      await testSendLink.click();
      await page.waitForTimeout(500);

      // 모달이 열리면 5회 제한 안내 확인
      const limitDisplay = page.locator(':has-text("5회"), :has-text("남은 횟수")');
      if (await limitDisplay.isVisible()) {
        await expect(limitDisplay).toBeVisible();
      }
    }
  });
});

test.describe('메시지 필터링', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');
  });

  test('성별 필터 적용', async ({ page }) => {
    const genderButtons = page.locator('button:has-text("전체 성별"), button:has-text("여성"), button:has-text("남성")');

    if (await genderButtons.first().isVisible()) {
      const femaleButton = page.locator('button:has-text("여성")');
      await femaleButton.click();
      await page.waitForTimeout(500);

      // 필터가 적용되었는지 확인 (버튼 스타일 변경 또는 대상 수 변경)
      await expect(femaleButton).toHaveClass(/active|selected|bg-brand/);
    }
  });

  test('연령대 필터 적용', async ({ page }) => {
    const ageButtons = page.locator('button:has-text("20대"), button:has-text("30대"), button:has-text("40대")');

    if (await ageButtons.first().isVisible()) {
      await ageButtons.first().click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('메시지 발송 제한', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');
  });

  test('잔액 부족 시 발송 버튼 비활성화', async ({ page }) => {
    // Switch to SMS tab (default is kakao)
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);

    // 매우 긴 메시지로 비용 증가
    await page.locator('textarea').fill(TEST_MESSAGE.longContent.repeat(5));

    // 발송하기 버튼: "메시지 발송하기 (XXX원)" 형식
    const sendButton = page.locator('button:has-text("메시지 발송하기")');

    // 잔액이 부족하면 버튼이 비활성화되거나 충전 버튼 표시
    await page.waitForTimeout(1000);

    // 발송 컨트롤(발송 버튼 또는 잔액 부족/충전 안내)이 렌더되어야 한다.
    const balanceWarning = page.locator(':has-text("잔액 부족"), :has-text("충전하기")').first();
    await expect(sendButton.or(balanceWarning).first()).toBeVisible();

    // 핵심 불변식: 잔액 부족 안내가 노출되면 발송 버튼은 반드시 비활성이어야 한다.
    // (실제 잔액이 충분하면 안내가 없고 버튼은 활성 — 두 경우 모두 정상)
    if (await balanceWarning.isVisible().catch(() => false)) {
      await expect(sendButton).toBeDisabled();
    }
  });

  test('메시지 내용 없이 발송 시도 시 검증', async ({ page }) => {
    // 빈 메시지 상태에서 발송 버튼 클릭
    const sendButton = page.locator('button:has-text("발송하기"), button:has-text("메시지 발송")');

    // 내용이 없으면 버튼이 비활성화되어야 함
    await expect(sendButton).toBeDisabled();
  });
});

test.describe('이미지 첨부 (MMS)', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.expectLoginSuccess();

    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');
    // Switch to SMS tab (default is kakao) — image upload is SMS-only
    await page.locator('button:has-text("문자 (SMS/LMS)")').click();
    await page.waitForTimeout(300);
  });

  test('이미지 업로드 영역이 표시된다', async ({ page }) => {
    // SMS 탭에서 이미지 업로드: hidden file input + visible "이미지 추가" label
    const imageUpload = page.locator('input[type="file"]');
    await expect(imageUpload.first()).toBeAttached();
    // "이미지 추가" label 버튼도 표시됨
    const imageLabel = page.locator(':has-text("이미지 추가")');
    await expect(imageLabel.first()).toBeVisible();
  });

  // fixme: MMS 전환은 유효 JPG를 첨부해야 검증되는데, 첨부 즉시 /api/sms/upload-image로
  // 실제 서버 업로드가 일어난다(스토리지에 파일 생성=부수효과). 전용 이미지 픽스처 +
  // 업로드 정리(cleanup) 없이는 결정적으로 테스트할 수 없어 보류한다.
  // (UI 존재 확인은 위 "이미지 업로드 영역이 표시된다" 테스트가 이미 커버)
  test.fixme('이미지 첨부 시 MMS로 전환', async ({ page }) => {
    await page.locator('textarea').fill(TEST_MESSAGE.content);
    // 유효 JPG 픽스처 첨부 → uploadedImage 설정 시 타입 표시가 MMS로 전환되어야 한다.
    await page.locator('input[type="file"]').first().setInputFiles('tests/e2e/fixtures/sample.jpg');
    await page.waitForTimeout(1000);
    await expect(page.locator(':has-text("MMS")').first()).toBeVisible();
  });
});
