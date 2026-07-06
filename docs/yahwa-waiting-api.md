# 야화(Yahwa) 웨이팅 연동 API (`/api/v1`)

야화(데이트·소셜 앱)가 제휴 매장의 원격 웨이팅을 처리하기 위한 외부 API.
서버 간(Supabase Edge Function → TagHere) 호출 전용이며, 브라우저가 직접 호출하지 않는다.

- 모든 요청/응답: `application/json; charset=utf-8`
- 시각: ISO 8601 UTC 문자열 (`2026-06-02T12:30:00Z`)
- 인증: `Authorization: Bearer <YAHWA_API_KEY>` (고정 키 1개)

## 환경변수

| 변수 | 설명 |
|---|---|
| `YAHWA_API_KEY` | 야화 인증용 고정 키. **콤마로 여러 개** 지정 가능(키 로테이션). sandbox/production 환경별로 다른 값 주입. |
| `YAHWA_WEBHOOK_URL` | 상태 변경 푸시 수신 URL (예: `https://yahwa.vercel.app/api/taghere-webhook`) |
| `YAHWA_WEBHOOK_SECRET` | 웹훅 서명용 시크릿 (야화와 공유). HMAC-SHA256 서명에 사용. |

> 환경 분리(sandbox/production)는 **배포 환경별 env 값**으로 처리한다. 코드 분기 없음.
> 미설정 시: `YAHWA_API_KEY` 없으면 모든 요청 401, 웹훅 env 없으면 푸시는 조용히 스킵.

## 식별자

- `store_id` = TagHere `Store.id` (cuid 문자열). 야화는 이 값을 `stores.taghere_store_id`에 그대로 저장.
- `waiting_id` = TagHere `WaitingList.id` (cuid 문자열).
- **`yahwaEnabled=true` 인 매장만** 외부 API에 노출/조작 가능 (전체 CRM 매장 노출 방지).
  플래그 설정: `npx tsx scripts/enable-yahwa-stores.ts <slug-or-id> ...`

## 엔드포인트

### 1. `GET /api/v1/stores` — 매장 목록(매핑용)
`yahwaEnabled=true` 매장만 반환.
```json
[{ "store_id": "...", "name": "...", "address": "...", "biz_no": "123-45-67890", "active": true }]
```
`active` = 웨이팅 설정이 있고 enabled 이며 운영상태 ≠ CLOSED.

### 2. `POST /api/v1/waitings/counts` — 웨이팅 수 일괄 조회 (★지도 핵심)
```json
{ "store_ids": ["...", "..."] }   // 최대 100개
```
→ `{ "counts": [{ "store_id": "...", "waiting_count": 3, "updated_at": "..." }] }`
- `waiting_count` = 당일 영업일(KST 03:00 기준) `WAITING` + `CALLED` 팀 수.
- 미연동/존재하지 않는 store_id는 결과에서 생략.

### 2-1. `POST /api/v1/stores/gender-stats` — 매장 실시간 성별 비율 일괄 조회 (★지도 핵심)

TagHere 테이블 링크(중앙 QR → 테이블 번호 입력) 이용 고객이 주문 전 선택한 성별(남/여)을
시간 창(window) 기준으로 집계해 반환한다. "이 매장에 지금 어떤 성별 고객이 있는지"의 근사치.

```json
{ "store_ids": ["...", "..."], "window_minutes": 180 }   // store_ids 최대 100개, window 기본 180분·최대 1440분
```
→
```json
{ "stats": [{
  "store_id": "...",
  "male_count": 7,
  "female_count": 13,
  "total_count": 20,
  "male_ratio": 35.0,        // %, total 0이면 null
  "female_ratio": 65.0,      // %, total 0이면 null
  "window_minutes": 180,
  "updated_at": "2026-07-06T12:30:00Z"
}] }
```
- 데이터 원천: 매장 테이블 링크의 "성별 선택 수집" 기능 (기본 ON, 매장별 OFF 가능).
- 수집 OFF이거나 테이블 링크 미사용 매장은 `total_count: 0, ratio: null`로 반환 → 지도에서 "정보 없음" 처리 권장.
- 폴링 권장 주기: waitings/counts와 동일 (예: 30~60초). 별도 웹훅 없음.
- `window_minutes`는 야화가 UX에 맞게 조절 (예: 저녁 피크 감성은 180분, "오늘 하루"는 720분).

### 3. `POST /api/v1/waitings` — 웨이팅 등록
```json
{ "store_id": "...", "party_size": 2, "idempotency_key": "yahwa_<uuid>",
  "customer": { "external_id": "<야화 user uuid>", "name": "홍길동", "phone": "010-..." } }
```
→ `201 { waiting_id, status, position, estimated_wait_min, created_at }`
- 전화번호 없이 `external_id`만으로 등록 가능.
- 같은 `idempotency_key` 재요청 → 기존 웨이팅 반환(200).
- 같은 매장에 같은 `external_id`의 활성 웨이팅 존재 → `409 { error:"already_waiting", waiting_id }`.
- 미운영/미연동/정원초과 → `422 { error:"store_closed" }`.
- 매장 없음 → `404 { error:"not_found" }`.
- `position` = 내 앞 대기 팀 수(0 = 맨 앞). 등록 시 기본 웨이팅 유형(sortOrder 최소)으로 배정.

### 4. `GET /api/v1/waitings/{waiting_id}` — 상태 조회
→ `200 { waiting_id, store_id, status, position, estimated_wait_min, updated_at }`
없으면 `404 { error:"not_found" }`.

### 5. `POST /api/v1/waitings/{waiting_id}/cancel` — 취소
→ `200 { waiting_id, status:"cancelled" }`
이미 `seated`/`cancelled`/`expired`/`no_show` → `409 { error:"not_cancellable", status }`.

## 6. 웹훅 (TagHere → 야화)
야화 연동 웨이팅의 상태가 바뀌면 `YAHWA_WEBHOOK_URL`로 POST.
- 매장 직원이 CRM에서 **호출(called)/착석(seated)/취소** 시, 그리고 자동취소(expired) 시 발송.
- `called` 푸시가 야화의 "입장하세요" 트리거.
```
headers: { "X-TagHere-Signature": "<hmac_sha256(raw_body, YAHWA_WEBHOOK_SECRET)>" }
body: { event:"waiting.status_changed", waiting_id, store_id, status, position, waiting_count, occurred_at }
```
- 2xx 외 응답/네트워크 오류 시 지수 백오프로 3회 재시도(1s·4s·9s).
- `waiting_count`는 status_changed payload에 항상 포함(별도 count_changed 폴링 불필요).

## 상태값 매핑 (내부 → 외부)
| 내부 WaitingStatus | 외부 status |
|---|---|
| WAITING | `waiting` |
| CALLED | `called` |
| SEATED | `seated` |
| NO_SHOW | `no_show` |
| CANCELLED (reason=AUTO_CANCELLED) | `expired` |
| CANCELLED (그 외) | `cancelled` |

> `requested`는 사용하지 않음(등록 즉시 `waiting`).

## Rate limit
`/api/v1`는 전용 버킷: 분당 1500요청(=25 RPS)으로 ≥20 RPS 보장. 초과 시 `429 { error:"rate_limited" }`.

## 에러 공통 형식
`{ "error": "<code>", "message": "<선택>" }`
codes: `invalid_request`(400) · `unauthorized`(401) · `not_found`(404) · `already_waiting`/`not_cancellable`(409) · `store_closed`(422) · `rate_limited`(429) · `internal_error`(500)

## Sandbox 셋업 절차
1. 배포 환경(sandbox)에 env 설정: `YAHWA_API_KEY`, `YAHWA_WEBHOOK_URL`, `YAHWA_WEBHOOK_SECRET`.
2. `npx prisma db push` (deploy 시 자동 실행됨 — `yahwaEnabled`, `external*` 컬럼 추가).
3. 테스트 매장 1~2개 플래그: `npx tsx scripts/enable-yahwa-stores.ts <테스트매장 slug>`
4. `npx tsx scripts/enable-yahwa-stores.ts` (인자 없이) 로 `store_id` 확인 후 야화에 전달.
5. 야화: `EXPO_PUBLIC_TAGHERE_MOCK=0` + base URL/키 주입 후 실연동.
