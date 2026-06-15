// API 서버 base URL (단일 출처).
// NEXT_PUBLIC_ 접두라 클라이언트 번들에 빌드 시 인라인된다.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
