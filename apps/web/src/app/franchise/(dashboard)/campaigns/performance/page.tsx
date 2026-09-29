'use client';

import { MarketingPerformanceView } from '@/features/marketing-performance/MarketingPerformanceView';

export default function FranchiseMarketingPerformancePage() {
  return <MarketingPerformanceView apiUrl="/api/franchise/marketing-performance" tokenKey="franchiseToken" sendHref="/franchise/campaigns/retarget" boosterHref="/franchise/campaigns/place-booster" franchise />;
}
