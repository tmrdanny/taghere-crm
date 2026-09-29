// 리타겟 쿠폰·자동 마케팅 광고 문자 본문 — API services/kakao-channel-templates.ts renderRetargetCouponSms 와 같은 규칙.
// 본문은 매장이 직접 쓴 문구({매장명} {쿠폰내용} {유효기간} 치환) 또는 기본 문구이고,
// (광고) 표기 · 직원 확인 링크 · 길찾기 링크 · 무료수신거부는 항상 자동으로 붙는다.
// 미리보기용: 링크는 실제 발송 때 고객마다 만들어지므로 자리표시 주소로 보여준다.
export const SMS_BODY_MAX = 1000;
export const SMS_BODY_VARS = ['{매장명}', '{쿠폰내용}', '{유효기간}'] as const;

/** 기본 문구 (직접 쓰기를 시작할 때 채워 주는 초안이기도 하다) */
export const DEFAULT_COUPON_SMS_BODY = '[{매장명}] 쿠폰이 도착했어요!\n\n태그히어 이용 고객에게만 드리는 쿠폰이에요.\n\n▶ 쿠폰: {쿠폰내용}\n▶ 유효기간: {유효기간}';

export function buildCouponSmsText(p: {
  storeName: string;
  couponContent: string;
  expiryDate: string;
  withNaverLink?: boolean;
  /** 매장이 직접 쓴 본문 — 없으면 기본 문구 */
  customBody?: string | null;
}): string {
  const body = (p.customBody?.trim() || DEFAULT_COUPON_SMS_BODY)
    .replace(/\{매장명\}/g, p.storeName || '매장명')
    .replace(/\{쿠폰내용\}/g, p.couponContent || '쿠폰 내용을 입력해주세요')
    .replace(/\{유효기간\}/g, p.expiryDate || '유효기간을 입력해주세요');
  const lines = ['(광고)', body, '', '결제할 때 아래 링크를 직원에게 보여주세요.', 'https://taghere.com/coupon/verify/…'];
  if (p.withNaverLink !== false) lines.push('', '매장 길찾기', 'https://naver.me/…');
  lines.push('', '무료수신거부 080-500-4233');
  return lines.join('\n');
}
