# Franchise SMS Setup Guide

## 문제 해결

### 1. 고객 선택 모달이 비어있는 문제
**원인**: API 엔드포인트 불일치
- 프론트엔드: `/api/franchise/customers/selectable` 호출
- 백엔드: `/api/franchise/sms/customers/selectable`로 등록됨

**해결**: 프론트엔드 URL 수정 완료

### 2. test-count API 500 에러
**원인**: `franchise_sms_test_logs` 테이블이 데이터베이스에 생성되지 않음

**해결 방법 (프로덕션 DB에서 실행 필요)**:

#### Option 1: Render Shell에서 Prisma 마이그레이션 실행
```bash
# Render 대시보드 → Shell 접속
npx prisma migrate deploy
npx prisma generate
```

#### Option 2: 수동 SQL 실행
`manual-migration-franchise-sms.sql` 파일을 프로덕션 DB에서 실행:

```bash
# Render PostgreSQL 접속
psql $DATABASE_URL

# SQL 파일 실행
\i manual-migration-franchise-sms.sql
```

## 필요한 테이블

1. **franchise_sms_campaigns** - 프랜차이즈 SMS 캠페인
2. **franchise_sms_messages** - 프랜차이즈 SMS 개별 메시지
3. **franchise_sms_test_logs** - 프랜차이즈 SMS 테스트 발송 로그

## 검증 방법

1. 프랜차이즈 계정 로그인
2. 리타겟 페이지 접속 (`/franchise/campaigns/retarget`)
3. "고객 직접 선택" 클릭
4. 고객 목록이 표시되는지 확인
5. Console에서 test-count API 500 에러가 없는지 확인

## 스키마 정보

모든 모델과 relation은 `prisma/schema.prisma`에 정의되어 있습니다:
- FranchiseSmsCampaign
- FranchiseSmsMessage
- FranchiseSmsTestLog

Franchise 및 Customer 모델에 적절한 relation이 추가되어 있습니다.
