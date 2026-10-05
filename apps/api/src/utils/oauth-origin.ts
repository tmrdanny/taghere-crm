// OAuth 로그인 후 돌아갈 웹 주소 허용 목록.
// state 는 서명되지 않은 base64 JSON 이라 누구나 위조할 수 있으므로,
// 시작 단계뿐 아니라 콜백에서도 반드시 이 목록으로 다시 검사한다.

export const ALLOWED_OAUTH_ORIGINS = [
  'http://localhost:3000',
  'https://taghere-crm-web-dev.onrender.com',
  'https://taghere-crm-web-g96p.onrender.com',
];

/** 허용된 주소면 그대로, 아니면 fallback 을 돌려준다 */
export function resolveOAuthOrigin(origin: unknown, fallback: string): string {
  return typeof origin === 'string' && ALLOWED_OAUTH_ORIGINS.includes(origin) ? origin : fallback;
}
