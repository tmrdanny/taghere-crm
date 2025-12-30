# TagHere CRM Webhook API 가이드

태그히어 모바일오더에서 주문 취소/환불 시 TagHere CRM으로 포인트 차감 요청을 보내는 웹훅 API 가이드입니다.

---

## 인증 정보

### Bearer Token
```
Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=
```

모든 웹훅 API 요청 시 Authorization 헤더에 Bearer 토큰을 포함해야 합니다.

```
Authorization: Bearer Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=
```

---

## API 엔드포인트

### Base URL
- **Production**: `https://taghere-crm-api-g96p.onrender.com`
- **Development**: `http://localhost:4000`

---

## 1. 주문 취소/환불 웹훅

주문이 취소되거나 환불되었을 때 호출합니다. 해당 주문으로 적립된 포인트를 자동으로 차감합니다.

### Endpoint
```
POST /api/taghere/webhook/order-cancel
```

### Headers
```
Content-Type: application/json
Authorization: Bearer Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=
```

### Request Body
```json
{
  "ordersheetId": "6666",
  "reason": "고객 요청 환불",
  "cancelType": "REFUND"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| ordersheetId | string | O | 취소/환불된 주문 ID |
| reason | string | X | 취소/환불 사유 |
| cancelType | string | X | "CANCEL" 또는 "REFUND" (기본값: "CANCEL") |

### Response (성공 - 200)
```json
{
  "success": true,
  "message": "주문 취소 처리가 완료되었습니다.",
  "data": {
    "ordersheetId": "6666",
    "cancelType": "REFUND",
    "store": {
      "id": "clxxxxx",
      "name": "맛있는 식당"
    },
    "customer": {
      "id": "clyyyyy",
      "name": "홍길동",
      "phone": "010****5678"
    },
    "points": {
      "deducted": 1200,
      "previousBalance": 5000,
      "newBalance": 3800
    },
    "deductionId": "clzzzzz",
    "deletedOrderCount": 1,
    "processedAt": "2024-12-30T05:30:00.000Z",
    "processingTimeMs": 45
  }
}
```

### Response (에러)

#### 400 - 필수 파라미터 누락
```json
{
  "success": false,
  "error": "Missing required field",
  "message": "ordersheetId는 필수입니다."
}
```

#### 401 - 인증 실패
```json
{
  "success": false,
  "error": "Authorization header required",
  "message": "Bearer 토큰이 필요합니다."
}
```

#### 403 - 토큰 무효
```json
{
  "success": false,
  "error": "Invalid token",
  "message": "유효하지 않은 토큰입니다."
}
```

#### 404 - 적립 내역 없음
```json
{
  "success": false,
  "error": "Earn record not found",
  "message": "ordersheetId(6666)에 해당하는 포인트 적립 내역을 찾을 수 없습니다.",
  "ordersheetId": "6666"
}
```

#### 409 - 이미 처리됨 (중복 요청)
```json
{
  "success": false,
  "error": "Already processed",
  "message": "ordersheetId(6666)는 이미 취소 처리되었습니다.",
  "ordersheetId": "6666",
  "previousDeductionId": "claaaaa",
  "deductedAt": "2024-12-30T05:00:00.000Z"
}
```

#### 500 - 서버 에러
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "주문 취소 처리 중 오류가 발생했습니다."
}
```

---

## 2. 서버 상태 확인

웹훅 서버가 정상 작동하는지 확인합니다. (인증 불필요)

### Endpoint
```
GET /api/taghere/webhook/health
```

### Response
```json
{
  "success": true,
  "status": "ok",
  "service": "TagHere CRM Webhook",
  "timestamp": "2024-12-30T05:30:00.000Z"
}
```

---

## 3. 토큰 검증

제공받은 토큰이 유효한지 테스트합니다.

### Endpoint
```
POST /api/taghere/webhook/verify
```

### Headers
```
Authorization: Bearer Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=
```

### Response (성공)
```json
{
  "success": true,
  "message": "토큰이 유효합니다.",
  "verified": true,
  "timestamp": "2024-12-30T05:30:00.000Z"
}
```

---

## 코드 예시

### cURL
```bash
# 주문 취소 요청
curl -X POST "https://taghere-crm-api-g96p.onrender.com/api/taghere/webhook/order-cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=" \
  -d '{
    "ordersheetId": "6666",
    "reason": "고객 요청 환불",
    "cancelType": "REFUND"
  }'

# 서버 상태 확인
curl "https://taghere-crm-api-g96p.onrender.com/api/taghere/webhook/health"

# 토큰 검증
curl -X POST "https://taghere-crm-api-g96p.onrender.com/api/taghere/webhook/verify" \
  -H "Authorization: Bearer Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo="
```

### JavaScript/Node.js
```javascript
const WEBHOOK_URL = 'https://taghere-crm-api-g96p.onrender.com/api/taghere/webhook/order-cancel';
const WEBHOOK_TOKEN = 'Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo=';

async function cancelOrder(ordersheetId, reason, cancelType = 'CANCEL') {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_TOKEN}`
    },
    body: JSON.stringify({
      ordersheetId,
      reason,
      cancelType
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || '웹훅 요청 실패');
  }

  return data;
}

// 사용 예시
try {
  const result = await cancelOrder('6666', '고객 요청 환불', 'REFUND');
  console.log('취소 완료:', result);
} catch (error) {
  console.error('취소 실패:', error.message);
}
```

### Python
```python
import requests

WEBHOOK_URL = 'https://taghere-crm-api-g96p.onrender.com/api/taghere/webhook/order-cancel'
WEBHOOK_TOKEN = 'Lgc1y2HutUDpsxNpdPEkT6PjNrmTY2tdeOCMc5Nlmlo='

def cancel_order(ordersheet_id, reason=None, cancel_type='CANCEL'):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {WEBHOOK_TOKEN}'
    }

    payload = {
        'ordersheetId': ordersheet_id,
        'cancelType': cancel_type
    }

    if reason:
        payload['reason'] = reason

    response = requests.post(WEBHOOK_URL, json=payload, headers=headers)
    data = response.json()

    if not response.ok:
        raise Exception(data.get('message', '웹훅 요청 실패'))

    return data

# 사용 예시
try:
    result = cancel_order('6666', '고객 요청 환불', 'REFUND')
    print('취소 완료:', result)
except Exception as e:
    print('취소 실패:', str(e))
```

---

## 동작 흐름

```
[태그히어 모바일오더]
        |
        | 주문 취소/환불 발생
        |
        v
POST /api/taghere/webhook/order-cancel
        |
        |--- 1. 토큰 검증
        |
        |--- 2. ordersheetId로 적립 내역 조회
        |
        |--- 3. 중복 처리 여부 확인
        |
        |--- 4. 트랜잭션 처리
        |       - 포인트 차감 내역 생성
        |       - 고객 총 포인트 업데이트
        |       - 주문 내역 삭제
        |
        v
[TagHere CRM]
  - 포인트 -1,200P
  - 주문 내역 삭제
```

---

## 주의사항

1. **멱등성 보장**: 동일한 ordersheetId로 여러 번 요청해도 한 번만 처리됩니다. (409 응답)

2. **포인트 음수 방지**: 차감 후 잔액이 음수가 되지 않도록 자동으로 0 이상으로 처리됩니다.

3. **비동기 처리 권장**: 웹훅 응답을 기다리지 않고 비동기로 처리하는 것을 권장합니다.

4. **재시도 로직**: 5xx 에러 발생 시 지수 백오프(exponential backoff)로 재시도하세요.

5. **토큰 보안**: Bearer 토큰은 서버 측에서만 사용하고, 클라이언트에 노출되지 않도록 주의하세요.

---

## 문의

웹훅 연동 관련 문의: **070-4138-0263**
