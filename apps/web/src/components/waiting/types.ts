// Waiting Types
export type WaitingOperationStatus = 'ACCEPTING' | 'WALK_IN' | 'PAUSED' | 'CLOSED';
export type WaitingStatus = 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
export type WaitingSource = 'QR' | 'TABLET' | 'MANUAL';
export type CancelReason = 'CUSTOMER_REQUEST' | 'STORE_REASON' | 'OUT_OF_STOCK' | 'NO_SHOW' | 'AUTO_CANCELLED';

export interface WaitingType {
  id: string;
  storeId: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  minPartySize: number;
  maxPartySize: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WaitingItem {
  id: string;
  storeId: string;
  customerId?: string | null;
  waitingTypeId: string;
  waitingNumber: number;
  phone?: string | null;
  phoneLastDigits?: string | null;
  name?: string | null;
  partySize: number;
  memo?: string | null;
  status: WaitingStatus;
  calledAt?: string | null;
  calledCount: number;
  callExpireAt?: string | null;
  seatedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: CancelReason | null;
  estimatedWaitMinutes?: number | null;
  source: WaitingSource;
  consentMarketing: boolean;
  createdAt: string;
  updatedAt: string;
  waitingType?: WaitingType;
}

export interface WaitingSetting {
  id: string;
  storeId: string;
  operationStatus: WaitingOperationStatus;
  pauseMessage?: string | null;
  pauseEndTime?: string | null;
  enabled: boolean;
  maxWaitingCount: number;
  showEstimatedTime: boolean;
  callTimeoutMinutes: number;
  maxCallCount: number;
  autoCancel: boolean;
  quickMemos?: string[] | null;
  waitingNote?: string | null;
  waitingCallNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaitingStats {
  totalTeams: number;
  totalGuests: number;
  estimatedMinutes: number;
  byType: {
    typeId: string;
    typeName: string;
    teams: number;
    estimatedMinutes: number;
  }[];
  byStatus: {
    waiting: number;
    seated: number;
    cancelled: number;
  };
}

export const OPERATION_STATUS_LABELS: Record<WaitingOperationStatus, string> = {
  ACCEPTING: '접수중',
  WALK_IN: '바로입장',
  PAUSED: '일시정지',
  CLOSED: '운영종료',
};

export const OPERATION_STATUS_COLORS: Record<WaitingOperationStatus, string> = {
  ACCEPTING: 'bg-green-500',
  WALK_IN: 'bg-orange-500',
  PAUSED: 'bg-yellow-500',
  CLOSED: 'bg-neutral-400',
};

export const WAITING_STATUS_LABELS: Record<WaitingStatus, string> = {
  WAITING: '대기 중',
  CALLED: '호출 중',
  SEATED: '착석',
  CANCELLED: '취소',
  NO_SHOW: '노쇼',
};

export const SOURCE_LABELS: Record<WaitingSource, string> = {
  QR: 'QR',
  TABLET: '현장',
  MANUAL: '수기',
};

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  CUSTOMER_REQUEST: '고객 요청',
  STORE_REASON: '매장 사정',
  OUT_OF_STOCK: '재고 소진',
  NO_SHOW: '고객 미방문 (노쇼)',
  AUTO_CANCELLED: '자동 취소',
};
