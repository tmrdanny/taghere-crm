# 태그히어 허브 · CRM 요약 카드 연동 가이드

허브(에이전트)에 사장님 CRM 요약 카드를 띄우고, 카드를 누르면 **로그인 없이** CRM 리포트를 여는 연동입니다.

## 인증

기존 CRM 웹훅과 같은 토큰을 씁니다.

```
Authorization: Bearer {TAGHERE_WEBHOOK_TOKEN 또는 TAGHERE_V2_WEBHOOK_TOKEN}
```

매장은 V2 매장 ID(`SR` + 26자)로 찾습니다. CRM 에 연결되지 않은 매장이면 `404 store_not_found` 입니다.

## 1. 요약 조회 — 카드 그리기

```
GET https://taghere-crm-api-g96p.onrender.com/api/taghere/owner/summary?v2StoreId=SR...
```

```json
{
  "success": true,
  "data": {
    "crmEnabled": true,
    "storeName": "카츠쇼신 서울역점",
    "headline": "충전금이 부족해 손님 알림 312건이 발송되지 못했습니다.",
    "lastWeek": { "visitors": 65, "returning": 9, "newCustomers": 56, "visitorsChange": 6 },
    "marketing30d": { "recipients": 340, "revisited": 30, "revenue": 3835000 },
    "wallet": { "balance": 0, "state": "EMPTY", "daysLeft": 0, "skipped7d": 312 },
    "automation": { "enabledCount": 1 }
  }
}
```

| 필드 | 뜻 |
|---|---|
| `headline` | 지금 사장님이 알아야 할 한 문장 (가장 급한 것 하나). 카드 제목으로 그대로 쓰면 됩니다 |
| `lastWeek` | 최근 7일(어제까지) 적립한 손님 / 그중 다시 온 손님 / 처음 온 손님 / 그 전 7일 대비 증감 |
| `marketing30d` | 최근 30일 문자·알림톡을 받은 손님, 그중 14일 안에 다시 온 손님, 그 손님들의 결제액(원) |
| `wallet.state` | `OK` · `LOW`(3일 안에 소진) · `EMPTY`(이미 손님 알림이 못 나가는 중) |
| `wallet.skipped7d` | 최근 7일 충전금 부족으로 못 나간 손님 알림 수 |

권장 표시: `wallet.state` 가 `EMPTY` 면 빨간 카드 + "충전하기", `LOW` 면 노란 카드, `OK` 면 `lastWeek` 숫자 3개.
조회는 가볍지 않으니(매장당 수백 ms) 허브 화면을 열 때 1번, 또는 5~10분 캐시를 권장합니다.

## 2. 링크 받기 — 카드를 눌렀을 때

```
POST https://taghere-crm-api-g96p.onrender.com/api/taghere/owner/link
Content-Type: application/json

{ "v2StoreId": "SR..." }
```

```json
{ "success": true, "data": { "url": "https://taghere-crm-web-g96p.onrender.com/o/xxxxxxxxxxxxxxxxxxxxxx" } }
```

- 사장님이 카드를 **누를 때마다** 새로 받아서 바로 여세요 (링크를 미리 만들어 두지 않기).
- 링크는 14일 동안 유효하고, 열면 그 매장 사장님 계정으로 12시간 로그인됩니다.
- 열리는 화면: 지난주 손님 · 메시지 효과 · 자동 마케팅 바로 켜기 · 충전 · "CRM 전체 화면 열기".
- 링크는 그 매장 사장님에게만 보여 주세요 (받은 사람은 누구나 그 매장 CRM 을 열 수 있습니다).
