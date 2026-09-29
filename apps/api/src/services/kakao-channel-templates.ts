// 알림톡 채널별 템플릿 치환.
//
// "태그히어플레이스" 채널이 30일 정지(2026-09-28~)되어 SOLAPI_PF_ID 를 "태그히어" 채널로 바꿔 보낸다.
// 알림톡 템플릿은 채널마다 따로 승인받아야 해서, 같은 내용으로 "태그히어" 채널에 새로 승인받은 템플릿으로 바꿔 보낸다.
// 발송 채널(pfId)이 "태그히어"일 때만 바뀌므로, 플레이스 채널로 되돌리면 원래 템플릿을 그대로 쓴다.
//
// 리타겟 쿠폰·자동 마케팅(KA01TP260106051853547CuShejvkmsu)은 일부러 넣지 않았다 — 기존 템플릿 그대로 둔다.
// 기업 광고 세븐일레븐 v3 · 처갓집 v7 은 심사 중이라 승인되면 추가한다
// (세븐일레븐 v3 는 변수명 공백 제거: #{쿠폰 내용} → #{쿠폰내용} 등, 광고별 변수 설정도 함께 바꿔야 한다).
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
  KA01TP26010513462218279L5IthM7TY: 'KA01TP260928100845204ntf4O05YiBX', // 발송 잔액 부족 (어드민)
  KA01TP260318032138795sPQKm0yXShn: 'KA01TP260928100846187GyTkctJBsCn', // 통계 자료 전달 (어드민)
};

/** 발송 채널에 맞는 템플릿 ID — 치환 대상이 아니면 그대로 */
export function templateForChannel(pfId: string, templateId: string): string {
  if (pfId !== TAGHERE_PF_ID) return templateId;
  return TAGHERE_CHANNEL_TEMPLATES[templateId] ?? templateId;
}
