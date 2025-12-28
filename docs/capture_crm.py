from playwright.sync_api import sync_playwright
import os

BASE_URL = 'http://localhost:3999'
OUTPUT_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/screenshots'

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1440, 'height': 900},
        locale='ko-KR'
    )
    page = context.new_page()

    # 1. Login page screenshot
    print("📸 Capturing login page...")
    page.goto(f'{BASE_URL}/login')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/01-login.png')
    print("✅ 01-login.png saved")

    # 2. Login
    print("🔐 Logging in...")
    page.fill('input[type="email"]', 'demo@taghere.com')
    page.fill('input[type="password"]', 'demo1234')
    page.click('button[type="submit"]')

    # Wait for login to complete
    try:
        page.wait_for_url('**/home', timeout=30000)
        print("✅ Logged in successfully")
    except:
        print("⚠️ Login redirect timeout, checking current state...")
        page.screenshot(path=f'{OUTPUT_DIR}/debug-after-login.png')
        print(f"Current URL: {page.url}")

    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)

    # 3. Home dashboard
    print("📸 Capturing home dashboard...")
    page.goto(f'{BASE_URL}/home')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    page.screenshot(path=f'{OUTPUT_DIR}/02-dashboard.png')
    print("✅ 02-dashboard.png saved")

    # 4. Points page
    print("📸 Capturing points page...")
    page.goto(f'{BASE_URL}/points')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/03-points.png')
    print("✅ 03-points.png saved")

    # 5. Naver review settings
    print("📸 Capturing naver-review page...")
    page.goto(f'{BASE_URL}/naver-review')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/04-naver-review.png')
    print("✅ 04-naver-review.png saved")

    # 6. Customers list
    print("📸 Capturing customers page...")
    page.goto(f'{BASE_URL}/customers')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/05-customers.png')
    print("✅ 05-customers.png saved")

    # 7. Settings page
    print("📸 Capturing settings page...")
    page.goto(f'{BASE_URL}/settings')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/06-settings.png', full_page=True)
    print("✅ 06-settings.png saved")

    # 8. Billing page
    print("📸 Capturing billing page...")
    page.goto(f'{BASE_URL}/billing')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTPUT_DIR}/07-billing.png')
    print("✅ 07-billing.png saved")

    browser.close()
    print("\n🎉 All screenshots captured!")
    print(f"📁 Output: {OUTPUT_DIR}")
