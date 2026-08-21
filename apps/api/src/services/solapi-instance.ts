import { SolapiService } from './solapi.js';

// 프로세스 전역 SOLAPI 서비스 싱글턴.
// (기존에 라우트/워커 9개 파일이 각자 지역 사본으로 갖고 있던 것을 통합)
let instance: SolapiService | null = null;

export function getSolapiService(missingCredentialsLog?: string): SolapiService | null {
  if (instance) return instance;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    if (missingCredentialsLog) console.log(missingCredentialsLog);
    return null;
  }
  instance = new SolapiService(apiKey, apiSecret);
  return instance;
}

// 캐시 초기화 (설정 변경 시 호출)
export function clearSolapiInstance(): void {
  instance = null;
}
