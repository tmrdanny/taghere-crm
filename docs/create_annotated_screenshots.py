from playwright.sync_api import sync_playwright
import os

BASE_URL = 'http://localhost:3999'
OUTPUT_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/screenshots'

os.makedirs(OUTPUT_DIR, exist_ok=True)

def add_red_boxes(page, boxes):
    """Add red highlight boxes to the page"""
    for box in boxes:
        page.evaluate('''({selector, label, index}) => {
            const el = document.querySelector(selector);
            if (!el) return;
            const rect = el.getBoundingClientRect();

            // Create red box
            const box = document.createElement('div');
            box.style.cssText = `
                position: fixed;
                top: ${rect.top - 4}px;
                left: ${rect.left - 4}px;
                width: ${rect.width + 8}px;
                height: ${rect.height + 8}px;
                border: 3px solid #E53E3E;
                border-radius: 8px;
                pointer-events: none;
                z-index: 99999;
                box-sizing: border-box;
            `;
            document.body.appendChild(box);

            // Add label
            if (label) {
                const labelEl = document.createElement('div');
                labelEl.innerHTML = (index ? `<span style="background:#E53E3E;color:white;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;margin-right:4px;font-size:12px;">${index}</span>` : '') + label;
                labelEl.style.cssText = `
                    position: fixed;
                    top: ${rect.top - 32}px;
                    left: ${rect.left - 4}px;
                    background: #E53E3E;
                    color: white;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    z-index: 99999;
                    white-space: nowrap;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                `;
                document.body.appendChild(labelEl);
            }
        }''', box)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1440, 'height': 900},
        locale='ko-KR'
    )
    page = context.new_page()

    # Login first
    print("🔐 Logging in...")
    page.goto(f'{BASE_URL}/login')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)

    # 01. Login page with boxes
    print("📸 01-login...")
    add_red_boxes(page, [
        {'selector': 'input[type="email"]', 'label': '이메일 입력', 'index': '1'},
        {'selector': 'input[type="password"]', 'label': '비밀번호 입력', 'index': '2'},
        {'selector': 'button[type="submit"]', 'label': '로그인 버튼', 'index': '3'},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/01-login-annotated.png')

    # Actually login now
    page.goto(f'{BASE_URL}/login')
    page.wait_for_load_state('networkidle')
    page.fill('input[type="email"]', 'demo@taghere.com')
    page.fill('input[type="password"]', 'demo1234')
    page.click('button[type="submit"]')
    page.wait_for_url('**/home', timeout=30000)
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    print("✅ Logged in")

    # 02. Dashboard with KPI cards highlighted
    print("📸 02-dashboard...")
    page.goto(f'{BASE_URL}/home')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': '.grid.grid-cols-1 > div:nth-child(1)', 'label': '총 고객 수', 'index': '1'},
        {'selector': '.grid.grid-cols-1 > div:nth-child(2)', 'label': '신규 등록 고객', 'index': '2'},
        {'selector': '.grid.grid-cols-1 > div:nth-child(3)', 'label': '네이버 총 리뷰', 'index': '3'},
        {'selector': '.grid.grid-cols-1 > div:nth-child(4)', 'label': '알림톡 발송 가능액', 'index': '4'},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/02-dashboard-annotated.png')

    # 03. Dashboard - chart area
    print("📸 03-chart...")
    page.goto(f'{BASE_URL}/home')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': '.lg\\:col-span-2', 'label': '네이버 리뷰 일자별 추이 차트', 'index': ''},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/03-chart-annotated.png')

    # 04. Points page
    print("📸 04-points...")
    page.goto(f'{BASE_URL}/points')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': '[class*="text-4xl"], [class*="text-5xl"]', 'label': '전화번호 입력 영역', 'index': '1'},
        {'selector': '.grid.grid-cols-3', 'label': '숫자 키패드', 'index': '2'},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/04-points-annotated.png')

    # 05. Naver review settings
    print("📸 05-naver-review...")
    page.goto(f'{BASE_URL}/naver-review')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': 'button[role="switch"]', 'label': '자동 발송 토글', 'index': '1'},
        {'selector': 'textarea', 'label': '리뷰 혜택 내용 입력', 'index': '2'},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/05-naver-review-annotated.png')

    # 06. Naver review - phone preview
    print("📸 06-phone-preview...")
    page.goto(f'{BASE_URL}/naver-review')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': '[class*="rounded-[4"]', 'label': '알림톡 미리보기', 'index': ''},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/06-phone-preview-annotated.png')

    # 07. Customers list
    print("📸 07-customers...")
    page.goto(f'{BASE_URL}/customers')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    add_red_boxes(page, [
        {'selector': 'input[placeholder*="검색"], input[placeholder*="이름"]', 'label': '검색', 'index': '1'},
        {'selector': 'table', 'label': '고객 목록 테이블', 'index': '2'},
    ])
    page.screenshot(path=f'{OUTPUT_DIR}/07-customers-annotated.png')

    # 08. Settings page
    print("📸 08-settings...")
    page.goto(f'{BASE_URL}/settings')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/08-settings-annotated.png', full_page=True)

    # 09. Billing page
    print("📸 09-billing...")
    page.goto(f'{BASE_URL}/billing')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/09-billing-annotated.png')

    browser.close()
    print("\n🎉 All annotated screenshots captured!")
