// 리타겟 쿠폰·자동 마케팅 광고 문자 본문 — API services/kakao-channel-templates.ts renderRetargetCouponSms 와 같은 문구.
// 미리보기용: 링크는 실제 발송 때 고객마다 만들어지므로 자리표시 주소로 보여준다.
export function buildCouponSmsText(p: { storeName: string; couponContent: string; expiryDate: string; withNaverLink?: boolean }): string {
  const lines = [
    '(광고)',
    `[${p.storeName || '매장명'}] 쿠폰이 도착했어요!`,
    '',
    '태그히어 이용 고객에게만 드리는 쿠폰이에요.',
    '',
    `▶ 쿠폰: ${p.couponContent || '쿠폰 내용을 입력해주세요'}`,
    `▶ 유효기간: ${p.expiryDate || '유효기간을 입력해주세요'}`,
    '',
    '결제할 때 아래 링크를 직원에게 보여주세요.',
    'https://taghere.com/coupon/verify/…',
  ];
  if (p.withNaverLink !== false) lines.push('', '매장 길찾기', 'https://naver.me/…');
  lines.push('', '무료수신거부 080-500-4233');
  return lines.join('\n');
}
