// 고객 마이페이지 로그인 증표 보관·전달
// 로그인 콜백은 /taghere-my#token=... 으로 돌아온다. 해시는 서버 로그·Referer 에 남지 않으며,
// 읽자마자 주소에서 지운다. (useSearchParams 는 해시를 읽지 못해 window.location.hash 를 직접 본다)
import { API_BASE } from '@/lib/api-config';

const TOKEN_KEY = 'taghere_customer_token';
const PENDING_WITHDRAW_KEY = 'taghere_my_pending_withdraw';

export function getCustomerToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearCustomerToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 무시
  }
}

/** 주소 해시의 증표를 저장하고 주소에서 지운다. 저장했으면 true */
export function consumeTokenFromHash(): boolean {
  const hash = window.location.hash;
  if (!hash.startsWith('#token=')) return false;
  let token: string;
  try {
    token = decodeURIComponent(hash.slice('#token='.length));
  } catch {
    // 잘못 인코딩된 해시면 버리고 주소만 정리한다
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 저장 실패 시에도 이번 화면에서는 아래 메모리 값으로 쓴다
  }
  memoryToken = token;
  window.history.replaceState({}, '', window.location.pathname);
  return true;
}

// localStorage 를 못 쓰는 환경을 위한 이번 화면 한정 보관
let memoryToken: string | null = null;

export function currentToken(): string | null {
  return getCustomerToken() ?? memoryToken;
}

export function logoutCustomer() {
  memoryToken = null;
  clearCustomerToken();
}

export function startKakaoLogin() {
  const params = new URLSearchParams({ isMyPage: 'true', origin: window.location.origin });
  window.location.href = `${API_BASE}/auth/kakao/taghere-start?${params.toString()}`;
}

export function startNaverLogin() {
  const params = new URLSearchParams({ origin: window.location.origin });
  window.location.href = `${API_BASE}/auth/naver/my-page-start?${params.toString()}`;
}

/** 탈퇴하려다 재로그인이 필요해 로그인 화면으로 갈 때 표시해 둔다 */
export function markPendingWithdraw() {
  try {
    sessionStorage.setItem(PENDING_WITHDRAW_KEY, '1');
  } catch {
    // 무시
  }
}

export function takePendingWithdraw(): boolean {
  try {
    const pending = sessionStorage.getItem(PENDING_WITHDRAW_KEY) === '1';
    sessionStorage.removeItem(PENDING_WITHDRAW_KEY);
    return pending;
  } catch {
    return false;
  }
}

export class CustomerAuthError extends Error {}

/** 고객 증표를 붙여 API 호출. 401 이면 증표를 지우고 CustomerAuthError 를 던진다 */
export async function customerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = currentToken();
  if (!token) throw new CustomerAuthError('로그인이 필요합니다.');
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) {
    logoutCustomer();
    throw new CustomerAuthError('로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
  return res;
}

/** 로그인 실패로 돌아왔을 때(?error=) 보여줄 문구 */
export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'access_denied':
      return '로그인을 취소했어요.';
    case 'phone_required':
      return '네이버 로그인에서 휴대폰 번호 제공에 동의해야 이용할 수 있어요.';
    case 'naver_not_configured':
      return '지금은 네이버 로그인을 사용할 수 없어요. 카카오로 로그인해주세요.';
    default:
      return '로그인에 실패했습니다. 다시 시도해주세요.';
  }
}
