// ============================================
// 로컬스토리지 헬퍼 함수 (kakaoId 저장용)
// ============================================
const KAKAO_STORAGE_KEY = 'taghere_kakao_id';
const KAKAO_STORAGE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90일

interface StoredKakaoData {
  kakaoId: string;
  savedAt: number;
}

export function getStoredKakaoId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(KAKAO_STORAGE_KEY);
    if (!stored) return null;

    const data: StoredKakaoData = JSON.parse(stored);
    const now = Date.now();

    // 만료 체크 (90일)
    if (now - data.savedAt > KAKAO_STORAGE_EXPIRY_MS) {
      localStorage.removeItem(KAKAO_STORAGE_KEY);
      return null;
    }

    return data.kakaoId;
  } catch {
    localStorage.removeItem(KAKAO_STORAGE_KEY);
    return null;
  }
}

export function saveKakaoId(kakaoId: string): void {
  if (typeof window === 'undefined') return;

  const data: StoredKakaoData = {
    kakaoId,
    savedAt: Date.now(),
  };
  localStorage.setItem(KAKAO_STORAGE_KEY, JSON.stringify(data));
}

export function removeStoredKakaoId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KAKAO_STORAGE_KEY);
}
