import { test, expect, Page } from '@playwright/test';

/**
 * Admin 백오피스 스모크 E2E
 *
 * 목적: admin.ts 대분해(4,623줄 → 305줄 + 11개 도메인 서브라우터) 리팩토링 이후
 *       admin 로그인 / 인증 게이팅 / 각 admin 페이지 렌더가 회귀 없이 동작하는지 검증.
 *       기존 E2E 스위트는 admin 영역을 전혀 커버하지 않으므로 영구 회귀망으로 추가한다.
 *
 * 자격증명: 실제 운영 admin 비밀번호를 리포지토리에 커밋하지 않기 위해
 *           ADMIN_USERNAME / ADMIN_PASSWORD 환경변수로 주입한다. 미설정 시 전체 skip.
 *           예) ADMIN_USERNAME=taghere ADMIN_PASSWORD='***' npx playwright test tests/e2e/admin
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 각 admin 페이지의 안정적인 헤딩(데이터 비의존). 빈 데이터여도 렌더되는 셸 요소.
const ADMIN_PAGES: { route: string; heading: string | RegExp }[] = [
  { route: '/admin', heading: 'Key Metrics' },
  { route: '/admin/customers', heading: '고객 데이터 추출' },
  { route: '/admin/payments', heading: '결제내역' },
  { route: '/admin/store-list', heading: '매장 목록' },
  { route: '/admin/stores', heading: '매장 목록' },
  { route: '/admin/franchises', heading: '프랜차이즈 관리' },
  { route: '/admin/announcements', heading: '공지사항 관리' },
  { route: '/admin/banners', heading: '주문완료 배너' },
  { route: '/admin/store-products', heading: '스토어 상품 관리' },
  { route: '/admin/table-link', heading: '테이블 링크' },
  { route: '/admin/corporate-ad', heading: '성과 분석' },
  { route: '/admin/automation', heading: '자동 마케팅 현황' },
];

async function fetchAdminToken(page: Page): Promise<string> {
  const res = await page.request.post(`${API_BASE}/api/admin/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `admin 로그인 API가 ${res.status()} 반환`).toBeTruthy();
  const body = await res.json();
  expect(body.token, 'admin 로그인 응답에 token 없음').toBeTruthy();
  return body.token as string;
}

test.describe('Admin 백오피스', () => {
  test.skip(
    !ADMIN_USERNAME || !ADMIN_PASSWORD,
    'ADMIN_USERNAME/ADMIN_PASSWORD 환경변수 미설정 — admin 스모크 스킵',
  );

  test('인증 없이 admin 페이지 접근 시 로그인으로 리다이렉트', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/customers');
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });
  });

  test('UI 로그인 성공 후 대시보드 로드', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="text"]').first().fill(ADMIN_USERNAME!);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin(\/)?$/, { timeout: 15000 });
    await expect(page.getByText('Key Metrics')).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('adminToken'));
    expect(token).toBeTruthy();
  });

  test.describe('각 admin 페이지 렌더 스모크', () => {
    // 토큰을 API로 받아 localStorage에 주입 → 페이지별 렌더만 검증(로그인 UI 의존 최소화)
    test.beforeEach(async ({ page }) => {
      const token = await fetchAdminToken(page);
      await page.addInitScript((t) => {
        window.localStorage.setItem('adminToken', t as string);
      }, token);
    });

    for (const { route, heading } of ADMIN_PAGES) {
      test(`${route} 렌더 (미처리 예외 없음)`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.goto(route);

        // 인증 게이팅에 의해 로그인으로 튕기지 않아야 함
        await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 15000 });
        // 데이터 비의존 셸 헤딩이 렌더되어야 함
        await expect(page.getByText(heading).first()).toBeVisible({ timeout: 15000 });

        expect(pageErrors, `미처리 JS 예외 발생: ${pageErrors.join(' || ')}`).toEqual([]);
      });
    }
  });
});
