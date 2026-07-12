# 스탬프 적립 링크 공유·재사용 방어 (스캔 토큰) — 설계 문서

날짜: 2026-07-07
상태: 승인됨 (설계 단계, Q&A로 결정 확정)

## 배경 / 목표

"태그히어 사용 X"(주문 미연동) 스탬프 적립 링크(`/taghere-enroll-stamp/{slug}`)는
매장별 **영구 정적 URL**이며, 유일한 방어는 "고객당 하루 1회"뿐이다. 이 때문에:

- 링크를 카톡방 등에 **공유**하면 여러 명이 매장 방문 없이 매일 1개씩 적립
- 오늘 방문한 링크를 안 지우고 **북마크/탭으로 남겨 내일 또 적립**

목표: **저장·공유된 링크의 재사용을 차단**한다. (QR 자체를 사진 찍어 재스캔하는 것은
정적 QR 구조상 구분 불가 → 수용된 잔여 한계.)

## 핵심 아이디어

정적인 부분(QR 속 `slug`)과 **일회성 증명(스캔 토큰)**을 분리한다. 슬러그로 진입하면
서버가 단기 만료·1회용 토큰을 발급하고 주소를 `?t=`로 교체한다. 적립은 **유효·미소비
토큰이 있을 때만** 가능. 사람들이 주소창에서 복사·북마크하는 것은 `?t=` URL이므로,
그 재사용/공유는 토큰 만료·소비로 무력화된다.

## 적용 범위 (엄격)

**적용 (가드 발동 조건 — 브랜치-로컬 AND):**
```
linkGuardEnabled
  && !ordersheetId
  && !isHitejinro
  && !isFranchiseStampMode
  && !manualStampCountEnabled
```
이 5개 조건이 **모두** 참일 때만 토큰을 발급·요구한다. `linkGuardEnabled` 하나로 판단하면
프랜차이즈/manual-count 매장을 실수로 끌어들이므로 **반드시 AND로 게이팅** (하드 요구사항).

**제외 (절대 건드리지 않음 — 토큰 미요구, 기존 동작 유지):**
- 주문 연동 경로(ordersheetId 존재) — 이미 `already_earned_order`로 보호됨
- 하이트진로(`isHitejinro`)
- 프랜차이즈 통합 스탬프(`isFranchiseStampMode`)
- **매번 개수 입력 모드(`manualStampCountEnabled`)** — 직원 조작 기반이라 공유 위험 낮음.
  게다가 콜백이 적립 대신 `?needCount=1`로 리다이렉트하고(`kakao.ts:1296`), 클라가
  `submitCountEarn`(`page.tsx:868`)로 별도 적립하므로 토큰 라이프사이클이 복잡해짐.
  결합 시 브릭 위험이 커 **명시적 제외**. (manual-count 매장은 이 방어를 못 받음 — 수용.)

**안전 롤아웃:** 매장별 토글 `StampSetting.linkGuardEnabled Boolean @default(false)`.
false면 기존 동작 100% 불변. 대상 매장만 켠다. (dev 배포 시 아무 매장도 영향 없음.)

## 결정된 규칙 (Q&A 확정)

- TTL: **10분** (스캔→카카오 로그인→적립 왕복 커버).
- 진입 토큰 상태별 처리:

| 진입 형태 | 처리 |
|---|---|
| 토큰 없음 (맨 슬러그 `/{slug}`) | 새 토큰 발급 후 진행 = **신선한 스캔으로 간주** (수용된 잔여 한계) |
| 유효·미소비 토큰 | 적립 진행 + **동일 트랜잭션에서 즉시 소비** |
| 만료 또는 소비된 토큰 (`?t=` 재사용) | **적립 차단** → "링크가 만료되었어요. 매장에서 다시 스캔해주세요" 안내. **자동 재발급 금지** |

## 데이터 모델

`PointSession`(schema:973) 패턴을 복제:

```prisma
model StampScanToken {
  id                   String    @id @default(cuid())
  storeId              String
  status               String    @default("PENDING") // PENDING | CONSUMED
  createdAt            DateTime  @default(now())
  expiresAt            DateTime
  consumedAt          DateTime?
  consumedByCustomerId String?
  store                Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
  @@index([storeId, status])
  @@map("stamp_scan_tokens")
}
```

Store에 역관계 `stampScanTokens StampScanToken[]` 추가.
스키마 반영: `npx prisma db push` (migrate 아님).

## API 변경 (apps/api/src/routes/taghere.ts)

### (신규) POST `/api/taghere/stamp-scan/:slug`
- 매장 조회 → `linkGuardEnabled=true`이고 standalone일 때만 토큰 발급.
- `StampScanToken { storeId, status: PENDING, expiresAt: now + 10분 }` 생성.
- 응답 `{ token: id, expiresAt }`. 가드 미적용 매장은 `{ token: null }`(클라 no-op).
- 공개(무인증). 남용 방지용 매장별 간단 rate limit은 기존 v1Limiter/글로벌 리미터 범위 내.

### (수정) GET `/api/taghere/stamp-info/:slug`
- 응답에 `linkGuardEnabled: boolean` 추가. **이 값은 서버가 최종 AND
  (`setting.linkGuardEnabled && !isHitejinro && !isFranchiseStampMode && !manualStampCountEnabled`)를
  계산한 결과**. stamp-info는 slug만 알고 ordersheetId는 클라가 아므로, ordersheetId 제외는
  클라에서 `&& !ordersheetId`로 최종 판단. (franchise 분기는 이미 early-return `taghere.ts:1004`.)

### (수정) POST `/api/taghere/stamp-earn`
- **브랜치-로컬 게이팅**: `setting.linkGuardEnabled && !ordersheetId && !isHitejinro && !isFranchiseStampMode && !manualStampCountEnabled`일 때만 body `t` 필수.
- 검증: 토큰 존재 & status=PENDING & `expiresAt > now` & `storeId` 일치.
- **원자적 소비**: `updateMany({ where: { id, status: 'PENDING', expiresAt: { gt: now } }, data: { status: 'CONSUMED', consumedAt, consumedByCustomerId } })` → `count === 1`일 때만 적립 진행(낙관적 락, 더블탭·동시요청 방어). 적립 ledger 생성과 **같은 `$transaction`**.
- 무효/누락 → `res.json({ error: 'invalid_token' })` (적립 안 함). 적립 성공 후에만 소비 확정되도록 순서 주의(소비 update가 성공(count=1)한 뒤 ledger 생성; 실패 시 트랜잭션 롤백).

### (수정) 카카오 콜백 handleStampCallback (apps/api/src/routes/kakao.ts)
- **브랜치-로컬 게이팅** 동일: `store.stampSetting?.linkGuardEnabled && !stateData.ordersheetId && !stateData.isHitejinro && !isFranchiseStampMode && !manualCountMode`일 때만 `stateData.t` 필수.
- 기존 적립+ledger `$transaction`(kakao.ts:1313) 안에 원자적 소비(`updateMany count===1`)를 포함.
- 무효/누락 → `?error=invalid_token`으로 리다이렉트(적립 안 함).
- manual-count는 이미 `?needCount=1`로 분기(kakao.ts:1296)되며 게이팅에서 제외되므로 토큰 경로와 무관.

## OAuth state에 토큰(`t`) 보존 (2개 진입 경로)

1. **클라 SDK 경로** — `handleOpenGift`(page.tsx:1051): `stateData`에 `t` 추가 → `window.Kakao.Auth.authorize({ state })`.
2. **서버 폴백 경로** — `GET /auth/kakao/taghere-start`(kakao.ts:414): 쿼리 `t` 수신 → state에 포함. page.tsx 폴백(1071~)에서 `params.set('t', t)`.
3. 콜백 디스패처(kakao.ts state parse)와 `handleStampCallback` stateData 타입에 `t: string` 추가.

## 프론트 변경 (apps/web/src/app/taghere-enroll-stamp/[slug]/page.tsx)

- `t = searchParams.get('t')` 읽기.
- **가드 발동 여부(클라)**: `guardActive = stampInfo.linkGuardEnabled && !ordersheetId`
  (하이트진로 페이지는 별도 파일이라 여기선 항상 비하이트진로; 프랜차이즈/manual-count는
  서버가 `linkGuardEnabled`를 **최종 AND 결과로 계산해 내려주므로** 클라는 그 값만 신뢰).
  → **stamp-info의 `linkGuardEnabled`는 서버가 위 5개 AND를 모두 반영한 최종값**으로 반환한다.
- **mint-on-load & 자동적립 레이스 방지 (핵심)**: `guardActive && !t`이면 이번 렌더에서
  **자동적립(`attemptAutoEarn`)·`handleOpenGift` 자동 트리거를 억제**하고 먼저
  `POST /stamp-scan/:slug` → `router.replace('?t=...')`. `?t=`가 생겨 재렌더된 뒤에야
  자동적립/버튼 로직이 토큰을 갖고 진행. (`autoEarnAttemptedRef`가 mint 전에 소진되지 않도록
  가드 분기를 자동적립 시도보다 먼저 둔다.)
- `guardActive && t`일 때만: `attemptAutoEarn` body에 `t` 포함, `handleOpenGift` state에 `t` 포함, 폴백 params에 `t` 포함.
- 적립 응답이 `invalid_token`이면 **"다시 스캔" 안내 화면**(기존 `showAlreadyParticipated` 스타일의 신규 상태 `showExpiredLink`) 표시.
- 가드 매장에서 토큰 없이 콜백/자동적립이 무효 처리되면 동일 안내.
- 하이트진로 페이지(`taghere-enroll-stamp-hitejinro`)는 범위 밖 → 변경 없음.

## 엣지 케이스

- **더블탭/동시요청**: 원자적 `updateMany count===1` 낙관적 락으로 1회만 적립.
- **로그인 도중 만료(10분 초과)**: 미소비 토큰이지만 만료 → `invalid_token` → "다시 스캔" (드묾, TTL 10분).
- **소비 후 새로고침/뒤로가기**: 소비된 토큰 → "다시 스캔" (에러 아님, 안내 톤).
- **가드 OFF 매장**: `linkGuardEnabled=false` → mint no-op, `t` 미요구 → 기존 동작 그대로.
- **주문 연동/하이트진로/프랜차이즈**: `t` 미요구(범위 밖) — 분기 조건에서 명시적으로 제외.
- **약은 우회(맨 슬러그만 공유)**: 새 토큰 발급되어 하루 1회 가능 = QR 사진 공유와 동일(수용).

## 테스트

- 가드 ON standalone: (1)정상 스캔→적립 성공+토큰 CONSUMED, (2)같은 `?t=` 재사용→invalid_token, (3)만료 토큰→invalid_token, (4)토큰 없이 stamp-earn→invalid_token, (5)맨 슬러그 재진입→새 토큰 mint→적립(수용), (6)동시 2요청→1건만 적립.
- 가드 OFF: 기존 플로우 회귀 없음(토큰 무관 적립).
- 범위 밖(주문/하이트진로/프랜차이즈/**manual-count**): 토큰 요구 안 함, 회귀 없음.
- **가드 ON + manual-count ON**: 토큰 미요구로 기존 개수입력 적립 정상 동작(브릭 없음) — 명시 테스트.
- **레이스**: 재방문(localStorage kakaoId) + 가드 ON + 맨 슬러그 진입 → 자동적립이 mint 이전에 발사되지 않고, `?t=` 생성 후에만 적립되는지.
- 카카오 콜백 경로/자동적립 경로 각각 토큰 검증.

## 범위 제외

- 하이트진로·프랜차이즈 통합·주문 연동 경로.
- 회전 QR/동적 QR, 지오펜스/IP 근접성, 속도 이상탐지 backstop(후속 논의).
- 맨 슬러그(토큰 없는 URL) 재스캔 차단(정적 QR 구조상 불가, 수용).
