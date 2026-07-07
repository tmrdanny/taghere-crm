# 스탬프 매번 적립 개수 직접 입력 — 설계 문서

날짜: 2026-07-07
상태: 승인됨 (설계 단계)

## 배경

카페 등에서 음료 개수만큼 스탬프를 적립해주고 싶다는 고객 피드백. 현재 태그히어 스탬프는
방문당 +1 고정(코드에 하드코딩)이며 고객당 하루 1회 적립 제한이 있어 이 요구를 수용할 수 없다.

## 목표

매장별 설정으로 "매번 적립 개수 직접 설정" 토글을 제공한다. 토글 ON 매장은 적립 시점마다
개수 입력 팝업이 뜨고, 입력한 개수만큼 적립된다. 하루 1회 제한도 해제된다.

## 데이터 모델

`StampSetting`에 필드 추가 (prisma/schema.prisma):

```prisma
manualStampCountEnabled Boolean @default(false) // 매번 적립 개수 직접 입력
```

- 기본값 false → 기존 매장 동작 불변.
- 스키마 반영은 `npx prisma db push` (migrate 사용 안 함).

## 동작 규칙 (토글 ON일 때)

| 항목 | OFF (기존/기본) | ON |
|---|---|---|
| 적립 개수 | +1 고정 | 팝업에서 직접 입력한 N |
| 하루 1회 제한 | 유지 | 해제 (하루 여러 번 가능) |
| 알림톡 문구 | "+1" 고정 | 입력 개수로 동적 (+N) |
| CRM 수동 적립 알림톡 | 발송 안 함 | 적립 모드일 때 발송 (차감은 계속 미발송) |

- 입력값: 양의 정수만 허용, 최소/최대 제한 없음, 기본값 없음(직접 입력).
- 팝업 취소 시 적립 자체가 취소되고 ledger 기록 없음.
- 입력 주체는 매장 직원 (적립 URL 플로우는 고객 단말에서 뜨지만 직원이 개수를 입력해주는 운영을 전제).
- **최초 적립 보너스(firstStampBonus)와의 관계**: 토글 ON 매장은 첫 방문 고객이어도
  보너스를 무시하고 입력한 개수만 적립한다 (직원이 더 주고 싶으면 큰 수를 입력하면 됨).
  토글 OFF 매장은 기존 보너스 로직 그대로.

## 적용 지점 (3곳)

### 1. 스탬프 태블릿 (`apps/web/src/app/stamp-tablet/page.tsx`)

- 시점: 전화번호 입력 직후, 적립 API 호출 전.
- 토글 ON이면 개수 입력 팝업 → 입력 완료 시 `POST /api/stamps/tablet-earn`에 `count` 포함 호출.
- 백엔드(`apps/api/src/routes/stamps.ts` tablet-earn):
  - `manualStampCountEnabled=true`인 매장은 `count`(양의 정수) 필수, 하루 1회 체크 스킵, `delta=count`.
  - `manualStampCountEnabled=false`면 `count` 무시하고 기존 로직(+1, 하루 1회) 그대로.
  - 알림톡 `earnedStamps` 변수에 실제 적립 개수 전달.

### 2. 스탬프 적립 URL (`apps/web/src/app/taghere-enroll-stamp/[slug]/page.tsx`)

- 시점: 페이지 진입 시(카카오 자동 적립·신규 등록 어느 경로든 실제 적립 호출 전).
  카카오 로그인 리다이렉트가 있는 경로는 **리다이렉트 복귀 후** 적립 API 호출 직전에 팝업을
  띄운다 (리다이렉트 전에 입력받아 값을 전달할 필요 없음 — 상태 유실 리스크 회피).
- 토글 ON 여부는 기존 `GET /api/taghere/stamp-info/:slug` 응답에 `manualStampCountEnabled` 필드를 추가해 판단.
- 팝업에서 개수 입력 후 `POST /api/taghere/stamp-earn`에 `count` 포함 호출.
- 백엔드(`apps/api/src/routes/taghere.ts` stamp-earn): tablet-earn과 동일 규칙.
- hitejinro 변형(`taghere-enroll-stamp-hitejinro`)은 이번 범위에서 제외.

### 3. CRM 수동 적립 (`apps/web/src/app/(dashboard)/customers/EarnStampsModal.tsx`)

- 이미 개수 입력 UI 존재 (`POST /api/stamps/adjust`) — UI 변경 없음.
- 백엔드(`/api/stamps/adjust`): `manualStampCountEnabled=true`이고 `delta > 0`(적립)이면
  적립 알림톡 발송 추가. 차감(`delta < 0`)은 기존대로 미발송.
- 알림톡은 tablet-earn과 동일한 적립 템플릿(`enqueueStampEarnedAlimTalk`)을 사용하고
  `earnedStamps`에 delta를 전달. ledger `type`은 기존 `ADMIN_ADD` 유지 (변경 없음).

## 공통 팝업 컴포넌트

`StampCountPrompt` (신규, apps/web/src/components 또는 화면 인접 위치):

- 숫자 전용 입력창 (양의 정수 검증), [취소] / [적립하기] 버튼.
- 기존 `Modal`/`ModalContent` (Radix 기반, `apps/web/src/components/ui/modal.tsx`) 재사용.
- 태블릿 화면은 터치 친화적으로 크게 렌더 (기존 태블릿 키패드 스타일 참고).
- 적립 URL 화면(모바일)은 일반 모달 크기.

## 설정 UI

`apps/web/src/app/(dashboard)/stamp-settings/page.tsx`:

- "최초 적립 보너스" 카드와 "리워드 티어" 카드 사이에 신규 카드 추가.
- Switch 토글 + 설명: "켜면 적립할 때마다 적립 개수를 직접 입력합니다. 하루 1회 적립 제한이 해제되며,
  CRM 수동 적립 시에도 고객에게 적립 알림톡이 발송됩니다."
- 저장: 기존 `PUT /api/stamp-settings`에 `manualStampCountEnabled` 필드 추가
  (`apps/api/src/routes/stamp-settings.ts`).

## 에러 처리

- 토글 ON인데 `count` 누락/0/음수/비정수 → 400 응답, 프론트는 팝업 유지 + 에러 표시.
- 토글 OFF인데 `count` 전달 → 무시 (+1 처리). 프론트/백 설정 불일치(설정 변경 직후 캐시) 시 안전.
- 알림톡 발송 실패는 기존과 동일하게 fire-and-forget (적립은 성공 처리).

## 테스트

- API: 토글 ON/OFF × count 유무 × 하루 중복 적립 케이스 (tablet-earn, taghere stamp-earn, adjust).
- 알림톡 변수(`earnedStamps`)에 N이 반영되는지.
- 토글 OFF 매장의 기존 플로우 회귀 없음 (하루 1회 제한, +1 고정).

## 범위 제외

- hitejinro 변형 페이지.
- 프랜차이즈 통합 스탬프.
- 고객이 직접 개수를 조작하는 것에 대한 어뷰징 방지 장치(운영상 직원 입력 전제).
