'use client';

import { useEffect, useRef, useState } from 'react';

interface TemplateVariableRow {
  variable: string;
  value: string;
}

interface CouponData {
  id: string;
  brandName: string;
  imageUrl: string;
  displayOrder: number;
  templateId: string;
  couponName: string;
  couponContent: string;
  couponAmount: string;
  amountValue: number;
  expiryDate: string;
  registrationMethod: string;
  landingLink: string;
  couponLink: string;
  templateVariables: TemplateVariableRow[] | null;
  couponCodeVariable: string;
  enabled: boolean;
}

interface CodeStats {
  total: number;
  used: number;
  available: number;
}

interface CodeRow {
  id: string;
  code: string;
  usedAt: string | null;
  usedByCustomerId: string | null;
  createdAt: string;
}

const emptyCoupon: Omit<CouponData, 'id'> = {
  brandName: '',
  imageUrl: '',
  displayOrder: 0,
  templateId: 'KA01TP250930075547299ikOWJ6bArTY',
  couponName: '',
  couponContent: '',
  couponAmount: '',
  amountValue: 0,
  expiryDate: '',
  registrationMethod: '',
  landingLink: '',
  couponLink: '',
  templateVariables: [],
  couponCodeVariable: '',
  enabled: true,
};

const DEFAULT_VARIABLE_PRESET: TemplateVariableRow[] = [
  { variable: '#{쿠폰명}', value: '' },
  { variable: '#{쿠폰 내용}', value: '' },
  { variable: '#{쿠폰 금액}', value: '' },
  { variable: '#{유효기간}', value: '' },
  { variable: '#{등록방법}', value: '' },
  { variable: '#{랜딩 링크}', value: '' },
  { variable: '#{쿠폰 링크}', value: '' },
];

// 페이지 표시용 필드 (멤버십 페이지 UI에 사용)
const DISPLAY_FIELDS = [
  { key: 'brandName' as const, label: '브랜드명', placeholder: '예: 세븐일레븐' },
  { key: 'imageUrl' as const, label: '브랜드 아이콘 URL', placeholder: 'https://...png' },
  { key: 'couponName' as const, label: '쿠폰명 (시트 표시용)', placeholder: '예: 세븐일레븐 5,000원 쿠폰' },
  { key: 'couponAmount' as const, label: '쿠폰 금액 (표시용 텍스트)', placeholder: '예: 5,000원' },
  { key: 'amountValue' as const, label: '쿠폰 금액 (숫자, 합계 계산용)', placeholder: '예: 5000' },
  { key: 'expiryDate' as const, label: '유효기간 (시트 표시용)', placeholder: '예: 2026.04.30' },
];

// ============================================
// 성과 분석 섹션 (일자별/브랜드별/시간대별/인구통계)
// ============================================
interface AnalyticsData {
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

type AnalyticsPeriod = '7' | '30' | '90' | 'all';

const CHART_PALETTE = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

const GENDER_LABEL: Record<string, string> = {
  MALE: '남성',
  FEMALE: '여성',
  UNKNOWN: '미상',
};

const AGE_GROUP_LABEL: Record<string, string> = {
  TWENTIES: '20대',
  THIRTIES: '30대',
  FORTIES: '40대',
  FIFTIES: '50대',
  SIXTY_PLUS: '60대+',
  UNKNOWN: '미상',
};

function AnalyticsSummaryCards({ summary }: { summary: AnalyticsData['summary'] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">총 발행 쿠폰</p>
        <p className="text-2xl font-bold text-neutral-900 mt-1">
          {summary.totalIssued.toLocaleString()}
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">알림톡 발송 성공 건수</p>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">발송 실패</p>
        <p className="text-2xl font-bold text-red-600 mt-1">
          {summary.totalFailed.toLocaleString()}
        </p>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">발송 성공률</p>
        <p className="text-2xl font-bold text-emerald-600 mt-1">
          {summary.successRate}%
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">성공 / (성공+실패)</p>
      </div>
    </div>
  );
}

function DailyIssuedChart({
  dates,
  brands,
}: {
  dates: string[];
  brands: AnalyticsData['dailyTrendByBrand'];
}) {
  const [hoveredX, setHoveredX] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  if (dates.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }

  // 전체 최대값 (브랜드 중 가장 높은 일자 값)
  const max = Math.max(
    1,
    ...brands.flatMap((b) => b.series),
  );

  const yLabels = [max, Math.round(max / 2), 0];
  const xLabels =
    dates.length > 2
      ? [dates[0].slice(5), dates[Math.floor(dates.length / 2)].slice(5), dates[dates.length - 1].slice(5)]
      : dates.map((d) => d.slice(5));

  // 각 브랜드의 path 생성
  const brandPaths = brands.map((brand, idx) => {
    const points = brand.series.map((value, i) => {
      const x = (i / (dates.length - 1 || 1)) * 100;
      const y = 100 - (value / max) * 100;
      return { x, y, value };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return {
      ...brand,
      path,
      points,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    };
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    // 가장 가까운 날짜 인덱스
    const idx = Math.round((x / 100) * (dates.length - 1));
    setHoveredX(Math.max(0, Math.min(dates.length - 1, idx)));
  };

  const hoveredDate = hoveredX !== null ? dates[hoveredX] : null;
  const hoveredXPercent = hoveredX !== null ? (hoveredX / (dates.length - 1 || 1)) * 100 : 0;

  return (
    <div className="w-full">
      {/* 범례 */}
      {brandPaths.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs">
          {brandPaths.map((b) => (
            <div key={b.brandId} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: b.color }} />
              <span className="text-neutral-700">{b.brandName}</span>
            </div>
          ))}
        </div>
      )}

      <div className="w-full h-[240px] relative">
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[11px] text-neutral-400">
          {yLabels.map((l, i) => (
            <span key={i}>{l.toLocaleString()}</span>
          ))}
        </div>
        <div
          ref={chartRef}
          className="absolute left-12 right-0 top-0 bottom-6 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredX(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* 가로 그리드 */}
            <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

            {/* 브랜드별 라인 */}
            {brandPaths.map((b) => (
              <path
                key={b.brandId}
                d={b.path}
                fill="none"
                stroke={b.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* 호버 라인 */}
            {hoveredX !== null && (
              <>
                <line
                  x1={hoveredXPercent}
                  y1="0"
                  x2={hoveredXPercent}
                  y2="100"
                  stroke="#9CA3AF"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="4 4"
                />
                {brandPaths.map((b) => {
                  const p = b.points[hoveredX];
                  if (!p) return null;
                  return (
                    <circle
                      key={b.brandId}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill={b.color}
                      stroke="white"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </>
            )}
          </svg>

          {/* 툴팁 */}
          {hoveredX !== null && hoveredDate && brandPaths.length > 0 && (
            <div
              className="absolute bg-neutral-900 text-white text-[12px] px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
              style={{
                left: `${Math.min(Math.max(hoveredXPercent, 15), 85)}%`,
                top: '-8px',
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="font-medium mb-1">{hoveredDate}</p>
              {brandPaths.map((b) => (
                <p key={b.brandId} style={{ color: b.color }}>
                  {b.brandName}: {b.points[hoveredX]?.value.toLocaleString() || 0}건
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="absolute left-12 right-0 bottom-0 flex justify-between text-[11px] text-neutral-400">
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrandHorizontalBars({ data }: { data: AnalyticsData['byBrand'] }) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">브랜드가 없습니다.</p>;
  }
  const max = Math.max(...data.map((b) => b.issued), 1);
  return (
    <div className="space-y-3">
      {data.map((b, idx) => {
        const width = (b.issued / max) * 100;
        const lowStock = b.usesCodePool && b.remainingCodes < 100;
        const color = CHART_PALETTE[idx % CHART_PALETTE.length];
        return (
          <div key={b.brandId} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-neutral-100 overflow-hidden flex-shrink-0">
              {b.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt={b.brandName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
                  {b.brandName.charAt(0) || '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-neutral-900 truncate">{b.brandName || '(이름 없음)'}</p>
                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                  <span className="font-semibold text-neutral-900">{b.issued.toLocaleString()}건</span>
                  {b.usesCodePool ? (
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        lowStock ? 'bg-red-50 text-red-600' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      남은 {b.remainingCodes.toLocaleString()}
                    </span>
                  ) : (
                    <span
                      className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400"
                      title="난수 코드 사용 안 함"
                    >
                      코드 미사용
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, backgroundColor: color }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyBarChart({ data }: { data: AnalyticsData['byHour'] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full h-[180px] flex flex-col">
      <div className="flex-1 flex items-end gap-[2px] pb-6">
        {data.map((d, i) => {
          const height = (d.count / max) * 100;
          const isHovered = hovered === i;
          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHovered && d.count > 0 && (
                <div className="absolute bottom-full mb-1 bg-neutral-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {d.hour}시: {d.count}건
                </div>
              )}
              <div
                className="w-full rounded-t transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: d.count > 0 ? '3px' : '0px',
                  backgroundColor: '#6BA3FF',
                  opacity: hovered === null || isHovered ? 1 : 0.5,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] text-[9px] text-neutral-400 pt-1 border-t border-neutral-200">
        {data.map((d) => (
          <div key={d.hour} className="flex-1 text-center">
            {d.hour % 3 === 0 ? d.hour : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function GenderPieChart({ data }: { data: AnalyticsData['demographics']['byGender'] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }

  let currentAngle = -90;
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 360;
    const start = currentAngle;
    const end = start + angle;
    currentAngle = end;
    const startRad = (start * Math.PI) / 180;
    const endRad = (end * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    return {
      d: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
      label: GENDER_LABEL[d.gender] || d.gender,
      count: d.count,
      pct: total > 0 ? (d.count / total) * 100 : 0,
    };
  });

  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 h-full">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill={s.color}
              stroke="#fff"
              strokeWidth="0.5"
              opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.5}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
        </svg>
      </div>
      <div className="w-1/2 pl-3 flex flex-col justify-center gap-2">
        {slices.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
            <span className="text-neutral-700 flex-1">{s.label}</span>
            <span className="text-neutral-500">
              {s.count}명 ({s.pct.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBarChart({
  data,
  labelMap,
}: {
  data: { key: string; count: number }[];
  labelMap?: Record<string, string>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex items-end gap-2 pb-6">
        {data.map((d, i) => {
          const height = (d.count / max) * 100;
          const isH = hovered === i;
          const label = labelMap?.[d.key] || d.key;
          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isH && (
                <div className="absolute bottom-full mb-1 bg-neutral-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {label}: {d.count}명
                </div>
              )}
              <div
                className="w-full rounded-t transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: d.count > 0 ? '4px' : '0px',
                  backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
                  opacity: hovered === null || isH ? 1 : 0.5,
                }}
              />
              <span className="absolute bottom-[-18px] text-[10px] text-neutral-500">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pt-2 border-t border-neutral-200">
        {data.map((d, i) => {
          const label = labelMap?.[d.key] || d.key;
          return (
            <div key={i} className="flex-1 text-center text-[10px] text-neutral-600 truncate" title={label}>
              {label.length > 8 ? label.slice(0, 7) + '…' : label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegionBarChart({ data }: { data: AnalyticsData['demographics']['byRegion'] }) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const width = (d.count / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate text-neutral-700" title={d.region}>
              {d.region}
            </span>
            <div className="flex-1 h-4 bg-neutral-100 rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: `${width}%`,
                  backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
                }}
              />
            </div>
            <span className="w-10 text-right text-neutral-600 font-medium">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function CorporateAdAnalyticsSection({ apiUrl }: { apiUrl: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('30');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}/api/admin/corporate-ad-analytics?days=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error('Failed to fetch analytics:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [period, apiUrl]);

  return (
    <div className="mb-8 space-y-4">
      {/* 기간 필터 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">성과 분석</h2>
        <div className="flex gap-1">
          {(['7', '30', '90', 'all'] as AnalyticsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-[#EAEAEA] text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {p === 'all' ? '전체' : `${p}일`}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-12 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <AnalyticsSummaryCards summary={data.summary} />

          {/* 일자별 트렌드 (브랜드별 멀티라인) */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">일자별 쿠폰 발행량</h3>
            <DailyIssuedChart
              dates={data.dailyTrend.map((d) => d.date)}
              brands={data.dailyTrendByBrand}
            />
          </div>

          {/* 브랜드별 + 시간대별 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">브랜드별 발행량</h3>
              <BrandHorizontalBars data={data.byBrand} />
            </div>
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">시간대별 발행량</h3>
              <HourlyBarChart data={data.byHour} />
            </div>
          </div>

          {/* 인구통계 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">성별</h3>
              <div className="h-[180px]">
                <GenderPieChart data={data.demographics.byGender} />
              </div>
            </div>
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">연령대</h3>
              <div className="h-[180px]">
                <CategoryBarChart
                  data={data.demographics.byAgeGroup.map((a) => ({ key: a.ageGroup, count: a.count }))}
                  labelMap={AGE_GROUP_LABEL}
                />
              </div>
            </div>
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">지역 TOP 10</h3>
              <RegionBarChart data={data.demographics.byRegion} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// 쿠폰 코드 풀 관리 컴포넌트
// ============================================
function CouponCodePoolSection({
  couponId,
  apiUrl,
  onToast,
}: {
  couponId: string;
  apiUrl: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [stats, setStats] = useState<CodeStats | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'used' | 'available'>('all');
  const [totalPages, setTotalPages] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const PAGE_SIZE = 100;

  const fetchStats = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${couponId}/codes/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch {
      // ignore
    }
  };

  const fetchCodes = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/corporate-ads/${couponId}/codes?page=${page}&limit=${PAGE_SIZE}&filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setCodes(data.codes);
        setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponId]);

  useEffect(() => {
    fetchCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  const handleUpload = async (file: File) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    if (!file.name.match(/\.(txt|csv)$/i)) {
      onToast('.txt 또는 .csv 파일만 업로드 가능합니다.', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${couponId}/codes/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onToast(
          `${data.inserted.toLocaleString()}개 추가됨 (중복 ${data.skipped.toLocaleString()}개 스킵)`,
          'success',
        );
        await fetchStats();
        setPage(1);
        await fetchCodes();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || '업로드에 실패했습니다.', 'error');
      }
    } catch {
      onToast('업로드 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    if (!confirm('이 코드를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${couponId}/codes/${codeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchStats();
        await fetchCodes();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || '삭제 실패', 'error');
      }
    } catch {
      onToast('삭제 중 오류', 'error');
    }
  };

  const handleDeleteAllUnused = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    if (!confirm(`미사용 코드 ${stats?.available?.toLocaleString() || 0}개를 모두 삭제할까요?`)) {
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${couponId}/codes`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        onToast(`${data.deleted.toLocaleString()}개 삭제 완료`, 'success');
        await fetchStats();
        setPage(1);
        await fetchCodes();
      }
    } catch {
      onToast('일괄 삭제 중 오류', 'error');
    }
  };

  const handleShuffle = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    if (!confirm(`미사용 코드 ${stats?.available?.toLocaleString() || 0}개의 발급 순서를 무작위로 섞을까요?`)) {
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${couponId}/codes/shuffle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        onToast(`${data.shuffled.toLocaleString()}개 코드 순서를 섞었습니다.`, 'success');
        setPage(1);
        await fetchCodes();
      } else {
        onToast('섞기에 실패했습니다.', 'error');
      }
    } catch {
      onToast('섞기 중 오류', 'error');
    }
  };

  return (
    <div className="space-y-3">
      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">총</p>
            <p className="text-lg font-semibold text-neutral-900">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">사용</p>
            <p className="text-lg font-semibold text-neutral-900">{stats.used.toLocaleString()}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500">남은</p>
            <p
              className={`text-lg font-semibold ${
                stats.available < 100 ? 'text-red-600' : 'text-neutral-900'
              }`}
            >
              {stats.available.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* 업로드 영역 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleUpload(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 hover:border-neutral-400'
        } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        <p className="text-sm text-neutral-700 font-medium">
          {uploading ? '업로드 중...' : '.txt 또는 .csv 파일을 드래그하거나 클릭'}
        </p>
        <p className="text-xs text-neutral-400 mt-1">한 줄당 코드 1개 (최대 30MB / 약 50만 개)</p>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-xs">
          {(['all', 'available', 'used'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {f === 'all' ? '전체' : f === 'available' ? '미사용' : '사용됨'}
            </button>
          ))}
        </div>
        {stats && stats.available > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleShuffle}
              className="text-xs text-neutral-700 hover:underline"
            >
              🔀 무작위로 섞기
            </button>
            <button
              onClick={handleDeleteAllUnused}
              className="text-xs text-red-600 hover:underline"
            >
              미사용 전체 삭제
            </button>
          </div>
        )}
      </div>

      {/* 코드 리스트 */}
      <div className="border border-[#EAEAEA] rounded-lg overflow-hidden">
        {codes.length === 0 ? (
          <p className="text-center text-sm text-neutral-400 py-6">코드가 없습니다.</p>
        ) : (
          <div className="divide-y divide-[#EAEAEA]">
            {codes.map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                <span className="font-mono text-neutral-900 flex-1 truncate">{c.code}</span>
                {c.usedAt ? (
                  <span className="text-xs text-neutral-400">
                    사용됨 {new Date(c.usedAt).toLocaleString('ko-KR')}
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-green-600">미사용</span>
                    <button
                      onClick={() => handleDeleteCode(c.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-neutral-300 disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-neutral-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-neutral-300 disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

export default function CorporateAdPage() {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<CouponData | (Omit<CouponData, 'id'> & { id?: string }) | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchCoupons();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchCoupons = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data);
      }
    } catch (error) {
      console.error('Failed to fetch coupons:', error);
      setToast({ message: '쿠폰 목록을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing({ ...emptyCoupon, displayOrder: coupons.length });
  };

  const handleEdit = (coupon: CouponData) => {
    setEditing(coupon);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 쿠폰을 삭제하시겠습니까?')) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCoupons(coupons.filter((c) => c.id !== id));
        setToast({ message: '쿠폰이 삭제되었습니다.', type: 'success' });
      }
    } catch {
      setToast({ message: '삭제에 실패했습니다.', type: 'error' });
    }
  };

  const handleToggleEnabled = async (coupon: CouponData) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !coupon.enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCoupons(coupons.map((c) => (c.id === updated.id ? updated : c)));
      }
    } catch {
      setToast({ message: '토글 실패', type: 'error' });
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= coupons.length) return;
    const newCoupons = [...coupons];
    [newCoupons[index], newCoupons[target]] = [newCoupons[target], newCoupons[index]];
    setCoupons(newCoupons);

    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      await fetch(`${apiUrl}/api/admin/corporate-ads/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orders: newCoupons.map((c, i) => ({ id: c.id, displayOrder: i })),
        }),
      });
    } catch {
      setToast({ message: '순서 변경 실패', type: 'error' });
      fetchCoupons();
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setIsSaving(true);
    try {
      const isNew = !('id' in editing) || !editing.id;
      const url = isNew
        ? `${apiUrl}/api/admin/corporate-ads`
        : `${apiUrl}/api/admin/corporate-ads/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        await fetchCoupons();
        setEditing(null);
        setToast({ message: isNew ? '쿠폰이 추가되었습니다.' : '쿠폰이 저장되었습니다.', type: 'success' });
      } else {
        setToast({ message: '저장에 실패했습니다.', type: 'error' });
      }
    } catch {
      setToast({ message: '저장 중 오류', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">기업광고 쿠폰</h1>
          <p className="text-sm text-neutral-500 mt-1">
            멤버십 가입 시 발송되는 쿠폰 목록을 관리합니다 (다중 브랜드 지원)
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
        >
          + 쿠폰 추가
        </button>
      </div>

      {/* 성과 분석 섹션 */}
      <CorporateAdAnalyticsSection apiUrl={apiUrl} />

      {/* Coupons List */}
      {coupons.length === 0 ? (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-12 text-center">
          <p className="text-sm text-neutral-500">등록된 쿠폰이 없습니다.</p>
          <button
            onClick={handleAdd}
            className="mt-3 text-sm text-neutral-900 font-medium underline"
          >
            첫 쿠폰 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon, index) => (
            <div
              key={coupon.id}
              className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex items-center gap-4"
            >
              {/* 순서 변경 */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                  aria-label="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(index, 1)}
                  disabled={index === coupons.length - 1}
                  className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                  aria-label="아래로"
                >
                  ▼
                </button>
              </div>

              {/* 이미지 */}
              <div className="w-14 h-14 rounded-full bg-neutral-100 overflow-hidden flex-shrink-0">
                {coupon.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coupon.imageUrl} alt={coupon.brandName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">No img</div>
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {coupon.brandName || '(브랜드명 없음)'} · {coupon.couponAmount || '0원'}
                </p>
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                  {coupon.couponName || '(쿠폰명 없음)'}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  유효기간: {coupon.expiryDate || '미설정'}
                </p>
              </div>

              {/* 토글 */}
              <button
                onClick={() => handleToggleEnabled(coupon)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  coupon.enabled ? 'bg-neutral-900' : 'bg-neutral-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    coupon.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>

              {/* 액션 */}
              <button
                onClick={() => handleEdit(coupon)}
                className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md"
              >
                편집
              </button>
              <button
                onClick={() => handleDelete(coupon.id)}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-neutral-900">
                {('id' in editing && editing.id) ? '쿠폰 편집' : '새 쿠폰 추가'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-neutral-400 hover:text-neutral-900">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Enabled */}
              <div className="flex items-center justify-between pb-4 border-b border-[#EAEAEA]">
                <p className="text-sm font-medium text-neutral-900">활성화</p>
                <button
                  onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editing.enabled ? 'bg-neutral-900' : 'bg-neutral-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      editing.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Template ID */}
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-1.5">
                  SOLAPI 템플릿 ID
                </label>
                <input
                  type="text"
                  value={editing.templateId}
                  onChange={(e) => setEditing({ ...editing, templateId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                />
              </div>

              {/* 표시용 필드 (멤버십 페이지에 노출) */}
              <div className="pt-2">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                  멤버십 페이지 표시 정보
                </p>
                <div className="space-y-3">
                  {DISPLAY_FIELDS.map((field) => {
                    const isNumber = field.key === 'amountValue';
                    const isImage = field.key === 'imageUrl';
                    return (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                          {field.label}
                        </label>
                        <input
                          type={isNumber ? 'number' : 'text'}
                          value={(editing as any)[field.key] ?? ''}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              [field.key]: isNumber
                                ? parseInt(e.target.value || '0') || 0
                                : e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                          placeholder={field.placeholder}
                        />
                        {isImage && editing.imageUrl && (
                          <div className="mt-2 w-16 h-16 rounded-full bg-neutral-100 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={editing.imageUrl} alt="preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 알림톡 템플릿 변수 (동적) */}
              <div className="pt-4 border-t border-[#EAEAEA]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      알림톡 템플릿 변수
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      SOLAPI 템플릿에 정의된 #{'{변수명}'} 그대로 입력하세요
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = editing.templateVariables ?? [];
                      // 이미 있는 변수는 제외하고 추가
                      const existing = new Set(current.map((r) => r.variable));
                      const additions = DEFAULT_VARIABLE_PRESET.filter(
                        (r) => !existing.has(r.variable),
                      );
                      setEditing({
                        ...editing,
                        templateVariables: [...current, ...additions],
                      });
                    }}
                    className="text-xs text-neutral-700 underline"
                  >
                    기본 변수 7개 추가
                  </button>
                </div>

                <div className="space-y-2">
                  {(editing.templateVariables ?? []).map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={row.variable}
                        onChange={(e) => {
                          const next = [...(editing.templateVariables ?? [])];
                          next[idx] = { ...next[idx], variable: e.target.value };
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        placeholder="#{변수명}"
                        className="flex-1 px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm font-mono"
                      />
                      <textarea
                        value={row.value}
                        onChange={(e) => {
                          const next = [...(editing.templateVariables ?? [])];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        placeholder="값 (여러 줄 입력 가능)"
                        rows={1}
                        className="flex-[2] px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm resize-y min-h-[38px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(editing.templateVariables ?? [])];
                          next.splice(idx, 1);
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {(!editing.templateVariables || editing.templateVariables.length === 0) && (
                    <p className="text-xs text-neutral-400 py-2">
                      변수가 없으면 아래 (legacy) 필드를 사용하여 자동 매핑됩니다.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(editing.templateVariables ?? []), { variable: '', value: '' }];
                      setEditing({ ...editing, templateVariables: next });
                    }}
                    className="w-full py-2 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
                  >
                    + 변수 추가
                  </button>
                </div>
              </div>

              {/* 난수 쿠폰 코드 풀 */}
              <div className="pt-4 border-t border-[#EAEAEA]">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                  난수 쿠폰 코드 풀
                </p>
                <p className="text-xs text-neutral-400 mb-3">
                  알림톡 발송 시 미사용 코드 1개를 자동으로 아래 변수에 주입합니다.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    쿠폰 코드 변수명
                  </label>
                  <input
                    type="text"
                    value={editing.couponCodeVariable ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, couponCodeVariable: e.target.value })
                    }
                    placeholder="예: #{쿠폰코드}  (비워두면 코드 풀 미사용)"
                    className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm font-mono"
                  />
                </div>

                {'id' in editing && editing.id ? (
                  <CouponCodePoolSection
                    couponId={editing.id}
                    apiUrl={apiUrl}
                    onToast={(message, type) => setToast({ message, type })}
                  />
                ) : (
                  <p className="text-xs text-neutral-400 py-3 text-center bg-neutral-50 rounded-lg">
                    먼저 쿠폰을 저장하면 코드를 업로드할 수 있습니다.
                  </p>
                )}
              </div>

              {/* (Legacy) 표준 변수 폴백 필드 */}
              <details className="pt-4 border-t border-[#EAEAEA]">
                <summary className="text-xs font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer">
                  (Legacy) 표준 변수 폴백 필드
                </summary>
                <p className="text-xs text-neutral-400 mt-1 mb-3">
                  위 템플릿 변수가 비어있을 때만 아래 값으로 자동 매핑됩니다.
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'couponContent' as const, label: '쿠폰 내용', variable: '#{쿠폰 내용}' },
                    { key: 'registrationMethod' as const, label: '등록방법', variable: '#{등록방법}' },
                    { key: 'landingLink' as const, label: '랜딩 링크', variable: '#{랜딩 링크}' },
                    { key: 'couponLink' as const, label: '쿠폰 링크', variable: '#{쿠폰 링크}' },
                  ].map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-sm font-medium text-neutral-700">{field.label}</label>
                        <span className="text-xs text-neutral-400 font-mono bg-neutral-50 px-1.5 py-0.5 rounded">
                          {field.variable}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={(editing as any)[field.key] ?? ''}
                        onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-[#EAEAEA] px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.type === 'success' ? 'bg-neutral-900 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
