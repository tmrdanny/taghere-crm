// Shared configuration exports

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const APP_CONFIG = {
  appName: '태그히어 CRM',
  version: '1.0.0',
  reviewCostPerSend: 50, // 리뷰 요청 건당 비용 (원)
  autoTopupAmounts: [50000, 100000, 300000, 500000], // 자동충전 금액 옵션
  defaultAutoTopupThreshold: 10000, // 기본 자동충전 임계값
} as const;
