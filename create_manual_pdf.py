from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
import os

# Paths
SCREENSHOT_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/manual-screenshots'
ANNOTATED_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/manual-screenshots/annotated'
OUTPUT_PDF = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/TagHere_CRM_Manual.pdf'

# Register Pretendard fonts
pdfmetrics.registerFont(TTFont('Pretendard', '/Users/zeroclasslab_1/Library/Fonts/Pretendard-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Pretendard-Bold', '/Users/zeroclasslab_1/Library/Fonts/Pretendard-Black.ttf'))
pdfmetrics.registerFont(TTFont('Pretendard-Medium', '/Users/zeroclasslab_1/Library/Fonts/Pretendard-Medium.ttf'))

# Create annotated directory
os.makedirs(ANNOTATED_DIR, exist_ok=True)

# Colors for annotations
BOX_COLOR = (0, 122, 255)  # Blue
TEXT_COLOR = (255, 255, 255)  # White for labels
BOX_BG_COLOR = (0, 122, 255, 200)  # Semi-transparent blue

def add_annotations(image_path, annotations, output_path):
    """
    Add box annotations to an image.
    annotations: list of (x, y, width, height, label) tuples
    """
    img = Image.open(image_path)
    draw = ImageDraw.Draw(img, 'RGBA')

    try:
        font = ImageFont.truetype('/Users/zeroclasslab_1/Library/Fonts/Pretendard-Medium.ttf', 14)
        label_font = ImageFont.truetype('/Users/zeroclasslab_1/Library/Fonts/Pretendard-Bold.ttf', 12)
    except:
        font = ImageFont.load_default()
        label_font = font

    for idx, (x, y, w, h, label) in enumerate(annotations, 1):
        # Draw rectangle border
        draw.rectangle([x, y, x + w, y + h], outline=BOX_COLOR, width=3)

        # Draw number circle
        circle_x = x - 10
        circle_y = y - 10
        circle_radius = 12
        draw.ellipse([circle_x - circle_radius, circle_y - circle_radius,
                      circle_x + circle_radius, circle_y + circle_radius],
                     fill=BOX_COLOR)

        # Draw number
        num_text = str(idx)
        bbox = draw.textbbox((0, 0), num_text, font=label_font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        draw.text((circle_x - text_w // 2, circle_y - text_h // 2 - 2),
                  num_text, fill=TEXT_COLOR, font=label_font)

    img.save(output_path)
    return annotations

# Define annotations for each screenshot
# Format: (x, y, width, height, label)
ANNOTATIONS = {
    '01_login.png': [
        (430, 280, 540, 45, '이메일 입력'),
        (430, 340, 540, 45, '비밀번호 입력'),
        (430, 400, 540, 50, '로그인 버튼'),
    ],
    '02_home.png': [
        (20, 70, 200, 40, '사이드바 메뉴'),
        (250, 120, 350, 180, '일일 방문자 통계'),
        (620, 120, 350, 180, '최근 알림톡 발송'),
        (250, 320, 720, 200, '월별 방문자 차트'),
    ],
    '03_customers.png': [
        (230, 100, 200, 40, '고객 검색'),
        (1100, 100, 100, 40, '고객 등록 버튼'),
        (230, 180, 970, 400, '고객 목록 테이블'),
    ],
    '04_customer_modal.png': [
        (350, 150, 700, 40, '고객 기본 정보'),
        (350, 210, 700, 120, '주문 내역 탭'),
        (900, 270, 120, 40, '포인트 사용 버튼'),
        (1030, 270, 120, 40, '포인트 적립 버튼'),
    ],
    '05_customer_feedback_tab.png': [
        (350, 155, 150, 40, '주문 내역 탭'),
        (510, 155, 80, 40, '피드백 탭'),
        (350, 210, 700, 250, '피드백 내역'),
    ],
    '06_customer_point_tab.png': [
        (350, 155, 150, 40, '주문 내역 탭'),
        (600, 155, 80, 40, '포인트 탭'),
        (350, 210, 700, 250, '포인트 적립/사용 내역'),
    ],
    '07_points.png': [
        (230, 100, 200, 40, '기간 검색'),
        (230, 180, 970, 400, '포인트 내역 테이블'),
    ],
    '08_messages.png': [
        (230, 100, 200, 40, '기간 검색'),
        (1100, 100, 100, 40, '메시지 작성 버튼'),
        (230, 180, 970, 350, '발송 내역 목록'),
    ],
    '09_settings.png': [
        (230, 120, 500, 100, '매장 기본 정보'),
        (230, 240, 500, 80, '포인트 적립률 설정'),
        (230, 340, 500, 100, '알림톡 설정'),
    ],
    '10_taghere_enroll.png': [
        (45, 150, 300, 80, '적립 포인트 안내'),
        (95, 300, 200, 200, '포인트 코인 이미지'),
        (45, 630, 300, 55, '포인트 적립하기 버튼'),
    ],
    '10b_taghere_success.png': [
        (45, 200, 300, 50, '적립 완료 메시지'),
        (45, 280, 300, 80, '적립된 포인트'),
        (45, 400, 300, 100, '안내 메시지'),
    ],
    '11_billing.png': [
        (230, 120, 500, 80, '현재 플랜 정보'),
        (230, 220, 500, 200, '이용권 플랜 목록'),
    ],
}

# Process each screenshot
print("Adding annotations to screenshots...")
for filename, annotations in ANNOTATIONS.items():
    input_path = os.path.join(SCREENSHOT_DIR, filename)
    output_path = os.path.join(ANNOTATED_DIR, filename)
    if os.path.exists(input_path):
        add_annotations(input_path, annotations, output_path)
        print(f"  Annotated: {filename}")
    else:
        print(f"  Skipped (not found): {filename}")

# Create PDF
print("\nCreating PDF manual...")

doc = SimpleDocTemplate(
    OUTPUT_PDF,
    pagesize=A4,
    rightMargin=20*mm,
    leftMargin=20*mm,
    topMargin=20*mm,
    bottomMargin=20*mm
)

# Define styles
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name='TitleKR',
    fontName='Pretendard-Bold',
    fontSize=28,
    leading=36,
    alignment=1,  # Center
    spaceAfter=20*mm
))
styles.add(ParagraphStyle(
    name='HeadingKR',
    fontName='Pretendard-Bold',
    fontSize=18,
    leading=24,
    spaceBefore=10*mm,
    spaceAfter=5*mm,
    textColor=HexColor('#1a1a1a')
))
styles.add(ParagraphStyle(
    name='SubHeadingKR',
    fontName='Pretendard-Medium',
    fontSize=14,
    leading=20,
    spaceBefore=5*mm,
    spaceAfter=3*mm,
    textColor=HexColor('#333333')
))
styles.add(ParagraphStyle(
    name='BodyKR',
    fontName='Pretendard',
    fontSize=11,
    leading=18,
    spaceAfter=3*mm,
    textColor=HexColor('#444444')
))
styles.add(ParagraphStyle(
    name='ListItemKR',
    fontName='Pretendard',
    fontSize=11,
    leading=16,
    leftIndent=10*mm,
    spaceAfter=2*mm,
    textColor=HexColor('#444444')
))
styles.add(ParagraphStyle(
    name='ContactKR',
    fontName='Pretendard-Bold',
    fontSize=14,
    leading=20,
    alignment=1,
    spaceBefore=10*mm,
    textColor=HexColor('#0066cc')
))

# Build content
content = []

# Title Page
content.append(Spacer(1, 50*mm))
content.append(Paragraph("TagHere CRM", styles['TitleKR']))
content.append(Paragraph("사용자 매뉴얼", styles['TitleKR']))
content.append(Spacer(1, 30*mm))
content.append(Paragraph("버전 1.0", styles['BodyKR']))
content.append(PageBreak())

# Table of Contents
content.append(Paragraph("목차", styles['HeadingKR']))
toc_items = [
    "1. 시작하기 - 로그인",
    "2. 홈 화면 (대시보드)",
    "3. 고객 관리",
    "4. 포인트 관리",
    "5. 메시지 발송",
    "6. 설정",
    "7. 고객의 포인트 적립 과정",
    "8. 요금제 및 결제",
    "9. 문의 및 지원",
]
for item in toc_items:
    content.append(Paragraph(item, styles['BodyKR']))
content.append(PageBreak())

# Section 1: Login
content.append(Paragraph("1. 시작하기 - 로그인", styles['HeadingKR']))
content.append(Paragraph("TagHere CRM에 접속하여 로그인합니다.", styles['BodyKR']))

login_img = os.path.join(ANNOTATED_DIR, '01_login.png')
if os.path.exists(login_img):
    content.append(RLImage(login_img, width=150*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 이메일 주소를 입력합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 비밀번호를 입력합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 로그인 버튼을 클릭합니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 2: Home Dashboard
content.append(Paragraph("2. 홈 화면 (대시보드)", styles['HeadingKR']))
content.append(Paragraph("로그인 후 표시되는 메인 화면입니다. 매장의 주요 지표를 한눈에 확인할 수 있습니다.", styles['BodyKR']))

home_img = os.path.join(ANNOTATED_DIR, '02_home.png')
if os.path.exists(home_img):
    content.append(RLImage(home_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 사이드바 메뉴 - 각 기능 페이지로 이동합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 일일 방문자 통계 - 오늘의 방문자 수를 표시합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 최근 알림톡 발송 - 최근 발송한 알림톡 현황입니다.", styles['ListItemKR']))
content.append(Paragraph("4. 월별 방문자 차트 - 월간 방문자 추이를 그래프로 보여줍니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 3: Customer Management
content.append(Paragraph("3. 고객 관리", styles['HeadingKR']))
content.append(Paragraph("3.1 고객 목록", styles['SubHeadingKR']))
content.append(Paragraph("등록된 모든 고객을 조회하고 관리할 수 있습니다.", styles['BodyKR']))

customers_img = os.path.join(ANNOTATED_DIR, '03_customers.png')
if os.path.exists(customers_img):
    content.append(RLImage(customers_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 검색 - 고객명 또는 전화번호로 검색합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 고객 등록 - 신규 고객을 수동으로 등록합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 고객 목록 - 등록된 고객 정보가 표시됩니다. 클릭하면 상세 정보를 볼 수 있습니다.", styles['ListItemKR']))
content.append(PageBreak())

content.append(Paragraph("3.2 고객 상세 정보", styles['SubHeadingKR']))
content.append(Paragraph("고객을 클릭하면 상세 정보 팝업이 표시됩니다.", styles['BodyKR']))

modal_img = os.path.join(ANNOTATED_DIR, '04_customer_modal.png')
if os.path.exists(modal_img):
    content.append(RLImage(modal_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 고객 기본 정보 - 이름, 연락처, 총 방문 횟수 등", styles['ListItemKR']))
content.append(Paragraph("2. 주문 내역 - 고객의 주문 이력을 확인합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 포인트 사용 - 고객의 포인트를 차감합니다.", styles['ListItemKR']))
content.append(Paragraph("4. 포인트 적립 - 고객에게 포인트를 적립합니다.", styles['ListItemKR']))
content.append(PageBreak())

content.append(Paragraph("3.3 피드백 탭", styles['SubHeadingKR']))
content.append(Paragraph("고객이 남긴 평점과 피드백을 확인할 수 있습니다.", styles['BodyKR']))

feedback_img = os.path.join(ANNOTATED_DIR, '05_customer_feedback_tab.png')
if os.path.exists(feedback_img):
    content.append(RLImage(feedback_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 주문 내역 탭 - 주문 이력 확인", styles['ListItemKR']))
content.append(Paragraph("2. 피드백 탭 - 고객 피드백 확인", styles['ListItemKR']))
content.append(Paragraph("3. 피드백 내역 - 별점과 의견이 표시됩니다.", styles['ListItemKR']))
content.append(PageBreak())

content.append(Paragraph("3.4 포인트 내역 탭", styles['SubHeadingKR']))
content.append(Paragraph("고객의 포인트 적립 및 사용 내역을 확인합니다.", styles['BodyKR']))

point_tab_img = os.path.join(ANNOTATED_DIR, '06_customer_point_tab.png')
if os.path.exists(point_tab_img):
    content.append(RLImage(point_tab_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 주문 내역 탭", styles['ListItemKR']))
content.append(Paragraph("2. 포인트 탭 - 포인트 이력 확인", styles['ListItemKR']))
content.append(Paragraph("3. 포인트 내역 - 적립/사용 날짜와 금액이 표시됩니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 4: Points
content.append(Paragraph("4. 포인트 관리", styles['HeadingKR']))
content.append(Paragraph("전체 포인트 적립 및 사용 내역을 조회합니다.", styles['BodyKR']))

points_img = os.path.join(ANNOTATED_DIR, '07_points.png')
if os.path.exists(points_img):
    content.append(RLImage(points_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 기간 검색 - 특정 기간의 내역을 조회합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 포인트 내역 - 전체 고객의 포인트 이력이 표시됩니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 5: Messages
content.append(Paragraph("5. 메시지 발송", styles['HeadingKR']))
content.append(Paragraph("알림톡을 통해 고객에게 메시지를 발송합니다.", styles['BodyKR']))

messages_img = os.path.join(ANNOTATED_DIR, '08_messages.png')
if os.path.exists(messages_img):
    content.append(RLImage(messages_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 기간 검색 - 발송 기간별로 내역을 조회합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 메시지 작성 - 새로운 알림톡을 작성하여 발송합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 발송 내역 - 발송된 메시지 목록과 상태를 확인합니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 6: Settings
content.append(Paragraph("6. 설정", styles['HeadingKR']))
content.append(Paragraph("매장 정보 및 서비스 설정을 관리합니다.", styles['BodyKR']))

settings_img = os.path.join(ANNOTATED_DIR, '09_settings.png')
if os.path.exists(settings_img):
    content.append(RLImage(settings_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 매장 기본 정보 - 매장명, 연락처 등을 설정합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 포인트 적립률 - 결제 금액 대비 적립률을 설정합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 알림톡 설정 - 자동 발송 알림톡을 설정합니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 7: Customer Point Earning Flow
content.append(Paragraph("7. 고객의 포인트 적립 과정", styles['HeadingKR']))
content.append(Paragraph("고객이 매장에서 주문 후 포인트를 적립하는 과정입니다.", styles['BodyKR']))

content.append(Paragraph("7.1 포인트 적립 화면", styles['SubHeadingKR']))
content.append(Paragraph("고객이 주문 완료 후 QR 코드를 스캔하면 아래 화면이 표시됩니다.", styles['BodyKR']))

enroll_img = os.path.join(ANNOTATED_DIR, '10_taghere_enroll.png')
if os.path.exists(enroll_img):
    content.append(RLImage(enroll_img, width=80*mm, height=140*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 적립 포인트 안내 - 주문 금액에 따라 적립될 포인트가 표시됩니다.", styles['ListItemKR']))
content.append(Paragraph("2. 포인트 코인 이미지 - 탭하면 카카오 로그인으로 이동합니다.", styles['ListItemKR']))
content.append(Paragraph("3. 포인트 적립하기 버튼 - 카카오 로그인 후 포인트가 적립됩니다.", styles['ListItemKR']))
content.append(PageBreak())

content.append(Paragraph("7.2 적립 완료 화면", styles['SubHeadingKR']))
content.append(Paragraph("카카오 로그인 후 포인트가 적립되면 완료 화면이 표시됩니다.", styles['BodyKR']))

success_img = os.path.join(ANNOTATED_DIR, '10b_taghere_success.png')
if os.path.exists(success_img):
    content.append(RLImage(success_img, width=80*mm, height=140*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 적립 완료 메시지 - 포인트 적립이 완료되었음을 안내합니다.", styles['ListItemKR']))
content.append(Paragraph("2. 적립된 포인트 - 실제로 적립된 포인트가 표시됩니다.", styles['ListItemKR']))
content.append(Paragraph("3. 안내 메시지 - 알림톡 확인 및 다음 방문 시 사용 안내입니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 8: Billing
content.append(Paragraph("8. 요금제 및 결제", styles['HeadingKR']))
content.append(Paragraph("서비스 이용권을 확인하고 결제합니다.", styles['BodyKR']))

billing_img = os.path.join(ANNOTATED_DIR, '11_billing.png')
if os.path.exists(billing_img):
    content.append(RLImage(billing_img, width=160*mm, height=100*mm))

content.append(Spacer(1, 5*mm))
content.append(Paragraph("1. 현재 플랜 - 현재 사용 중인 요금제 정보입니다.", styles['ListItemKR']))
content.append(Paragraph("2. 이용권 플랜 - 선택 가능한 요금제 목록입니다.", styles['ListItemKR']))
content.append(PageBreak())

# Section 9: Contact
content.append(Paragraph("9. 문의 및 지원", styles['HeadingKR']))
content.append(Spacer(1, 10*mm))
content.append(Paragraph("서비스 이용 중 문의사항이 있으시면 아래로 연락해 주세요.", styles['BodyKR']))
content.append(Spacer(1, 10*mm))
content.append(Paragraph("고객센터: 070-4138-0263", styles['ContactKR']))

# Build PDF
doc.build(content)
print(f"\nPDF manual created: {OUTPUT_PDF}")
