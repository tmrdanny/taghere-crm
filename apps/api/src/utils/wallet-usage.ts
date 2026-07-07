// 매장 알림톡/문자 사용내역 분류 유틸
// PaymentTransaction(type + meta)을 채널 기준(알림톡/광고톡/문자메시지 등)으로 분류한다.

export type WalletUsageCategory =
  | 'topup'          // 충전
  | 'alimtalk'       // 알림톡 (적립/웨이팅/리뷰요청/자동화 등 카카오 알림톡 API 발송 전체)
  | 'brand_message'  // 광고톡 (카카오 브랜드메시지/친구톡)
  | 'sms'            // 문자메시지 (SMS/LMS/MMS)
  | 'refund'         // 환불 (발송 실패 환불 포함)
  | 'subscription'   // 구독료
  | 'booster'        // 플레이스 부스터
  | 'deduct'         // 관리자 차감
  | 'etc';

export const WALLET_USAGE_LABELS: Record<WalletUsageCategory, string> = {
  topup: '충전',
  alimtalk: '알림톡',
  brand_message: '광고톡',
  sms: '문자메시지',
  refund: '환불',
  subscription: '구독료',
  booster: '플레이스 부스터',
  deduct: '차감',
  etc: '기타',
};

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
      if (meta.type === 'BRAND_MESSAGE') return 'brand_message';
      if (meta.type === 'SMS') return 'sms';
      // messageType 이 있으면 카카오 알림톡 API 발송 (적립/웨이팅/리뷰요청/자동화 등 전부 '알림톡')
      return 'alimtalk';
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
