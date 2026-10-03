// 사장님 리포트 — API services/owner-notice/report.ts 의 OwnerReport 와 같은 모양
export interface PeriodStats {
  from: string;
  to: string;
  visitors: number;
  returning: number;
  newCustomers: number;
  revenue: number;
}

export interface WalletStatus {
  balance: number;
  dailySpend: number;
  daysLeft: number | null;
  skipped7d: number;
  skippedEarn7d: number;
  freeCreditsLeft: number;
  freeCreditsTotal: number;
  state: 'OK' | 'LOW' | 'EMPTY';
}

export interface AutomationSuggestion {
  type: 'FIRST_VISIT_FOLLOWUP' | 'CHURN_PREVENTION' | 'BIRTHDAY' | string;
  label: string;
  enabled: boolean;
  audience: number;
  why: string;
}

export interface OwnerReport {
  store: { id: string; name: string };
  thisWeek: PeriodStats;
  lastWeek: PeriodStats;
  marketing: { days: number; recipients: number; revisited: number; revenue: number; cost: number };
  wallet: WalletStatus;
  automation: { enabledCount: number; items: AutomationSuggestion[]; naverPlaceReady: boolean };
  headline: string;
  reportOptOut: boolean;
  notifyPhone: string | null;
}

export const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
export const num = (v: number) => Math.round(v).toLocaleString('ko-KR');

/** 큰 금액은 만원 단위로 (3,835,000 → 384만원) */
export const shortWon = (v: number) => (v >= 100000 ? `${num(Math.round(v / 10000))}만원` : won(v));

export const mdOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export const periodLabel = (p: PeriodStats) => `${mdOf(p.from)} ~ ${mdOf(new Date(new Date(p.to).getTime() - 1).toISOString())}`;
