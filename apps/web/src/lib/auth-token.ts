// localStorage 인증 토큰 조회 헬퍼 (역할별 키 분리, SSR 안전).
// - 매장 사장님: 'token' / 관리자: 'adminToken' / 프랜차이즈: 'franchiseToken'

export function getStoreToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

export function getFranchiseToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('franchiseToken') || '';
}
