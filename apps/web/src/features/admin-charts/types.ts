export interface TrendData {
  date: string;
  count: number;
  cumulative: number;
}

export interface ExternalCustomerData {
  date: string;
  count: number;
}

export interface VisitSourceDistribution {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

export interface DemographicItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface CorporateAdTrendData {
  date: string;
  alimTalkSent: number;
  alimTalkFailed: number;
  alimTalkTotal: number;
  membershipCount: number;
}

export type ExternalPeriodType = 'daily' | 'weekly' | 'monthly';

export interface AnalyticsData {
  summary: {
    totalIssued: number;
    totalFailed: number;
    successRate: number;
  };
  dailyTrend: { date: string; issued: number }[];
  dailyTrendByBrand: {
    brandId: string;
    brandName: string;
    imageUrl: string;
    series: number[];
  }[];
  byBrand: {
    brandId: string;
    brandName: string;
    imageUrl: string;
    issued: number;
    remainingCodes: number;
    usesCodePool: boolean;
  }[];
  byHour: { hour: number; count: number }[];
  demographics: {
    byGender: { gender: string; count: number }[];
    byAgeGroup: { ageGroup: string; count: number }[];
    byRegion: { region: string; count: number }[];
  };
}
