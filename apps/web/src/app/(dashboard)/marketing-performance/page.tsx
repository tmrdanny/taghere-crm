'use client';

import { MarketingPerformanceView } from '@/features/marketing-performance/MarketingPerformanceView';

export default function MarketingPerformancePage() {
  return <MarketingPerformanceView apiUrl="/api/marketing-performance" sendHref="/messages" />;
}
