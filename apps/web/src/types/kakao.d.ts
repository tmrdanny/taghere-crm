interface KakaoAuth {
  authorize(settings: {
    redirectUri: string;
    state?: string;
    scope?: string;
    throughTalk?: boolean;
    serviceTerms?: string;
    prompts?: string;
  }): void;
  logout(callback?: () => void): void;
  getAccessToken(): string | null;
}

interface KakaoStatic {
  init(appKey: string): void;
  isInitialized(): boolean;
  Auth: KakaoAuth;
}

declare global {
  interface Window {
    Kakao: KakaoStatic;
    // 카카오맵 SDK (dapi.kakao.com/v2/maps/sdk.js) — 고객 마이페이지 매장 지도에서만 불러온다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao?: any;
  }
}

export {};
