'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useRef, useState } from 'react';
import { Shuffle, X } from 'lucide-react';
import {
  AnalyticsData,
  AnalyticsSummaryCards,
  CHART_PALETTE,
  CategoryBarChart,
  DailyIssuedChart,
  GenderPieChart,
  HourlyBarChart,
  RegionBarChart,
} from '@/features/admin-charts';

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
type AnalyticsPeriod = '7' | '30' | '90' | 'all';

const AGE_GROUP_LABEL: Record<string, string> = {
  TEENS: '10대',
  TWENTIES: '20대',
  THIRTIES: '30대',
  FORTIES: '40대',
  FIFTIES: '50대',
  SIXTY_PLUS: '60대+',
  UNKNOWN: '미상',
};

function BrandHorizontalBars({ data }: { data: AnalyticsData['byBrand'] }) {
  if (data.length === 0) {
    return <p className="text-center text-[13px] text-[color:var(--ad-faint)] py-8">브랜드가 없습니다.</p>;
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
            <div className="w-9 h-9 rounded-full bg-[color:var(--ad-bg)] overflow-hidden flex-shrink-0">
              {b.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt={b.brandName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[color:var(--ad-faint)] text-[11.5px]">
                  {b.brandName.charAt(0) || '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-medium text-[color:var(--ad-ink)] truncate">{b.brandName || '(이름 없음)'}</p>
                <div className="flex items-center gap-2 text-[11.5px] flex-shrink-0">
                  <span className="font-semibold text-[color:var(--ad-ink)] ad-tnum">{b.issued.toLocaleString()}건</span>
                  {b.usesCodePool ? (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ad-tnum ${
                        lowStock ? 'bg-[#ffc4d0] text-[color:var(--ad-neg)]' : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]'
                      }`}
                    >
                      남은 {b.remainingCodes.toLocaleString()}
                    </span>
                  ) : (
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)]"
                      title="난수 코드 사용 안 함"
                    >
                      코드 미사용
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-[color:var(--ad-bg)] rounded-full overflow-hidden">
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

function CorporateAdAnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('30');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/admin/corporate-ad-analytics?days=${period}`, {
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
  }, [period]);

  return (
    <div className="mb-8 space-y-4">
      {/* 기간 필터 */}
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[color:var(--ad-ink)]">성과 분석</h2>
        <div className="flex gap-0.5 rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
          {(['7', '30', '90', 'all'] as AnalyticsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors ${
                period === p
                  ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
              }`}
            >
              {p === 'all' ? '전체' : `${p}일`}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="ad-card p-12 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <AnalyticsSummaryCards summary={data.summary} />

          {/* 일자별 트렌드 (브랜드별 멀티라인) */}
          <div className="ad-card p-5">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">일자별 쿠폰 발행량</h3>
            <DailyIssuedChart
              dates={data.dailyTrend.map((d) => d.date)}
              brands={data.dailyTrendByBrand}
            />
          </div>

          {/* 브랜드별 + 시간대별 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">브랜드별 발행량</h3>
              <BrandHorizontalBars data={data.byBrand} />
            </div>
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">시간대별 발행량</h3>
              <HourlyBarChart data={data.byHour} />
            </div>
          </div>

          {/* 인구통계 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">성별</h3>
              <div className="h-[180px]">
                <GenderPieChart data={data.demographics.byGender} />
              </div>
            </div>
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">연령대</h3>
              <div className="h-[180px]">
                <CategoryBarChart
                  data={data.demographics.byAgeGroup.map((a) => ({ key: a.ageGroup, count: a.count }))}
                  labelMap={AGE_GROUP_LABEL}
                />
              </div>
            </div>
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">지역 TOP 10</h3>
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
  onToast,
}: {
  couponId: string;
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${couponId}/codes/stats`, {
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
        `${API_BASE}/api/admin/corporate-ads/${couponId}/codes?page=${page}&limit=${PAGE_SIZE}&filter=${filter}`,
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${couponId}/codes/upload`, {
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${couponId}/codes/${codeId}`, {
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${couponId}/codes`, {
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${couponId}/codes/shuffle`, {
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
        <div className="grid grid-cols-3 rounded-[12px] border border-[color:var(--ad-line)]">
          <div className="p-3 text-center">
            <p className="text-[12px] text-[color:var(--ad-muted)]">총</p>
            <p className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--ad-ink)] ad-tnum">{stats.total.toLocaleString()}</p>
          </div>
          <div className="p-3 text-center border-l border-[color:var(--ad-line)]">
            <p className="text-[12px] text-[color:var(--ad-muted)]">사용</p>
            <p className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--ad-ink)] ad-tnum">{stats.used.toLocaleString()}</p>
          </div>
          <div className="p-3 text-center border-l border-[color:var(--ad-line)]">
            <p className="text-[12px] text-[color:var(--ad-muted)]">남은</p>
            <p
              className={`text-[20px] font-semibold tracking-[-0.03em] ad-tnum ${
                stats.available < 100 ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-ink)]'
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
        className={`border-2 border-dashed rounded-[12px] p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-[color:var(--ad-navy)] bg-[color:var(--ad-blue-soft)]' : 'border-[color:var(--ad-line-strong)] hover:border-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg-alt)]'
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
        <p className="text-[13px] text-[color:var(--ad-ink-2)] font-medium">
          {uploading ? '업로드 중...' : '.txt 또는 .csv 파일을 드래그하거나 클릭'}
        </p>
        <p className="text-[12px] text-[color:var(--ad-faint)] mt-1">한 줄당 코드 1개 (최대 30MB / 약 50만 개)</p>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5 rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px] text-[12px]">
          {(['all', 'available', 'used'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-[8px] font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
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
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
            >
              <Shuffle className="w-3.5 h-3.5" />
              무작위로 섞기
            </button>
            <button
              onClick={handleDeleteAllUnused}
              className="text-[12.5px] font-medium text-[color:var(--ad-neg)] hover:underline"
            >
              미사용 전체 삭제
            </button>
          </div>
        )}
      </div>

      {/* 코드 리스트 */}
      <div className="border border-[color:var(--ad-line)] rounded-[12px] overflow-hidden">
        {codes.length === 0 ? (
          <p className="text-center text-[13px] text-[color:var(--ad-faint)] py-6">코드가 없습니다.</p>
        ) : (
          <div className="divide-y divide-[color:var(--ad-line)]">
            {codes.map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-[13px] hover:bg-[rgba(110,173,255,0.05)]">
                <span className="font-mono text-[color:var(--ad-ink)] flex-1 truncate">{c.code}</span>
                {c.usedAt ? (
                  <span className="text-[11.5px] text-[color:var(--ad-faint)] ad-tnum">
                    사용됨 {new Date(c.usedAt).toLocaleString('ko-KR')}
                  </span>
                ) : (
                  <>
                    <span className="text-[11.5px] text-[color:var(--ad-pos)]">미사용</span>
                    <button
                      onClick={() => handleDeleteCode(c.id)}
                      className="text-[12.5px] font-medium text-[color:var(--ad-neg)] hover:underline"
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
        <div className="flex items-center justify-center gap-2 text-[13px]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="ad-press h-8 px-3 rounded-[10px] bg-white text-[12.5px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-[color:var(--ad-muted)] ad-tnum">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="ad-press h-8 px-3 rounded-[10px] bg-white text-[12.5px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-30"
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads`, {
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${id}`, {
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
      const res = await fetch(`${API_BASE}/api/admin/corporate-ads/${coupon.id}`, {
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
      await fetch(`${API_BASE}/api/admin/corporate-ads/reorder`, {
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
        ? `${API_BASE}/api/admin/corporate-ads`
        : `${API_BASE}/api/admin/corporate-ads/${editing.id}`;
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
        <div className="w-6 h-6 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[13px] text-[color:var(--ad-muted)]">
          멤버십 가입 시 발송되는 쿠폰 목록을 관리합니다 (다중 브랜드 지원)
        </p>
        <button
          onClick={handleAdd}
          className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50"
        >
          + 쿠폰 추가
        </button>
      </div>

      {/* 성과 분석 섹션 */}
      <CorporateAdAnalyticsSection />

      {/* Coupons List */}
      {coupons.length === 0 ? (
        <div className="ad-card p-12 text-center">
          <p className="text-[13px] text-[color:var(--ad-faint)]">등록된 쿠폰이 없습니다.</p>
          <button
            onClick={handleAdd}
            className="mt-3 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
          >
            첫 쿠폰 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon, index) => (
            <div
              key={coupon.id}
              className="ad-card p-4 flex items-center gap-4"
            >
              {/* 순서 변경 */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] disabled:opacity-30"
                  aria-label="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(index, 1)}
                  disabled={index === coupons.length - 1}
                  className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] disabled:opacity-30"
                  aria-label="아래로"
                >
                  ▼
                </button>
              </div>

              {/* 이미지 */}
              <div className="w-14 h-14 rounded-full bg-[color:var(--ad-bg)] overflow-hidden flex-shrink-0">
                {coupon.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coupon.imageUrl} alt={coupon.brandName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[color:var(--ad-faint)] text-[11px]">No img</div>
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[color:var(--ad-ink)] truncate">
                  {coupon.brandName || '(브랜드명 없음)'} · {coupon.couponAmount || '0원'}
                </p>
                <p className="text-[12px] text-[color:var(--ad-muted)] truncate mt-0.5">
                  {coupon.couponName || '(쿠폰명 없음)'}
                </p>
                <p className="text-[12px] text-[color:var(--ad-faint)] mt-0.5">
                  유효기간: {coupon.expiryDate || '미설정'}
                </p>
              </div>

              {/* 토글 */}
              <button
                onClick={() => handleToggleEnabled(coupon)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  coupon.enabled ? 'bg-[color:var(--ad-navy)]' : 'bg-[color:var(--ad-line-strong)]'
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
                className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                편집
              </button>
              <button
                onClick={() => handleDelete(coupon.id)}
                className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-neg)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[color:var(--ad-line)] px-6 py-4 flex items-center justify-between rounded-t-[20px]">
              <h2 className="text-[17px] font-bold text-[color:var(--ad-ink)]">
                {('id' in editing && editing.id) ? '쿠폰 편집' : '새 쿠폰 추가'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Enabled */}
              <div className="flex items-center justify-between pb-4 border-b border-[color:var(--ad-line)]">
                <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">활성화</p>
                <button
                  onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editing.enabled ? 'bg-[color:var(--ad-navy)]' : 'bg-[color:var(--ad-line-strong)]'
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
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  SOLAPI 템플릿 ID
                </label>
                <input
                  type="text"
                  value={editing.templateId}
                  onChange={(e) => setEditing({ ...editing, templateId: e.target.value })}
                  className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>

              {/* 표시용 필드 (멤버십 페이지에 노출) */}
              <div className="pt-2">
                <p className="text-[13px] font-semibold text-[color:var(--ad-ink)] mb-3">
                  멤버십 페이지 표시 정보
                </p>
                <div className="space-y-3">
                  {DISPLAY_FIELDS.map((field) => {
                    const isNumber = field.key === 'amountValue';
                    const isImage = field.key === 'imageUrl';
                    return (
                      <div key={field.key}>
                        <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
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
                          className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                          placeholder={field.placeholder}
                        />
                        {isImage && editing.imageUrl && (
                          <div className="mt-2 w-16 h-16 rounded-full bg-[color:var(--ad-bg)] overflow-hidden">
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
              <div className="pt-4 border-t border-[color:var(--ad-line)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[color:var(--ad-ink)]">
                      알림톡 템플릿 변수
                    </p>
                    <p className="text-[12px] text-[color:var(--ad-faint)] mt-0.5">
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
                    className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
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
                        className="flex-1 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] font-mono placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
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
                        className="flex-[2] rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-y min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(editing.templateVariables ?? [])];
                          next.splice(idx, 1);
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        className="h-10 w-10 inline-flex items-center justify-center text-[color:var(--ad-neg)] hover:bg-[#ffc4d0]/40 rounded-[10px]"
                        aria-label="삭제"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(!editing.templateVariables || editing.templateVariables.length === 0) && (
                    <p className="text-[12px] text-[color:var(--ad-faint)] py-2">
                      변수가 없으면 아래 (legacy) 필드를 사용하여 자동 매핑됩니다.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(editing.templateVariables ?? []), { variable: '', value: '' }];
                      setEditing({ ...editing, templateVariables: next });
                    }}
                    className="w-full h-10 border-2 border-dashed border-[color:var(--ad-line-strong)] rounded-[10px] text-[13px] text-[color:var(--ad-muted)] hover:border-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]"
                  >
                    + 변수 추가
                  </button>
                </div>
              </div>

              {/* 난수 쿠폰 코드 풀 */}
              <div className="pt-4 border-t border-[color:var(--ad-line)]">
                <p className="text-[13px] font-semibold text-[color:var(--ad-ink)] mb-1">
                  난수 쿠폰 코드 풀
                </p>
                <p className="text-[12px] text-[color:var(--ad-faint)] mb-3">
                  알림톡 발송 시 미사용 코드 1개를 자동으로 아래 변수에 주입합니다.
                </p>

                <div className="mb-4">
                  <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                    쿠폰 코드 변수명
                  </label>
                  <input
                    type="text"
                    value={editing.couponCodeVariable ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, couponCodeVariable: e.target.value })
                    }
                    placeholder="예: #{쿠폰코드}  (비워두면 코드 풀 미사용)"
                    className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none font-mono"
                  />
                </div>

                {'id' in editing && editing.id ? (
                  <CouponCodePoolSection
                    couponId={editing.id}
                    onToast={(message, type) => setToast({ message, type })}
                  />
                ) : (
                  <p className="text-[12.5px] text-[color:var(--ad-faint)] py-3 text-center bg-[color:var(--ad-bg-alt)] rounded-[10px]">
                    먼저 쿠폰을 저장하면 코드를 업로드할 수 있습니다.
                  </p>
                )}
              </div>

              {/* (Legacy) 표준 변수 폴백 필드 */}
              <details className="pt-4 border-t border-[color:var(--ad-line)]">
                <summary className="text-[13px] font-semibold text-[color:var(--ad-ink)] cursor-pointer">
                  (Legacy) 표준 변수 폴백 필드
                </summary>
                <p className="text-[12px] text-[color:var(--ad-faint)] mt-1 mb-3">
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
                        <label className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">{field.label}</label>
                        <span className="text-[11.5px] text-[color:var(--ad-muted)] font-mono bg-[color:var(--ad-bg)] px-1.5 py-0.5 rounded-[6px]">
                          {field.variable}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={(editing as any)[field.key] ?? ''}
                        onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                        className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-[color:var(--ad-line)] px-6 py-4 flex justify-end gap-2 rounded-b-[20px]">
              <button
                onClick={() => setEditing(null)}
                className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50"
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
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.5)] text-[13px] font-medium z-50 ${
            toast.type === 'success' ? 'bg-[color:var(--ad-navy)] text-white' : 'bg-[#cc0832] text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
