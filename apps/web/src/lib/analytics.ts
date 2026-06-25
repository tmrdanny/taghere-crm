/**
 * GA4 커스텀 이벤트 발사 유틸.
 *
 * gtag는 layout.tsx에서 전역으로 로드된다. SSR이나 gtag 미로드 상황에서는
 * 안전하게 무시하므로 호출부에서 별도 가드가 필요 없다.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params ?? {});
}

/**
 * 로그인한 고객을 GA user_id에 연결한다(이 호출 이후 발사되는 이벤트부터 적용).
 * 익명(user_pseudo_id) 대신 실제 고객 단위 분석을 가능하게 한다.
 */
export function setUserId(userId: string | null | undefined): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('set', { user_id: userId ?? null });
}
