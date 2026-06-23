// messages 페이지에서 사용하는 타입 및 상수.

export interface TargetCounts {
  all: number;
  revisit: number;
  new: number;
}

export interface EstimatedRevenue {
  avgOrderValue: number;
  conversionRate: number;
  expectedVisits: number;
  expectedRevenue: number;
}

export interface FreeCredits {
  remaining: number;
  freeCount: number;
  paidCount: number;
  isRetargetPage: boolean;
}

export interface Estimate {
  targetCount: number;
  byteLength: number;
  messageType: 'SMS' | 'LMS' | 'MMS';
  costPerMessage: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
  estimatedRevenue?: EstimatedRevenue;
  freeCredits?: FreeCredits;
}

export interface UploadedImage {
  imageUrl: string;
  filename: string;
  imageId: string; // SOLAPI에서 받은 이미지 ID
  width: number;
  height: number;
  size: number;
}

// 이미지 제약 조건 상수
export const IMAGE_MAX_SIZE = 200 * 1024; // 200KB
export const IMAGE_MAX_WIDTH = 1500;
export const IMAGE_MAX_HEIGHT = 1440;

export interface SelectedCustomer {
  id: string;
  name: string | null;
  phone: string | null;
}

// 카카오톡 브랜드 메시지 관련 인터페이스
export interface KakaoButton {
  type: 'WL';
  name: string;
  linkMo: string;
  linkPc?: string;
}

export interface KakaoEstimate {
  targetCount: number;
  messageType: 'TEXT' | 'IMAGE';
  costPerMessage: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
  estimatedRevenue?: EstimatedRevenue;
  freeCredits?: FreeCredits;
}

export interface KakaoUploadedImage {
  imageUrl: string;
  imageId: string;
  filename: string;
}

export interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  visitCount: number;
  totalPoints: number;
  gender: string | null;
  createdAt: string;
  messageCount?: number;
}
