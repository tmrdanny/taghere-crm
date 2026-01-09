import { Page, Locator, expect } from '@playwright/test';

/**
 * Messages Page Object Model
 * Encapsulates SMS/LMS campaign page interactions
 */
export class MessagesPage {
  readonly page: Page;
  readonly targetAllButton: Locator;
  readonly targetRevisitButton: Locator;
  readonly targetNewButton: Locator;
  readonly targetCustomButton: Locator;
  readonly genderFilter: Locator;
  readonly ageFilter: Locator;
  readonly messageTextarea: Locator;
  readonly byteCounter: Locator;
  readonly messageTypeIndicator: Locator;
  readonly imageUploadButton: Locator;
  readonly imageDeleteButton: Locator;
  readonly estimatedCost: Locator;
  readonly targetCount: Locator;
  readonly walletBalance: Locator;
  readonly testPhoneInput: Locator;
  readonly testSendButton: Locator;
  readonly sendButton: Locator;
  readonly confirmModal: Locator;
  readonly modalConfirmButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly iphonePreview: Locator;

  constructor(page: Page) {
    this.page = page;
    this.targetAllButton = page.locator('button:has-text("전체"), [data-target="all"]');
    this.targetRevisitButton = page.locator('button:has-text("재방문"), [data-target="revisit"]');
    this.targetNewButton = page.locator('button:has-text("신규"), [data-target="new"]');
    this.targetCustomButton = page.locator('button:has-text("직접 선택"), [data-target="custom"]');
    this.genderFilter = page.locator('[data-testid="gender-filter"], select:has-text("성별")');
    this.ageFilter = page.locator('[data-testid="age-filter"], select:has-text("연령")');
    this.messageTextarea = page.locator('textarea[name="content"], textarea[placeholder*="메시지"]');
    this.byteCounter = page.locator(':has-text("byte"), [class*="byte"]');
    this.messageTypeIndicator = page.locator(':has-text("SMS"), :has-text("LMS"), :has-text("MMS")');
    this.imageUploadButton = page.locator('input[type="file"], button:has-text("이미지")');
    this.imageDeleteButton = page.locator('button:has-text("삭제"), [aria-label="delete image"]');
    this.estimatedCost = page.locator(':has-text("예상 비용"), [data-testid="estimated-cost"]');
    this.targetCount = page.locator(':has-text("발송 대상"), [data-testid="target-count"]');
    this.walletBalance = page.locator(':has-text("잔액"), [data-testid="wallet-balance"]');
    this.testPhoneInput = page.locator('input[placeholder*="테스트"], input[name="testPhone"]');
    this.testSendButton = page.locator('button:has-text("테스트 발송")');
    this.sendButton = page.locator('button:has-text("발송하기"), button:has-text("메시지 발송")');
    this.confirmModal = page.locator('[role="dialog"], [class*="modal"]');
    this.modalConfirmButton = this.confirmModal.locator('button:has-text("발송"), button:has-text("확인")');
    this.successMessage = page.locator('[class*="success"], [class*="toast"]:has-text("완료")');
    this.errorMessage = page.locator('[class*="error"], [class*="alert"]');
    this.iphonePreview = page.locator('[class*="iphone"], [class*="preview"]');
  }

  async goto() {
    await this.page.goto('/messages');
    await this.page.waitForLoadState('networkidle');
  }

  async selectTarget(target: 'all' | 'revisit' | 'new' | 'custom') {
    switch (target) {
      case 'all':
        await this.targetAllButton.click();
        break;
      case 'revisit':
        await this.targetRevisitButton.click();
        break;
      case 'new':
        await this.targetNewButton.click();
        break;
      case 'custom':
        await this.targetCustomButton.click();
        break;
    }
  }

  async setGenderFilter(gender: 'all' | 'FEMALE' | 'MALE') {
    await this.genderFilter.click();
    await this.page.locator(`[role="option"]:has-text("${gender === 'all' ? '전체' : gender === 'FEMALE' ? '여성' : '남성'}")`).click();
  }

  async writeMessage(content: string) {
    await this.messageTextarea.fill(content);
  }

  async uploadImage(filePath: string) {
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }

  async getByteLength(): Promise<number> {
    const text = await this.byteCounter.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async getMessageType(): Promise<string> {
    const sms = this.page.locator(':has-text("SMS")').first();
    const lms = this.page.locator(':has-text("LMS")').first();
    const mms = this.page.locator(':has-text("MMS")').first();

    if (await mms.isVisible()) return 'MMS';
    if (await lms.isVisible()) return 'LMS';
    return 'SMS';
  }

  async getEstimatedCost(): Promise<number> {
    const text = await this.estimatedCost.textContent();
    const match = text?.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  async enterTestPhone(phone: string) {
    await this.testPhoneInput.fill(phone);
  }

  async clickTestSend() {
    await this.testSendButton.click();
  }

  async clickSend() {
    await this.sendButton.click();
    // If confirmation modal appears, confirm it
    if (await this.confirmModal.isVisible()) {
      await this.modalConfirmButton.click();
    }
  }

  async expectSendSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectSendError() {
    await expect(this.errorMessage).toBeVisible();
  }

  async expectMessagePreview(content: string) {
    const previewContent = this.iphonePreview.locator(`text=${content.substring(0, 20)}`);
    await expect(previewContent).toBeVisible();
  }
}
