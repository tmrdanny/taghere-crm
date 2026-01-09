# E2E 테스트 생성기

너는 지금부터 Playwright로 E2E 테스트를 생성하는 QA 전문가야.

## 테스트 방식
- $ARGUMENT로 입력한 테스트 요소들을 잘 이해해줘.
- Playwright MCP를 사용해서 테스트를 진행해줘.
- 테스트가 전부 끝나면 E2E 테스트를 작성해줘.
- 작성한 테스트들을 전부 실행해주고 실패하는 테스트가 있다면 성공 할때까지 개선해줘.

---

## 프로젝트 E2E 테스트 구조

### 디렉토리 구조
```
tests/e2e/
├── auth/                    # 인증 관련 테스트
│   ├── auth.setup.ts       # 인증 설정 (로그인 상태 저장)
│   ├── login.spec.ts       # 로그인 테스트
│   ├── register.spec.ts    # 회원가입 테스트
│   └── protected-routes.spec.ts  # 보호된 라우트 테스트
├── customers/               # 고객 관리 테스트
│   └── customers.spec.ts
├── points/                  # 포인트 적립 테스트
│   └── points.spec.ts
├── messages/                # 메시지 발송 테스트
│   ├── messages.spec.ts           # SMS/LMS 캠페인
│   ├── message-history.spec.ts    # 발송 내역
│   └── local-customers.spec.ts    # 우리동네 손님 찾기
├── billing/                 # 충전/결제 테스트
│   └── billing.spec.ts
├── fixtures/                # 테스트 데이터
│   └── test-data.ts
└── pages/                   # Page Object Models
    ├── login.page.ts
    ├── register.page.ts
    ├── dashboard.page.ts
    ├── points.page.ts
    ├── messages.page.ts
    └── billing.page.ts
```

### 테스트 실행 명령어
```bash
# 모든 E2E 테스트 실행
npm run test:e2e

# UI 모드로 테스트 실행 (디버깅용)
npm run test:e2e:ui

# 브라우저 표시하며 테스트 실행
npm run test:e2e:headed

# 디버그 모드로 테스트 실행
npm run test:e2e:debug

# 테스트 리포트 보기
npm run test:e2e:report

# 특정 모듈 테스트
npm run test:e2e:auth       # 인증 테스트만
npm run test:e2e:messages   # 메시지 테스트만
npm run test:e2e:points     # 포인트 테스트만
npm run test:e2e:billing    # 충전 테스트만
npm run test:e2e:customers  # 고객 테스트만
```

---

## 핵심 테스트 시나리오

### 1. 인증 (Authentication)
- ✅ 로그인 페이지 로드
- ✅ 유효한 자격증명으로 로그인 성공
- ✅ 잘못된 이메일/비밀번호로 로그인 실패
- ✅ 빈 필드 검증
- ✅ 회원가입 페이지 이동
- ✅ 보호된 라우트 접근 제어
- ✅ 토큰 만료 처리
- ✅ 로그아웃 기능

### 2. 회원가입 (Registration)
- ✅ 회원가입 페이지 로드
- ✅ 필수 입력 필드 존재 확인
- ✅ 카테고리 드롭다운 옵션 확인
- ✅ 비밀번호 불일치 검증
- ✅ 짧은 비밀번호 검증
- ✅ 중복 이메일 검증
- ✅ 전화번호/이메일 형식 검증

### 3. 고객 관리 (Customers)
- ✅ 고객 리스트 페이지 로드
- ✅ 고객 검색 기능
- ✅ 고객 상세 정보 보기
- ✅ 페이지네이션
- ✅ 정렬 기능
- ✅ 성별/연령대 필터
- ✅ 엑셀 내보내기

### 4. 포인트 적립 (Points)
- ✅ 포인트 적립 페이지 로드
- ✅ 고객 전화번호 검색
- ✅ 직접 포인트 입력
- ✅ 포인트 프리셋 버튼
- ✅ 결제 금액 기반 포인트 계산
- ✅ 결제 금액 프리셋 버튼
- ✅ 포인트 적립 전체 플로우
- ✅ 최근 거래 내역 표시

### 5. 메시지 발송 (Messages)
- ✅ 메시지 발송 페이지 로드
- ✅ 발송 대상 선택 (전체/재방문/신규/직접선택)
- ✅ 메시지 입력 및 바이트 카운터
- ✅ SMS/LMS 자동 전환 (90바이트 기준)
- ✅ 메시지 미리보기 (iPhone)
- ✅ 예상 비용 계산
- ✅ 성별/연령대 필터
- ✅ 테스트 발송 (5회 제한)
- ✅ 이미지 첨부 (MMS)
- ✅ 잔액 부족 시 발송 제한

### 6. 발송 내역 (Message History)
- ✅ 발송 내역 페이지 로드
- ✅ 상태 배지 표시 (PENDING/SENT/FAILED)
- ✅ 전화번호 마스킹
- ✅ 날짜/상태/유형별 필터
- ✅ 페이지네이션
- ✅ 에러 코드 한국어 표시

### 7. 우리동네 손님 찾기 (Local Customers)
- ✅ 페이지 로드 및 NEW 배지
- ✅ 시/도 선택 드롭다운
- ✅ 지역 선택 시 고객 수 업데이트
- ✅ 발송 대상 카드 표시
- ✅ 성별/연령대 필터
- ✅ 발송 인원 수 설정
- ✅ 메시지 입력 및 비용 계산 (200원/건)
- ✅ 테스트 발송
- ✅ iPhone 미리보기 (sticky)

### 8. 충전 관리 (Billing)
- ✅ 충전 페이지 로드
- ✅ 현재 잔액 표시
- ✅ 충전 금액 프리셋 버튼
- ✅ +50,000원 버튼
- ✅ 직접 금액 입력
- ✅ 최소 금액 검증 (1,000원)
- ✅ TossPayments 위젯 로드
- ✅ 거래 내역 표시
- ✅ 결제 완료/실패 처리

---

## Page Object Model 사용법

```typescript
import { LoginPage } from '../pages/login.page';

test('로그인 테스트', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login('test@email.com', 'password123');
  await loginPage.expectLoginSuccess();
});
```

---

## 테스트 데이터 (fixtures/test-data.ts)

```typescript
export const TEST_USER = {
  email: 'test@taghere.com',
  password: 'testpassword123',
  storeName: 'E2E 테스트 매장',
  // ...
};

export const TEST_CUSTOMER = {
  name: '테스트 고객',
  phone: '010-9876-5432',
  // ...
};

export const TEST_MESSAGE = {
  content: '[테스트] 안녕하세요! E2E 테스트 메시지입니다.',
  longContent: '...긴 메시지...',
};
```

---

## 새 테스트 추가 가이드

1. **테스트 파일 생성**: `tests/e2e/{모듈명}/{기능}.spec.ts`
2. **Page Object 생성** (필요시): `tests/e2e/pages/{페이지명}.page.ts`
3. **테스트 데이터 추가** (필요시): `tests/e2e/fixtures/test-data.ts`
4. **테스트 실행**: `npm run test:e2e`

---

## 주의사항

- 테스트 전 `npm install` 실행하여 `@playwright/test` 설치 필요
- 테스트 실행 시 로컬 서버 자동 시작 (playwright.config.ts의 webServer 설정)
- 실제 SMS 발송, 결제 등은 테스트 환경에서 모킹 필요
- 테스트 데이터(TEST_USER)는 실제 DB에 존재해야 함
