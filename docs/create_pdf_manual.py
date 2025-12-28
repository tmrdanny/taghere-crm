from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import os

# Register Korean font
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
FONT_NAME = 'HeiseiKakuGo-W5'

OUTPUT_DIR = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/screenshots'
PDF_PATH = '/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/태그히어CRM_사용매뉴얼.pdf'

# Page content configuration
PAGES = [
    {
        'title': '태그히어 CRM 사용 매뉴얼',
        'subtitle': '네이버 리뷰 자동 요청 & 고객 관리 시스템',
        'is_cover': True,
    },
    {
        'title': '1. 로그인',
        'image': '01-login-annotated.png',
        'description': [
            '① 이메일: 가입 시 등록한 이메일 주소를 입력합니다',
            '② 비밀번호: 비밀번호를 입력합니다',
            '③ 로그인 버튼: 클릭하여 로그인합니다',
            '',
            '[팁] 계정이 없으신 경우 하단의 "회원가입" 링크를 클릭하세요.',
        ]
    },
    {
        'title': '2. 홈 대시보드',
        'image': '02-dashboard-annotated.png',
        'description': [
            '① 총 고객 수: 우리 매장에 등록된 전체 고객 수',
            '② 신규 등록 고객: 이번 주 새로 등록된 고객 수',
            '③ 네이버 총 리뷰: 네이버 플레이스 총 리뷰 수',
            '④ 알림톡 발송 가능액: 현재 충전금 잔액 (클릭 시 충전 페이지)',
            '',
            '하단 차트에서 네이버 리뷰 일자별 추이를 확인할 수 있습니다.',
        ]
    },
    {
        'title': '3. 포인트 적립',
        'image': '04-points-annotated.png',
        'description': [
            '① 전화번호 입력: 고객의 전화번호 뒷자리 8자리를 입력합니다',
            '② 숫자 키패드: 화면의 키패드로 번호를 입력합니다',
            '',
            '[참고] 8자리 입력 완료 시 자동으로 고객 검색이 진행됩니다.',
            '신규 고객은 포인트 적립 시 자동으로 등록됩니다.',
            '',
            '적립 완료 후 네이버 리뷰 요청 알림톡이 자동 발송됩니다.',
        ]
    },
    {
        'title': '4. 네이버 리뷰 자동 요청 설정',
        'image': '05-naver-review-annotated.png',
        'description': [
            '① 자동 발송 토글: ON으로 설정하면 포인트 적립 시 알림톡 자동 발송',
            '② 리뷰 혜택 내용: 고객에게 보여질 혜택을 입력합니다',
            '',
            '[팁] 예시: "리뷰 작성시 새우튀김 서비스!"',
            '',
            '우측 휴대폰 미리보기에서 실제 발송될 메시지를 확인할 수 있습니다.',
            '설정 완료 후 "설정 저장하기" 버튼을 클릭하세요.',
        ]
    },
    {
        'title': '5. 고객 리스트',
        'image': '07-customers-annotated.png',
        'description': [
            '① 검색: 이름, 전화번호, 메모로 고객을 검색합니다',
            '② 고객 테이블: 전체 고객 목록을 확인합니다',
            '',
            '[확인 가능한 정보]',
            '- 이름, 전화번호, 적립 포인트',
            '- 방문 횟수, 마지막 방문일',
            '- 성별, 생일, 메모',
            '',
            '고객 행을 클릭하면 상세 정보 수정이 가능합니다.',
        ]
    },
    {
        'title': '6. 설정',
        'image': '08-settings-annotated.png',
        'description': [
            '[매장 정보] 매장명, 대표자명, 연락처 등 수정',
            '[고객 등록 링크] QR 코드로 고객 직접 등록 유도',
            '[알림톡 설정] 포인트 알림톡 자동 발송 설정',
            '[랜덤/고정 포인트] 적립 방식 설정',
            '',
            '[팁] QR 코드를 매장에 비치하면 고객이 직접 등록할 수 있습니다.',
        ]
    },
    {
        'title': '7. 충전',
        'image': '09-billing-annotated.png',
        'description': [
            '알림톡 발송을 위한 충전금을 충전합니다.',
            '',
            '[알림톡 비용] 1건당 50원',
            '',
            '충전 금액 선택 후 "충전하기" 버튼을 클릭하면',
            '토스페이먼츠 결제창이 열립니다.',
            '',
            '[주의] 충전금이 5원 미만이면 자동 발송이 중지됩니다.',
        ]
    },
    {
        'title': '문의 및 지원',
        'is_contact': True,
        'description': [
            '',
            '이메일: support@taghere.com',
            '',
            '운영시간: 평일 10:00 - 18:00',
            '',
            '',
            '(C) 2025 Taghere. All rights reserved.',
        ]
    },
]

def create_pdf():
    c = canvas.Canvas(PDF_PATH, pagesize=A4)
    width, height = A4

    for page_info in PAGES:
        if page_info.get('is_cover'):
            # Cover page
            c.setFillColor(HexColor('#1E3A5F'))
            c.rect(0, 0, width, height, fill=True)

            c.setFillColor(HexColor('#FFFFFF'))
            c.setFont(FONT_NAME, 36)
            c.drawCentredString(width/2, height - 280, page_info['title'])

            c.setFont(FONT_NAME, 18)
            c.drawCentredString(width/2, height - 330, page_info['subtitle'])

            c.setFont(FONT_NAME, 14)
            c.drawCentredString(width/2, 100, '2025년 1월')

        elif page_info.get('is_contact'):
            # Contact page
            c.setFillColor(HexColor('#F8F9FA'))
            c.rect(0, 0, width, height, fill=True)

            c.setFillColor(HexColor('#1E3A5F'))
            c.setFont(FONT_NAME, 28)
            c.drawCentredString(width/2, height - 100, page_info['title'])

            c.setFillColor(HexColor('#333333'))
            c.setFont(FONT_NAME, 16)
            y = height - 200
            for line in page_info['description']:
                c.drawCentredString(width/2, y, line)
                y -= 35

        else:
            # Content page
            c.setFillColor(HexColor('#FFFFFF'))
            c.rect(0, 0, width, height, fill=True)

            # Title
            c.setFillColor(HexColor('#1E3A5F'))
            c.setFont(FONT_NAME, 24)
            c.drawString(30, height - 50, page_info['title'])

            # Separator line
            c.setStrokeColor(HexColor('#E53E3E'))
            c.setLineWidth(3)
            c.line(30, height - 60, 200, height - 60)

            # Image
            if page_info.get('image'):
                img_path = os.path.join(OUTPUT_DIR, page_info['image'])
                if os.path.exists(img_path):
                    img = Image.open(img_path)
                    img_width, img_height = img.size

                    # Scale to fit width
                    max_width = width - 60
                    max_height = 380
                    scale = min(max_width / img_width, max_height / img_height)

                    new_width = img_width * scale
                    new_height = img_height * scale

                    x = (width - new_width) / 2
                    y = height - 90 - new_height

                    c.drawImage(img_path, x, y, new_width, new_height)

                    desc_y = y - 30
                else:
                    desc_y = height - 400
            else:
                desc_y = height - 100

            # Description
            c.setFillColor(HexColor('#333333'))
            c.setFont(FONT_NAME, 12)
            for line in page_info.get('description', []):
                c.drawString(40, desc_y, line)
                desc_y -= 22

        c.showPage()

    c.save()
    print(f"PDF saved: {PDF_PATH}")

if __name__ == '__main__':
    create_pdf()
