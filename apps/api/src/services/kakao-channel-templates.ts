// 알림톡 채널별 템플릿 치환.
//
// "태그히어플레이스" 채널이 30일 정지(2026-09-28~)되어 SOLAPI_PF_ID 를 "태그히어" 채널로 바꿔 보낸다.
// 알림톡 템플릿은 채널마다 따로 승인받아야 해서, 같은 내용으로 "태그히어" 채널에 새로 승인받은 템플릿으로 바꿔 보낸다.
// 발송 채널(pfId)이 "태그히어"일 때만 바뀌므로, 플레이스 채널로 되돌리면 원래 템플릿을 그대로 쓴다.
//
// 리타겟 쿠폰·자동 마케팅(KA01TP260106051853547CuShejvkmsu)은 치환하지 않고 광고 문자로 보낸다 (아래).
// "태그히어" 채널 템플릿은 변수명에 공백을 쓸 수 없어(#{쿠폰 내용} → #{쿠폰내용}) 치환할 때 변수명 공백도 지운다.
import { env } from '../config/env.js';

export const TAGHERE_PF_ID = 'KA01PF240519021055559bK17Af2bhY4';

const TAGHERE_CHANNEL_TEMPLATES: Record<string, string> = {
  KA01TP260116094958666CFhcNdlyZnR: 'KA01TP2609281008342511T4S2YvZn34', // 포인트 적립
  KA01TP251225052148401wk5xl5qJUQn: 'KA01TP260928100835279r8gv6CeNqz8', // 포인트 사용
  KA01TP260116094328271dKGNB7nSjlY: 'KA01TP2609281008362740l7IL1Wddbt', // 스탬프 적립
  KA01TP2602171311092086nNcZMVWrwV: 'KA01TP260928100837341ZDyvC5VuyWq', // 하이트진로 스탬프
  KA01TP251226101534248YKuvKSUXkjb: 'KA01TP26092810083840278eEhKq7i7z', // 네이버 리뷰 요청
  KA01TP260204133316142P8rDbAA4EXf: 'KA01TP260928100839413pRlQuZYRKsY', // 웨이팅 등록
  KA01TP260119132954886DSpzd3nf542: 'KA01TP260928100840348zLSRmvnHSOP', // 웨이팅 입장 호출·재호출
  KA01TP2601191336303184cN7JFM0dfR: 'KA01TP260928100841467FhRfOI4g95q', // 웨이팅 취소 (매장 사정)
  KA01TP2601191332468781c1Cka1rvpu: 'KA01TP260928100842542TupizY36vVs', // 웨이팅 취소 (고객 사정)
  KA01TP260119133405443pTObWsUFGd9: 'KA01TP26092810084350127guA2mk6GQ', // 웨이팅 취소 (지각)
  KA01TP260416033744340o9K4J8oA1kK: 'KA01TP260928100912252qTj7SaWXp8L', // 기업 광고 · 피자헛
  KA01TP250930075547299ikOWJ6bArTY: 'KA01TP2609281009110424FlHxjGwaug', // 기업 광고 · 세븐일레븐 v3 (변수명 공백 제거)
  KA01TP2512111453192340aUumS8xmld: 'KA01TP260928100913141Yx11tyhSxoH', // 기업 광고 · 처갓집 v7
  KA01TP26010513462218279L5IthM7TY: 'KA01TP260928100845204ntf4O05YiBX', // 발송 잔액 부족 (어드민)
  KA01TP260318032138795sPQKm0yXShn: 'KA01TP260928100846187GyTkctJBsCn', // 통계 자료 전달 (어드민)
};

/** 발송 채널에 맞는 템플릿 ID — 치환 대상이 아니면 그대로 */
export function templateForChannel(pfId: string, templateId: string): string {
  if (pfId !== TAGHERE_PF_ID) return templateId;
  return TAGHERE_CHANNEL_TEMPLATES[templateId] ?? templateId;
}

/** 치환된 템플릿이면 변수명의 공백을 지운다 (#{쿠폰 내용} → #{쿠폰내용}) — 기업 광고 변수 설정은 그대로 둔다 */
export function variablesForChannel(pfId: string, templateId: string, variables: Record<string, string>): Record<string, string> {
  if (pfId !== TAGHERE_PF_ID || !TAGHERE_CHANNEL_TEMPLATES[templateId]) return variables;
  return Object.fromEntries(Object.entries(variables).map(([k, v]) => [k.replace(/\s+/g, ''), v]));
}

// ---------- 리타겟 쿠폰·자동 마케팅 → 광고 문자(LMS) ----------
//
// 주류를 보상으로 주는 매장의 리타겟 쿠폰 때문에 "태그히어플레이스" 채널이 정지됐다.
// 이를 막을 정책이 나올 때까지 리타겟 쿠폰 템플릿으로 보내는 메시지는 알림톡 대신 광고 문자(LMS)로 보낸다.
// (사장님·프랜차이즈 리타겟 쿠폰, 신규 고객 쿠폰, 쿠폰 폼, 자동 마케팅 모두 이 템플릿을 쓴다)
// 광고 문자이므로 (광고) 표기·무료수신거부를 붙이고, 발송은 KST 08:00~20:50 에만 한다 (야간분은 워커가 오전 8시로 미룬다).
const RETARGET_COUPON_TEMPLATES = new Set(['KA01TP260106051853547CuShejvkmsu']);
const AD_OPT_OUT = '무료수신거부 080-500-4233';

/** 알림톡 대신 문자로 보내는 템플릿인지 */
export function isSmsOnlyTemplate(templateId: string): boolean {
  return RETARGET_COUPON_TEMPLATES.has(templateId) || (!!env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON && templateId === env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON);
}

const withHttps = (v: string) => (/^https?:\/\//.test(v) ? v : `https://${v}`);

/** 매장이 직접 쓴 문자 본문을 담는 변수 — 없으면 기본 문구 */
export const SMS_BODY_VAR = '#{문자본문}';
export const SMS_BODY_MAX = 1000;

/** 직접 쓴 본문 정리 — 빈 값이면 null(기본 문구), 너무 길면 자른다 */
export function normalizeSmsBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\r\n/g, '\n').trim();
  return t ? t.slice(0, SMS_BODY_MAX) : null;
}

/**
 * 리타겟 쿠폰 알림톡 변수 → 광고 문자 본문.
 * 본문: 매장이 쓴 문구({매장명} {쿠폰내용} {유효기간} 치환) 또는 기본 문구.
 * (광고) 표기 · 직원 확인 링크 · 길찾기 링크 · 무료수신거부는 항상 자동으로 붙는다.
 */
export function renderRetargetCouponSms(variables: Record<string, string>): string {
  const v = (k: string) => (variables[`#{${k}}`] ?? '').trim();
  const custom = v('문자본문');
  const body = custom
    ? custom.replace(/\{매장명\}/g, v('상호') || '매장').replace(/\{쿠폰내용\}/g, v('쿠폰내용')).replace(/\{유효기간\}/g, v('유효기간'))
    : [
        `[${v('상호') || '태그히어'}] 쿠폰이 도착했어요!`,
        '',
        '태그히어 이용 고객에게만 드리는 쿠폰이에요.',
        '',
        `▶ 쿠폰: ${v('쿠폰내용')}`,
        `▶ 유효기간: ${v('유효기간')}`,
      ].join('\n');
  const lines = ['(광고)', body];
  if (v('직원확인')) lines.push('', '결제할 때 아래 링크를 직원에게 보여주세요.', withHttps(v('직원확인')));
  if (v('네이버플레이스')) lines.push('', '매장 길찾기', withHttps(v('네이버플레이스')));
  lines.push('', AD_OPT_OUT);
  return lines.join('\n');
}
