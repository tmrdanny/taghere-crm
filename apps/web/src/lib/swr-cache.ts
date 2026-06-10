// 간단한 stale-while-revalidate 캐시.
// 접속 시 캐시된 데이터를 즉시 보여주고, 백그라운드에서 최신 데이터로 갱신한다.
// sessionStorage 기반이라 탭을 닫으면 사라지며, 키에 토큰 일부를 포함해
// 다른 계정으로 재로그인 시 이전 계정 데이터가 보이지 않도록 한다.

const PREFIX = 'swr-cache:';

export function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    // 쿼터 초과 등은 무시 (캐시는 best-effort)
  }
}

export function cacheKeyFor(token: string, url: string) {
  return `${token.slice(-12)}:${url}`;
}

/**
 * 캐시가 있으면 즉시 apply 호출 → fetch 완료 후 최신 데이터로 다시 apply.
 * apply는 같은 데이터 형태로 최대 2번 호출된다.
 */
export async function fetchJsonCached<T>(
  url: string,
  token: string,
  apply: (data: T) => void
): Promise<void> {
  const key = cacheKeyFor(token, url);
  const cached = readCache<T>(key);
  if (cached !== null) apply(cached);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    const data = (await res.json()) as T;
    apply(data);
    writeCache(key, data);
  }
}
