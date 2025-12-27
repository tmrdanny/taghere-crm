# TagHere CRM

매장 고객 관리 및 포인트 적립/사용 시스템

## 구조

```
taghere-crm/
├── apps/
│   ├── web/        # Next.js + TypeScript + Tailwind + shadcn/ui
│   └── api/        # Express + TypeScript + Prisma + MySQL
├── packages/
│   ├── ui/         # 공통 UI 컴포넌트 + 디자인 토큰
│   └── config/     # 공유 설정
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docker-compose.yml
└── README.md
```

## 주요 기능

### 점주/직원 기능
- **홈 대시보드**: KPI 카드 (총 고객 수, 신규 고객, 리뷰 요청 잔액), 네이버 리뷰 추이 차트
- **고객 리스트**: 검색/필터, 포인트 사용 모달
- **포인트 적립** (POS/태블릿): 숫자 키패드 UI, 전화번호 뒷자리 8자리 입력
- **네이버 리뷰 자동 요청**: 토글 ON/OFF, 혜택 문구 설정, 발송 미리보기
- **설정**: 포인트 적립 기준 (% 또는 고정), 계정 관리
- **카드 등록/빌링**: 카드 관리, 결제 내역

### 손님 기능
- **카카오 로그인 포인트 적립** (`/enroll`): QR 스캔 → 카카오 로그인 → 자동 적립

### 수익모델
- 리뷰 자동 요청 발송 1건당 50원 차감
- 잔액 부족 시 자동충전 (5/10/30/50만원 옵션)

## 필수 요구사항

- Node.js >= 18
- Docker & Docker Compose (MySQL용)
- npm >= 9

## 시작하기

### 1. 환경변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 필요한 값을 설정하세요
```

### 2. MySQL 데이터베이스 실행

```bash
docker compose up -d
```

### 3. 의존성 설치

```bash
npm install
```

### 4. 데이터베이스 마이그레이션 및 시드

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

### 5. 개발 서버 실행

```bash
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

## 환경변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| DATABASE_URL | MySQL 연결 문자열 | mysql://taghere:taghere123@localhost:3306/taghere_crm |
| JWT_SECRET | JWT 서명 키 | - |
| KAKAO_CLIENT_ID | 카카오 OAuth 클라이언트 ID | - |
| KAKAO_CLIENT_SECRET | 카카오 OAuth 시크릿 | - |
| KAKAO_REDIRECT_URI | 카카오 OAuth 콜백 URL | http://localhost:4000/auth/kakao/callback |
| PUBLIC_APP_URL | 프론트엔드 URL | http://localhost:3000 |
| API_URL | API 서버 URL | http://localhost:4000 |

## API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 현재 사용자 정보

### 고객 관리
- `GET /api/customers` - 고객 목록 (검색/필터/페이지네이션)
- `GET /api/customers/:id` - 고객 상세
- `GET /api/customers/search/phone/:digits` - 전화번호로 고객 검색

### 포인트
- `POST /api/points/earn` - 포인트 적립
- `POST /api/points/use` - 포인트 사용
- `GET /api/points/recent` - 최근 적립 내역

### 대시보드
- `GET /api/dashboard/summary` - 홈 KPI 요약
- `GET /api/dashboard/review-chart` - 리뷰 차트 데이터

### 리뷰 자동요청
- `GET /api/review-automation/settings` - 설정 조회
- `POST /api/review-automation/settings` - 설정 저장
- `GET /api/review-automation/logs` - 발송 로그

### 지갑
- `GET /api/wallet` - 잔액 조회
- `POST /api/wallet/topup` - 충전 (개발용)
- `GET /api/wallet/transactions` - 결제 내역

### 설정
- `GET /api/settings/point-policy` - 포인트 정책 조회
- `POST /api/settings/point-policy` - 포인트 정책 저장

### 카드
- `GET /api/cards` - 등록된 카드 목록
- `POST /api/cards` - 카드 등록
- `DELETE /api/cards/:id` - 카드 삭제

### 외부 연동
- `POST /api/taghere/order-event` - 주문 이벤트 (리뷰 요청 트리거)

### 카카오 OAuth
- `GET /auth/kakao/start` - 카카오 로그인 시작
- `GET /auth/kakao/callback` - 카카오 로그인 콜백

## API 테스트 (curl)

### 로그인
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@taghere.com", "password": "password123"}'
```

### 개발용 토큰 사용
API 테스트 시 `Authorization: Bearer dev-token` 헤더를 사용하면 인증을 건너뛸 수 있습니다.

### 고객 리스트 조회
```bash
curl http://localhost:4000/api/customers \
  -H "Authorization: Bearer dev-token"
```

### 포인트 적립
```bash
curl -X POST http://localhost:4000/api/points/earn \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"phone": "12345678", "points": 100}'
```

### 포인트 사용
```bash
curl -X POST http://localhost:4000/api/points/use \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"customerId": "CUSTOMER_ID", "points": 500, "reason": "단골 서비스"}'
```

### 리뷰 요청 트리거 (자동 과금 + 자동충전 테스트)
```bash
curl -X POST http://localhost:4000/api/taghere/order-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"orderId": "ORDER123", "phone": "12345678"}'
```

### 지갑 충전 (개발용)
```bash
curl -X POST http://localhost:4000/api/wallet/topup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"amount": 100000}'
```

### 대시보드 요약
```bash
curl http://localhost:4000/api/dashboard/summary \
  -H "Authorization: Bearer dev-token"
```

## 테스트 계정

시드 데이터에 포함된 테스트 계정:
- **이메일**: owner@taghere.com
- **비밀번호**: password123
- **매장**: 태그히어 1호점
- **초기 지갑 잔액**: 200,000원

## 구현 진행 상황

- [x] Step 1: 스캐폴딩 & 로컬 실행 환경 구축
- [x] Step 2: Prisma 스키마 + migration + seed
- [x] Step 3: UI 페이지 피그마 스타일로 구현
- [x] Step 4: Express API 구현 + 프론트 연결
- [x] Step 5: /enroll 카카오 OAuth end-to-end
- [x] Step 6: 리뷰 자동요청 + 과금 + 자동충전
- [x] Step 7: 정리 및 문서화

## 페이지 구조

- `/` - 홈 대시보드
- `/customers` - 고객 리스트
- `/points` - 포인트 적립 (POS/태블릿)
- `/naver-review` - 네이버 리뷰 자동 요청 설정
- `/settings` - 설정
- `/billing` - 카드 등록/결제 내역
- `/login` - 로그인
- `/enroll` - 카카오 로그인 포인트 적립 (손님용)
- `/enroll/success` - 적립 완료

## 라이선스

Private - All rights reserved
