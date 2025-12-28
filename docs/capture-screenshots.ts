import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://taghere-crm-web-g96p.onrender.com';
const DEMO_EMAIL = 'demo@taghere.com';
const DEMO_PASSWORD = 'demo1234';
const OUTPUT_DIR = path.join(__dirname, 'screenshots');

interface ScreenshotConfig {
  name: string;
  url: string;
  waitFor?: string;
  actions?: (page: Page) => Promise<void>;
  highlights?: { selector: string; label?: string }[];
  fullPage?: boolean;
}

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function addHighlightBoxes(page: Page, highlights: { selector: string; label?: string }[]) {
  for (const highlight of highlights) {
    try {
      await page.evaluate(({ selector, label }) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();

          // Create highlight box
          const box = document.createElement('div');
          box.style.cssText = `
            position: fixed;
            top: ${rect.top - 3}px;
            left: ${rect.left - 3}px;
            width: ${rect.width + 6}px;
            height: ${rect.height + 6}px;
            border: 3px solid #E53E3E;
            border-radius: 8px;
            pointer-events: none;
            z-index: 99999;
            box-sizing: border-box;
          `;
          document.body.appendChild(box);

          // Add label if provided
          if (label) {
            const labelEl = document.createElement('div');
            labelEl.textContent = label;
            labelEl.style.cssText = `
              position: fixed;
              top: ${rect.top - 28}px;
              left: ${rect.left - 3}px;
              background: #E53E3E;
              color: white;
              padding: 2px 8px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              z-index: 99999;
            `;
            document.body.appendChild(labelEl);
          }
        });
      }, highlight);
    } catch (e) {
      console.log(`Could not highlight: ${highlight.selector}`);
    }
  }
}

async function captureScreenshot(
  page: Page,
  config: ScreenshotConfig
): Promise<void> {
  console.log(`📸 Capturing: ${config.name}`);

  await page.goto(`${BASE_URL}${config.url}`, { waitUntil: 'networkidle' });

  if (config.waitFor) {
    await page.waitForSelector(config.waitFor, { timeout: 10000 }).catch(() => {});
  }

  await page.waitForTimeout(1500); // Extra wait for animations

  if (config.actions) {
    await config.actions(page);
  }

  if (config.highlights) {
    await addHighlightBoxes(page, config.highlights);
  }

  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${config.name}.png`),
    fullPage: config.fullPage ?? false,
  });

  console.log(`✅ Saved: ${config.name}.png`);
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', DEMO_EMAIL);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/home', { timeout: 15000 });
  console.log('✅ Logged in successfully');
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  const screenshots: ScreenshotConfig[] = [
    // 1. 로그인 페이지
    {
      name: '01-login',
      url: '/login',
      highlights: [
        { selector: 'input[type="email"]', label: '① 이메일' },
        { selector: 'input[type="password"]', label: '② 비밀번호' },
        { selector: 'button[type="submit"]', label: '③ 로그인' },
      ],
    },
  ];

  // Capture login page first (before logging in)
  await captureScreenshot(page, screenshots[0]);

  // Now login
  await login(page);

  // Logged-in screenshots
  const loggedInScreenshots: ScreenshotConfig[] = [
    // 2. 홈 대시보드 전체
    {
      name: '02-dashboard-full',
      url: '/home',
      fullPage: false,
      highlights: [
        { selector: '.grid > div:first-child', label: '① 총 고객 수' },
        { selector: '.grid > div:nth-child(2)', label: '② 신규 고객' },
        { selector: '.grid > div:nth-child(3)', label: '③ 네이버 리뷰' },
        { selector: '.grid > div:nth-child(4)', label: '④ 충전금' },
      ],
    },
    // 3. 리뷰 차트 영역
    {
      name: '03-review-chart',
      url: '/home',
      highlights: [
        { selector: '[class*="recharts"]', label: '리뷰 추이 차트' },
      ],
    },
    // 4. 포인트 적립 페이지
    {
      name: '04-points-page',
      url: '/points',
      fullPage: false,
      highlights: [
        { selector: '[class*="aspect-square"]', label: '숫자 키패드' },
      ],
    },
    // 5. 네이버 리뷰 설정 페이지
    {
      name: '05-naver-review-settings',
      url: '/naver-review',
      fullPage: false,
      highlights: [
        { selector: 'textarea', label: '① 혜택 내용 입력' },
        { selector: 'input[placeholder*="naver"]', label: '② 네이버 URL' },
      ],
    },
    // 6. 휴대폰 미리보기
    {
      name: '06-phone-preview',
      url: '/naver-review',
      highlights: [
        { selector: '[class*="rounded-[40px]"], [class*="rounded-3xl"]', label: '알림톡 미리보기' },
      ],
    },
    // 7. 고객 리스트
    {
      name: '07-customers-list',
      url: '/customers',
      fullPage: false,
      highlights: [
        { selector: 'input[placeholder*="검색"]', label: '① 검색' },
        { selector: 'table', label: '② 고객 테이블' },
      ],
    },
    // 8. 설정 페이지
    {
      name: '08-settings-page',
      url: '/settings',
      fullPage: true,
      highlights: [
        { selector: 'form', label: '매장 정보' },
      ],
    },
    // 9. 충전 페이지
    {
      name: '09-billing-page',
      url: '/billing',
      fullPage: false,
      highlights: [
        { selector: 'button:has-text("충전")', label: '충전 버튼' },
      ],
    },
  ];

  for (const config of loggedInScreenshots) {
    try {
      await captureScreenshot(page, config);
    } catch (e) {
      console.error(`❌ Failed: ${config.name}`, e);
    }
  }

  await browser.close();
  console.log('\n🎉 All screenshots captured!');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);
