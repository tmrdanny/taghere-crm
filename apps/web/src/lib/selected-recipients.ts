// 고객 리스트에서 고른 손님을 메시지 발송 화면으로 넘길 때 쓰는 임시 보관함.
// 이름·전화번호를 URL에 실으면 브라우저 기록·분석 도구(GA)·서버 로그에 남으므로,
// 이 탭의 sessionStorage 에만 두고 URL 에는 무작위 키(?selection=키)만 넘긴다.

export interface SelectedRecipient {
  id: string;
  name: string | null;
  phone: string | null;
}

const PREFIX = 'selected-recipients:';

/** 고른 손님을 보관하고 URL 에 넣을 키를 돌려준다 */
export function stashRecipients(list: SelectedRecipient[]): string {
  const key = Math.random().toString(36).slice(2, 10);
  try {
    // 이전에 넘긴 목록은 지운다 (같은 탭에 쌓이지 않게)
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
    sessionStorage.setItem(PREFIX + key, JSON.stringify(list));
  } catch {
    // 저장이 막힌 브라우저면 빈 키 — 발송 화면에서 다시 고르면 된다
  }
  return key;
}

/** 키로 고른 손님을 꺼낸다 (새로고침해도 같은 탭이면 유지) */
export function readRecipients(key: string | null): SelectedRecipient[] {
  if (!key) return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PREFIX + key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
