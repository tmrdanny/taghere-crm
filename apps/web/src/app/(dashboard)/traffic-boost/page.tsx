'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Download,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  AlertCircle,
  Info,
  X,
  Plus,
  Send,
  Wallet,
  MapPin,
  Menu,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChargeModal } from '@/components/ChargeModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const KOREA_SIDOS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '미지정'
];

const SEND_OPTIONS = [
  { count: 1000, cost: 150000, label: '1,000명' },
  { count: 2000, cost: 300000, label: '2,000명' },
  { count: 3000, cost: 450000, label: '3,000명' },
  { count: 5000, cost: 750000, label: '5,000명' },
  { count: 10000, cost: 1500000, label: '10,000명' },
];

const COST_PER_PERSON = 150;

const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token') || '';
  }
  return '';
};

interface RankCheckResult {
  keyword: string;
  rank: number | null;
  estimated: number | null;
}

interface TrafficBoostRequest {
  id: string;
  createdAt: string;
  keyword: string;
  sendCount: number;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  cost: number;
}

export default function TrafficBoostPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Charge modal
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);

  // How it works collapsible
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('traffic-boost-howItWorks');
      return stored === null ? true : stored === 'open';
    }
    return true;
  });

  // Keyword & rank check
  const [keyword, setKeyword] = useState('');
  const [rankResult, setRankResult] = useState<RankCheckResult | null>(null);
  const [isCheckingRank, setIsCheckingRank] = useState(false);
  const [hasNaverPlaceUrl, setHasNaverPlaceUrl] = useState<boolean | null>(null);

  // Coupon settings
  const [couponContent, setCouponContent] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [storeName, setStoreName] = useState('');

  // Region selection
  const [selectedSidos, setSelectedSidos] = useState<string[]>([]);
  const [selectedSigungus, setSelectedSigungus] = useState<Record<string, string[]>>({});
  const [regionSearchQuery, setRegionSearchQuery] = useState('');
  const [sigunguSearchQuery, setSigunguSearchQuery] = useState('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [activeSidoForSigungu, setActiveSidoForSigungu] = useState<string | null>(null);
  const [regionCounts, setRegionCounts] = useState<{
    sidoCounts: Record<string, number>;
    sigunguCounts: Record<string, Record<string, number>>;
  }>({ sidoCounts: {}, sigunguCounts: {} });

  // Send count
  const [sendCount, setSendCount] = useState(0);

  // Wallet
  const [walletBalance, setWalletBalance] = useState(0);

  // Weekly usage
  const [weeklyUsage, setWeeklyUsage] = useState(0);

  // Request history
  const [requests, setRequests] = useState<TrafficBoostRequest[]>([]);

  // UI states
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Toggle how-it-works
  const toggleHowItWorks = () => {
    const next = !isHowItWorksOpen;
    setIsHowItWorksOpen(next);
    localStorage.setItem('traffic-boost-howItWorks', next ? 'open' : 'closed');
  };

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      const token = getAuthToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

      try {
        const [regionRes, walletRes, usageRes, requestsRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE}/api/local-customers/region-counts`, { headers }),
          fetch(`${API_BASE}/api/local-customers/estimate?sendCount=0`, { headers }),
          fetch(`${API_BASE}/api/traffic-boost/weekly-usage`, { headers }).catch(() => null),
          fetch(`${API_BASE}/api/traffic-boost/requests`, { headers }).catch(() => null),
          fetch(`${API_BASE}/api/retarget-coupon/settings`, { headers }).catch(() => null),
        ]);

        if (regionRes.ok) {
          const regionData = await regionRes.json();
          setRegionCounts({
            sidoCounts: regionData.sidoCounts || {},
            sigunguCounts: regionData.sigunguCounts || {},
          });
        }

        if (walletRes.ok) {
          const walletData = await walletRes.json();
          setWalletBalance(walletData.walletBalance || 0);
        }

        if (usageRes && usageRes.ok) {
          const usageData = await usageRes.json();
          setWeeklyUsage(usageData.usage || 0);
          setHasNaverPlaceUrl(usageData.hasNaverPlaceUrl !== undefined ? usageData.hasNaverPlaceUrl : true);
        } else {
          setHasNaverPlaceUrl(true);
        }

        if (requestsRes && requestsRes.ok) {
          const requestsData = await requestsRes.json();
          setRequests(requestsData.requests || []);
        }

        if (settingsRes && settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setStoreName(settingsData.storeName || '');
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      }
    };

    fetchInitialData();
  }, []);

  // Payment confirmation
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');

    if (paymentKey && orderId && amountParam) {
      const confirmPayment = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/payments/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId,
              amount: parseInt(amountParam),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setWalletBalance(data.newBalance || 0);
            setSuccessMessage('충전이 완료되었습니다!');
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
        } finally {
          router.replace('/traffic-boost');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router]);

  // Rank check
  const handleRankCheck = async () => {
    if (!keyword.trim()) return;
    setIsCheckingRank(true);
    setRankResult(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/traffic-boost/rank-check?keyword=${encodeURIComponent(keyword.trim())}`,
        { headers: { Authorization: `Bearer ${getAuthToken()}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setRankResult({
          keyword: keyword.trim(),
          rank: data.rank ?? null,
          estimated: data.estimated ?? null,
        });
      }
    } catch (err) {
      console.error('Rank check failed:', err);
      setError('순위 확인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsCheckingRank(false);
    }
  };

  // Region handlers
  const filteredSidos = regionSearchQuery.trim()
    ? KOREA_SIDOS.filter((sido) => sido.toLowerCase().includes(regionSearchQuery.toLowerCase()))
    : KOREA_SIDOS;

  const addSido = useCallback((sido: string) => {
    setSelectedSidos(prev => prev.includes(sido) ? prev : [...prev, sido]);
    setActiveSidoForSigungu(sido);
    setRegionSearchQuery('');
    setIsRegionDropdownOpen(false);
  }, []);

  const removeSido = useCallback((sido: string) => {
    setSelectedSidos(prev => {
      const next = prev.filter(s => s !== sido);
      if (activeSidoForSigungu === sido) {
        setActiveSidoForSigungu(next.length > 0 ? next[0] : null);
      }
      return next;
    });
    setSelectedSigungus(prev => {
      const next = { ...prev };
      delete next[sido];
      return next;
    });
  }, [activeSidoForSigungu]);

  // Cost calculation
  const totalCost = sendCount * COST_PER_PERSON;
  const canAfford = walletBalance >= totalCost;
  const weeklyLimitReached = weeklyUsage >= 2;

  const canSubmit =
    keyword.trim() !== '' &&
    couponContent.trim() !== '' &&
    selectedSidos.length > 0 &&
    sendCount > 0 &&
    canAfford &&
    !weeklyLimitReached &&
    !isSending;

  // Submit request
  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sigunguList: string[] = [];
      Object.entries(selectedSigungus).forEach(([sido, sigungus]) => {
        if (sigungus && sigungus.length > 0) {
          sigungus.forEach(sigungu => sigunguList.push(`${sido}/${sigungu}`));
        }
      });

      const res = await fetch(`${API_BASE}/api/traffic-boost/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          keyword: keyword.trim(),
          couponContent: couponContent.trim(),
          expiryDate: expiryDate.trim(),
          regionSidos: selectedSidos,
          regionSigungus: sigunguList.length > 0 ? sigunguList : null,
          sendCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '신청에 실패했습니다.');

      setSuccessMessage('신청이 접수되었습니다. 담당자 확인 후 발송됩니다.');
      setWeeklyUsage(prev => prev + 1);

      // Refresh requests list
      try {
        const reqRes = await fetch(`${API_BASE}/api/traffic-boost/requests`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (reqRes.ok) {
          const reqData = await reqRes.json();
          setRequests(reqData.requests || []);
        }
      } catch {
        // ignore
      }

      // Refresh wallet
      try {
        const walletRes = await fetch(`${API_BASE}/api/local-customers/estimate?sendCount=0`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (walletRes.ok) {
          const walletData = await walletRes.json();
          setWalletBalance(walletData.walletBalance || 0);
        }
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '신청 중 오류가 발생했습니다.';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기중</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">완료</span>;
      case 'REJECTED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">반려</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">{status}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:items-start p-4 md:p-6 gap-6 max-w-[1200px] mx-auto w-full lg:justify-center">
      {/* Left Panel - Settings */}
      <div className="flex-1 lg:max-w-[720px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#e5e7eb]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-neutral-900">플레이스 유입 증폭</h1>
              <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">NEW</span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">네이버 플레이스 순위를 끌어올리세요</p>
          </div>
        </div>

        {/* How It Works - Collapsible */}
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 overflow-hidden">
          <button
            onClick={toggleHowItWorks}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-neutral-900"
          >
            <span>어떻게 작동하나요?</span>
            {isHowItWorksOpen ? (
              <ChevronUp className="w-4 h-4 text-neutral-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500" />
            )}
          </button>
          {isHowItWorksOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Search className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-800">1. 키워드 검색 유입</p>
                  <p className="text-xs text-neutral-500">플레이스 검색 지수 상승 (1차)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-800">2. 쿠폰 다운로드</p>
                  <p className="text-xs text-neutral-500">플레이스 행동 지수 상승 (2차)</p>
                </div>
              </div>
              <div className="flex items-start gap-3 pt-2 border-t border-neutral-200">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-sm text-neutral-700 font-medium">
                  한 번의 발송으로 순위 지수가 2번 올라갑니다
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error / Success messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {successMessage}
          </div>
        )}

        {/* Keyword Input + Rank Check */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">키워드 검색</h2>
          {hasNaverPlaceUrl === false ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 font-medium">네이버 플레이스 URL을 먼저 등록해주세요</p>
                <a href="/settings" className="text-sm text-yellow-700 underline hover:text-yellow-900 mt-1 inline-block">
                  설정 페이지로 이동
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRankCheck()}
                  placeholder="예: 강남 맛집, 홍대 카페"
                  className="flex-1 px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                />
                <button
                  onClick={handleRankCheck}
                  disabled={!keyword.trim() || isCheckingRank}
                  className={cn(
                    'px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap',
                    keyword.trim() && !isCheckingRank
                      ? 'bg-[#2a2d62] text-white hover:bg-[#1d1f45]'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  )}
                >
                  {isCheckingRank ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    '순위 확인'
                  )}
                </button>
              </div>

              {/* Rank result */}
              {rankResult && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  {rankResult.rank !== null ? (
                    <div className="space-y-1">
                      <p className="text-sm text-blue-800">
                        현재 순위: <span className="font-semibold">{rankResult.keyword}</span> → <span className="font-bold text-blue-900">{rankResult.rank}위</span>
                      </p>
                      {rankResult.estimated !== null && (
                        <p className="text-sm text-blue-700">
                          발송 후 예상: <span className="font-bold text-green-700">{rankResult.estimated}위</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-800">
                      50위 밖 (아직 노출되지 않음)
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Coupon Settings */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-neutral-900">쿠폰 설정</h2>
          <div>
            <label className="text-xs text-[#64748b] mb-1.5 block">쿠폰 내용</label>
            <input
              type="text"
              value={couponContent}
              onChange={(e) => setCouponContent(e.target.value)}
              placeholder="예: 아메리카노 1잔 무료"
              className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs text-[#64748b] mb-1.5 block">쿠폰 유효기간</label>
            <input
              type="text"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              placeholder="예: 2026년 4월 30일까지"
              className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
            />
          </div>
        </div>

        {/* Region Selection */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 지역 선택</h2>
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-neutral-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">지역 선택</p>
                <p className="text-xs text-neutral-500">여러 지역을 선택할 수 있습니다</p>
              </div>
            </div>

            {selectedSidos.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="flex flex-wrap gap-2">
                  {selectedSidos.map((sido) => (
                    <span key={sido} className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-sm font-medium">
                      {sido}
                      {(selectedSigungus[sido]?.length || 0) > 0 && (
                        <span className="text-xs text-brand-500">({selectedSigungus[sido].length})</span>
                      )}
                      <button onClick={() => removeSido(sido)} className="hover:bg-brand-200 rounded-full p-0.5 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Sigungu drill-down */}
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="flex overflow-x-auto bg-neutral-50 border-b border-neutral-200">
                    {selectedSidos.map((sido) => (
                      <button
                        key={sido}
                        onClick={() => setActiveSidoForSigungu(activeSidoForSigungu === sido ? null : sido)}
                        className={cn(
                          'px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
                          activeSidoForSigungu === sido
                            ? 'border-brand-600 text-brand-700 bg-white'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700'
                        )}
                      >
                        {sido}
                        {(selectedSigungus[sido]?.length || 0) > 0 && (
                          <span className="ml-1 text-brand-500">{selectedSigungus[sido].length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {activeSidoForSigungu && regionCounts.sigunguCounts[activeSidoForSigungu] && (
                    <div className="p-3">
                      <div className="mb-2">
                        <input
                          type="text"
                          value={sigunguSearchQuery}
                          onChange={(e) => setSigunguSearchQuery(e.target.value)}
                          placeholder={`${activeSidoForSigungu} 시/군/구 검색...`}
                          className="w-full px-3 py-1.5 border border-neutral-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {Object.entries(regionCounts.sigunguCounts[activeSidoForSigungu])
                          .filter(([sigungu]) => !sigunguSearchQuery || sigungu.includes(sigunguSearchQuery))
                          .sort((a, b) => b[1] - a[1])
                          .map(([sigungu]) => {
                            const isSelected = selectedSigungus[activeSidoForSigungu]?.includes(sigungu);
                            return (
                              <button
                                key={sigungu}
                                onClick={() => {
                                  setSelectedSigungus(prev => {
                                    const current = prev[activeSidoForSigungu!] || [];
                                    if (isSelected) {
                                      return { ...prev, [activeSidoForSigungu!]: current.filter(s => s !== sigungu) };
                                    } else {
                                      return { ...prev, [activeSidoForSigungu!]: [...current, sigungu] };
                                    }
                                  });
                                }}
                                className={cn(
                                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                                  isSelected
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                )}
                              >
                                {sigungu}
                              </button>
                            );
                          })}
                      </div>
                      {(selectedSigungus[activeSidoForSigungu]?.length || 0) > 0 && (
                        <p className="text-[10px] text-neutral-400 mt-2">
                          * 미선택 시 {activeSidoForSigungu} 전체에 발송됩니다
                        </p>
                      )}
                      {(selectedSigungus[activeSidoForSigungu]?.length || 0) === 0 && (
                        <p className="text-[10px] text-neutral-400 mt-2">
                          * 상세 지역 미선택 시 {activeSidoForSigungu} 전체에 발송됩니다
                        </p>
                      )}
                    </div>
                  )}

                  {activeSidoForSigungu && !regionCounts.sigunguCounts[activeSidoForSigungu] && (
                    <div className="p-3 text-xs text-neutral-400 text-center">상세 지역 데이터가 없습니다</div>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={regionSearchQuery}
                  onChange={(e) => { setRegionSearchQuery(e.target.value); setIsRegionDropdownOpen(true); }}
                  onFocus={() => setIsRegionDropdownOpen(true)}
                  placeholder="지역 검색 (예: 서울, 경기, 부산...)"
                  className="w-full pl-9 pr-4 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {isRegionDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                  {filteredSidos.length > 0 && selectedSidos.length < KOREA_SIDOS.length && (
                    <button
                      onClick={() => { setSelectedSidos(KOREA_SIDOS); setIsRegionDropdownOpen(false); setRegionSearchQuery(''); }}
                      className="w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors bg-blue-50 hover:bg-blue-100 text-blue-700 border-b border-blue-200"
                    >
                      <span className="font-semibold">전체 선택</span>
                    </button>
                  )}
                  {filteredSidos.length > 0 ? filteredSidos.map((sido) => {
                    const isSelected = selectedSidos.includes(sido);
                    return (
                      <button
                        key={sido}
                        onClick={() => !isSelected && addSido(sido)}
                        disabled={isSelected}
                        className={cn(
                          "w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors",
                          isSelected ? "bg-brand-50 text-brand-600" : "hover:bg-neutral-50 text-neutral-700"
                        )}
                      >
                        <span className="font-medium">{sido}</span>
                        <div className="flex items-center gap-2">
                          {isSelected ? <span className="text-xs text-brand-500">선택됨</span> : <Plus className="w-4 h-4 text-neutral-400" />}
                        </div>
                      </button>
                    );
                  }) : <div className="px-4 py-3 text-sm text-neutral-500">검색 결과가 없습니다</div>}
                </div>
              )}
            </div>
            {isRegionDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsRegionDropdownOpen(false)} />}
          </div>
        </div>

        {/* Send Count Selection */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 인원 선택</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {SEND_OPTIONS.map((option) => (
              <button
                key={option.count}
                onClick={() => setSendCount(sendCount === option.count ? 0 : option.count)}
                className={cn(
                  'p-3 rounded-xl text-center transition-all border',
                  sendCount === option.count
                    ? 'bg-[#2a2d62] text-white border-[#2a2d62]'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:border-neutral-300'
                )}
              >
                <p className="text-sm font-bold">{option.label}</p>
                <p className={cn('text-xs mt-0.5', sendCount === option.count ? 'text-neutral-300' : 'text-neutral-500')}>
                  {option.cost.toLocaleString()}원
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Prediction Card */}
        {sendCount > 0 && rankResult && (
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl p-5">
            <h3 className="text-base font-semibold text-emerald-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              예상 마케팅 효과
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-xs text-emerald-600 mb-1">예상 트래픽 증가</p>
                <p className="text-xl font-bold text-emerald-800">+{Math.round(sendCount * 0.4).toLocaleString()}</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-xs text-emerald-600 mb-1">예상 순위 변화</p>
                <p className="text-xl font-bold text-emerald-800">
                  {rankResult.rank !== null
                    ? `${rankResult.rank}위 → ${rankResult.estimated ?? Math.max(1, rankResult.rank - Math.floor(sendCount / 500))}위`
                    : '순위 진입'}
                </p>
              </div>
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-xs text-emerald-600 mb-1">예상 신규 방문</p>
                <p className="text-xl font-bold text-emerald-800">{Math.round(sendCount * 0.034).toLocaleString()}명</p>
              </div>
              <div className="bg-emerald-100/80 rounded-lg p-3 ring-1 ring-emerald-200">
                <p className="text-xs text-emerald-600 mb-1">예상 추가 매출</p>
                <p className="text-xl font-bold text-emerald-800">{(Math.round(sendCount * 0.034) * 25000).toLocaleString()}원</p>
              </div>
            </div>

            <p className="text-xs text-emerald-600/70 mt-3">
              * 업계 평균 전환율 3.4% 및 평균 객단가 25,000원 기준 추정치입니다
            </p>
          </div>
        )}

        {/* Cost Summary + Action */}
        <div className="border-t border-neutral-200 pt-4 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-neutral-600">예상 비용</p>
              <p className="text-xl font-bold text-neutral-900">
                {sendCount > 0 ? (
                  <>
                    {sendCount.toLocaleString()}명 x {COST_PER_PERSON}원 = <span className="text-brand-600">{totalCost.toLocaleString()}원</span>
                  </>
                ) : (
                  <span className="text-neutral-400">발송 인원을 선택하세요</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-neutral-600">현재 잔액</p>
              <p className={cn('text-xl font-bold', canAfford || totalCost === 0 ? 'text-green-600' : 'text-red-600')}>
                {walletBalance.toLocaleString()}원
              </p>
              {!canAfford && totalCost > 0 && (
                <button
                  onClick={() => setIsChargeModalOpen(true)}
                  className="mt-1 text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 ml-auto"
                >
                  <Wallet className="w-4 h-4" />
                  충전하기
                </button>
              )}
            </div>
          </div>

          {/* Weekly usage */}
          <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
            <div className="flex items-center gap-2 text-neutral-600">
              <Info className="w-4 h-4" />
              <span className="text-sm">이번 주 {weeklyUsage}/2회 사용</span>
              {weeklyLimitReached && (
                <span className="text-xs text-red-500 font-medium">(주간 한도 도달)</span>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors',
              canSubmit
                ? 'bg-[#2a2d62] hover:bg-[#1d1f45]'
                : 'bg-neutral-300 cursor-not-allowed'
            )}
          >
            <Send className="w-5 h-5" />
            {isSending ? '신청 중...' : '신청하기'}
          </button>
        </div>

        {/* Request History */}
        {requests.length > 0 && (
          <div className="border-t border-neutral-200 pt-4">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">신청 내역</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-neutral-500">날짜</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-neutral-500">키워드</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-neutral-500">발송수</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-neutral-500">상태</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-neutral-500">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b border-neutral-100">
                      <td className="py-2.5 px-2 text-neutral-600 whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-2 text-neutral-900 font-medium">{req.keyword}</td>
                      <td className="py-2.5 px-2 text-right text-neutral-600">{req.sendCount.toLocaleString()}명</td>
                      <td className="py-2.5 px-2 text-center">{getStatusBadge(req.status)}</td>
                      <td className="py-2.5 px-2 text-right text-neutral-600">{req.cost.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - iPhone Preview */}
      <div className="hidden lg:block flex-none w-[360px] self-start">
        <div className="bg-[#e2e8f0] rounded-3xl p-5">
          <div className="relative w-full h-[680px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
            <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
              <div className="w-full h-full bg-[#B2C7D9] rounded-[1.75rem] overflow-hidden flex flex-col relative">
                {/* Notch */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />

                {/* KakaoTalk header */}
                <div className="flex items-center justify-between px-4 pt-10 pb-2">
                  <ChevronLeft className="w-4 h-4 text-neutral-700" />
                  <span className="font-medium text-xs text-neutral-800">카카오톡</span>
                  <Menu className="w-4 h-4 text-neutral-700" />
                </div>

                {/* Date */}
                <div className="flex justify-center mb-3">
                  <span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">
                    {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                {/* Message */}
                <div className="flex-1 pl-2 pr-4 overflow-auto">
                  <div className="flex gap-1.5">
                    <div className="flex-shrink-0">
                      <div className="w-7 h-7 rounded-full bg-neutral-300" />
                    </div>
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-[10px] text-neutral-600 mb-0.5">태그히어</p>
                      <div className="relative">
                        <div className="absolute -top-1 -right-1 z-10">
                          <span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">kakao</span>
                        </div>
                        {/* Banner */}
                        <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                          <span className="text-xs font-medium text-neutral-800">알림톡 도착</span>
                        </div>
                        <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                          <div className="px-4 py-4">
                            <p className="text-xs font-semibold text-neutral-800 mb-3">
                              {storeName || '매장명'}에서 쿠폰을 보냈어요!
                            </p>
                            <div className="space-y-2 text-xs text-neutral-700">
                              <div className="bg-neutral-50 rounded-lg p-3">
                                <p className="font-medium text-neutral-800 mb-1">쿠폰 내용</p>
                                <p className="text-neutral-600">
                                  {couponContent || '쿠폰 내용을 입력해주세요'}
                                </p>
                              </div>
                              {expiryDate && (
                                <p className="text-neutral-500 text-[10px]">
                                  유효기간: {expiryDate}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="px-4 pb-4">
                            <button className="w-full py-2.5 bg-[#FEE500] text-neutral-800 text-xs font-semibold rounded">
                              쿠폰 받기
                            </button>
                          </div>
                        </div>
                        <p className="text-[8px] text-neutral-500 mt-0.5 text-right">오후 12:30</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-6" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charge Modal */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onSuccess={(newBalance) => {
          setWalletBalance(newBalance);
          setIsChargeModalOpen(false);
        }}
        currentBalance={walletBalance}
        requiredAmount={totalCost}
        successRedirectPath="/traffic-boost"
      />
    </div>
  );
}
