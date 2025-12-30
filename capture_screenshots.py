from playwright.sync_api import sync_playwright
import time

SCREENSHOT_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/manual-screenshots'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Desktop context for admin pages
    desktop_context = browser.new_context(viewport={'width': 1400, 'height': 900})
    desktop_page = desktop_context.new_page()

    # Mobile context for customer pages
    mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    mobile_page = mobile_context.new_page()

    # 1. Login page
    print("Capturing login page...")
    desktop_page.goto('http://localhost:3999/login')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(1)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/01_login.png', full_page=True)

    # 2. Login with demo credentials
    print("Logging in...")
    desktop_page.fill('input[type="email"]', 'demo@taghere.com')
    desktop_page.fill('input[type="password"]', 'demo1234')
    desktop_page.click('button[type="submit"]')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(3)

    # 3. Home page (dashboard)
    print("Capturing home page...")
    desktop_page.goto('http://localhost:3999/home')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(2)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/02_home.png', full_page=True)

    # 4. Customers page
    print("Capturing customers page...")
    desktop_page.goto('http://localhost:3999/customers')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(2)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/03_customers.png', full_page=True)

    # 5. Click on a customer to show modal
    print("Capturing customer modal...")
    customer_rows = desktop_page.locator('table tbody tr')
    if customer_rows.count() > 0:
        customer_rows.first.click()
        time.sleep(1.5)
        desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/04_customer_modal.png', full_page=True)

        # Scope selectors within the modal dialog
        modal = desktop_page.locator('[role="dialog"]')

        # Click on different tabs within the modal
        feedback_tab = modal.locator('button:has-text("피드백")')
        if feedback_tab.count() > 0:
            feedback_tab.click()
            time.sleep(0.5)
            desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/05_customer_feedback_tab.png', full_page=True)

        # Point history tab - look for button containing span with exact text "포인트"
        # The tab structure is: button > History icon + span "포인트"
        history_tab = modal.locator('button:has(span:text-is("포인트"))')
        if history_tab.count() > 0:
            history_tab.first.click()
            time.sleep(0.5)
            desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/06_customer_point_tab.png', full_page=True)

        # Close modal by clicking outside or pressing escape
        desktop_page.keyboard.press('Escape')
        time.sleep(0.5)

    # 6. Points page
    print("Capturing points page...")
    desktop_page.goto('http://localhost:3999/points')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(1)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/07_points.png', full_page=True)

    # 7. Messages page
    print("Capturing messages page...")
    desktop_page.goto('http://localhost:3999/messages')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(1)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/08_messages.png', full_page=True)

    # 8. Settings page
    print("Capturing settings page...")
    desktop_page.goto('http://localhost:3999/settings')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(1)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/09_settings.png', full_page=True)

    # 9. TagHere enroll page (mobile) - customer facing
    print("Capturing taghere-enroll page (mobile)...")
    mobile_page.goto('http://localhost:3999/taghere-enroll/demo?ordersheetId=test123')
    mobile_page.wait_for_load_state('networkidle')
    time.sleep(2)
    mobile_page.screenshot(path=f'{SCREENSHOT_DIR}/10_taghere_enroll.png', full_page=True)

    # 10. Capture the success page (after Kakao login would redirect here)
    print("Capturing taghere-enroll success page...")
    mobile_page.goto('http://localhost:3999/taghere-enroll/success?points=500&storeName=Demo%20Store&resultPrice=25000')
    mobile_page.wait_for_load_state('networkidle')
    time.sleep(1)
    mobile_page.screenshot(path=f'{SCREENSHOT_DIR}/10b_taghere_success.png', full_page=True)

    # 10. Billing page
    print("Capturing billing page...")
    desktop_page.goto('http://localhost:3999/billing')
    desktop_page.wait_for_load_state('networkidle')
    time.sleep(1)
    desktop_page.screenshot(path=f'{SCREENSHOT_DIR}/11_billing.png', full_page=True)

    print("All screenshots captured!")

    desktop_context.close()
    mobile_context.close()
    browser.close()
