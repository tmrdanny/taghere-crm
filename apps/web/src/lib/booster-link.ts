/**
 * 플레이스 부스터 "쿠폰받기" 링크 미리보기용 URL 조합.
 *
 * 알림톡 '쿠폰 받기' 버튼은 추적 링크(/r/{code}/{weekNo})를 거쳐 아래 네이버 지도 URL로
 * 리다이렉트된다. 이 함수는 생성 화면에서 최종 도착 링크를 미리 보여주기 위한 것으로,
 * 백엔드 buildNaverMapUrl(apps/api/src/utils/naver-place.ts)과 동일한 포맷을 유지해야 한다.
 */
export function buildBoosterSearchUrl(keyword: string, placeId: string): string {
  const enc = encodeURIComponent(keyword);
  const ts = formatKstTimestamp(new Date());
  return (
    `https://map.naver.com/p/search/${enc}/place/${placeId}` +
    `?c=15.00,0,0,0,dh&placePath=/home?entry=bmp&from=map&fromPanelNum=2` +
    `&timestamp=${ts}&locale=ko&svcName=map_pcv5&searchText=${enc}`
  );
}

/** KST 기준 YYYYMMDDHHmm */
function formatKstTimestamp(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}`;
}
