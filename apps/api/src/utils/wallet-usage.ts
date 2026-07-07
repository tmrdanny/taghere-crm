// 충전금 이용내역 분류 유틸
// PaymentTransaction(type + meta)을 사용자에게 보여줄 카테고리로 변환한다.

export type WalletUsageCategory =
  | 'topup'            // 충전
  | 'earn_alimtalk'    // 적립 알림톡 (포인트/스탬프 적립·사용)
  | 'waiting_alimtalk' // 웨이팅 알림톡
  | 'marketing'        // 마케팅 (마케팅 알림톡/문자/브랜드메시지 등)
  | 'refund'           // 환불 (발송 실패 환불 포함)
  | 'subscription'     // 구독료
  | 'booster'          // 플레이스 부스터
  | 'deduct'           // 관리자 차감
  | 'etc';

export const WALLET_USAGE_LABELS: Record<WalletUsageCategory, string> = {
  topup: '충전',
  earn_alimtalk: '적립 알림톡',
  waiting_alimtalk: '웨이팅 알림톡',
  marketing: '마케팅 발송',
  refund: '환불',
  subscription: '구독료',
  booster: '플레이스 부스터',
  deduct: '차감',
  etc: '기타',
};

const EARN_TYPES = new Set(['POINTS_EARNED', 'POINTS_USED', 'STAMP_EARNED']);
const WAITING_TYPES = new Set(['WAITING_REGISTERED', 'WAITING_CALLED', 'WAITING_CANCELLED']);

export interface WalletTxLike {
  type: string;
  amount: number;
  meta: any;
}

export function classifyWalletTx(tx: WalletTxLike): WalletUsageCategory {
  const meta = (tx.meta || {}) as Record<string, any>;

  switch (tx.type) {
    case 'TOPUP':
      return 'topup';
    case 'REFUND':
      return 'refund';
    case 'SUBSCRIPTION':
      return 'subscription';
    case 'PLACE_BOOSTER':
      return 'booster';
    case 'DEDUCT':
      return 'deduct';
    case 'ALIMTALK_SEND': {
      // 발송 실패 환불 (amount 양수)
      if (meta.reason === 'send_failed_refund' || tx.amount > 0) return 'refund';
      const messageType = meta.messageType as string | undefined;
      if (messageType && EARN_TYPES.has(messageType)) return 'earn_alimtalk';
      if (messageType && WAITING_TYPES.has(messageType)) return 'waiting_alimtalk';
      // 캠페인 선차감(meta.type: SMS/BRAND_MESSAGE 등) 및 그 외 알림톡은 마케팅
      return 'marketing';
    }
    default:
      return 'etc';
  }
}

// 상세 표시용 설명 (meta 기반)
export function describeWalletTx(tx: WalletTxLike): string {
  const meta = (tx.meta || {}) as Record<string, any>;
  const parts: string[] = [];
  if (meta.messageType) parts.push(String(meta.messageType));
  else if (meta.type) parts.push(String(meta.type));
  if (meta.paidCount && meta.costPerMessage) {
    parts.push(`${meta.paidCount}건 × ${meta.costPerMessage}원`);
  } else if (meta.unitCost) {
    parts.push(`건당 ${meta.unitCost}원`);
  }
  if (meta.reason === 'send_failed_refund') parts.push('발송 실패 환불');
  if (meta.reason && meta.reason !== 'prepaid_charge' && meta.reason !== 'send_failed_refund') {
    parts.push(String(meta.reason));
  }
  return parts.join(' · ');
}
