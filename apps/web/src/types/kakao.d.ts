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
  }
}

export {};
