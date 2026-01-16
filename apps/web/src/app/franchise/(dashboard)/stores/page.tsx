'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Store,
  Users,
  Calendar,
  MapPin,
  Activity,
  TrendingUp,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Demo account email
const DEMO_EMAIL = 'franchise@tmr.com';

// Check if current user is demo account
function isDemoAccount(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('franchiseToken');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email === DEMO_EMAIL;
  } catch {
    return false;
  }
}

interface StoreData {
  id: string;
  name: string;
  region: string;
  category: string;
  status: 'active' | 'inactive' | 'pending';
  customerCount: number;
  lastActivity: string;
}

// Demo data for stores
const DEMO_STORES: StoreData[] = [
  { id: '1', name: '철길부산집 강남점', region: '서울 강남구', category: '한식/구이', status: 'active', customerCount: 342, lastActivity: '2025-01-14' },
  { id: '2', name: '철길부산집 홍대점', region: '서울 마포구', category: '한식/구이', status: 'active', customerCount: 289, lastActivity: '2025-01-13' },
  { id: '3', name: '철길부산집 신촌점', region: '서울 서대문구', category: '한식/구이', status: 'active', customerCount: 256, lastActivity: '2025-01-14' },
  { id: '4', name: '철길부산집 이태원점', region: '서울 용산구', category: '한식/구이', status: 'inactive', customerCount: 198, lastActivity: '2025-01-10' },
  { id: '5', name: '철길부산집 건대점', region: '서울 광진구', category: '한식/구이', status: 'active', customerCount: 312, lastActivity: '2025-01-14' },
  { id: '6', name: '철길부산집 잠실점', region: '서울 송파구', category: '한식/구이', status: 'active', customerCount: 423, lastActivity: '2025-01-14' },
  { id: '7', name: '철길부산집 수원점', region: '경기 수원시', category: '한식/구이', status: 'active', customerCount: 278, lastActivity: '2025-01-13' },
  { id: '8', name: '철길부산집 분당점', region: '경기 성남시', category: '한식/구이', status: 'active', customerCount: 356, lastActivity: '2025-01-14' },
  { id: '9', name: '철길부산집 인천점', region: '인천 남동구', category: '한식/구이', status: 'pending', customerCount: 89, lastActivity: '2025-01-08' },
  { id: '10', name: '철길부산집 부산서면점', region: '부산 부산진구', category: '한식/구이', status: 'active', customerCount: 445, lastActivity: '2025-01-14' },
  { id: '11', name: '철길부산집 대구점', region: '대구 중구', category: '한식/구이', status: 'active', customerCount: 234, lastActivity: '2025-01-13' },
  { id: '12', name: '철길부산집 광주점', region: '광주 서구', category: '한식/구이', status: 'active', customerCount: 189, lastActivity: '2025-01-12' },
  { id: '13', name: '철길부산집 대전점', region: '대전 서구', category: '한식/구이', status: 'inactive', customerCount: 156, lastActivity: '2025-01-05' },
  { id: '14', name: '철길부산집 울산점', region: '울산 남구', category: '한식/구이', status: 'active', customerCount: 201, lastActivity: '2025-01-14' },
  { id: '15', name: '철길부산집 제주점', region: '제주 제주시', category: '한식/구이', status: 'active', customerCount: 167, lastActivity: '2025-01-11' },
  { id: '16', name: '철길부산집 천안점', region: '충남 천안시', category: '한식/구이', status: 'active', customerCount: 143, lastActivity: '2025-01-13' },
  { id: '17', name: '철길부산집 청주점', region: '충북 청주시', category: '한식/구이', status: 'pending', customerCount: 45, lastActivity: '2025-01-07' },
  { id: '18', name: '철길부산집 전주점', region: '전북 전주시', category: '한식/구이', status: 'active', customerCount: 178, lastActivity: '2025-01-14' },
  { id: '19', name: '철길부산집 춘천점', region: '강원 춘천시', category: '한식/구이', status: 'active', customerCount: 112, lastActivity: '2025-01-12' },
  { id: '20', name: '철길부산집 창원점', region: '경남 창원시', category: '한식/구이', status: 'active', customerCount: 223, lastActivity: '2025-01-14' },
];

// Demo campaign history for slideover
const DEMO_CAMPAIGNS = [
  { id: '1', name: '신메뉴 출시 안내', date: '2025-01-10', sentCount: 245, status: 'completed' },
  { id: '2', name: '설 연휴 영업 안내', date: '2025-01-08', sentCount: 312, status: 'completed' },
  { id: '3', name: '겨울 프로모션', date: '2025-01-03', sentCount: 189, status: 'completed' },
];

// Region options
const REGION_OPTIONS = [
  { value: 'all', label: '전체 지역' },
  { value: '서울', label: '서울' },
  { value: '경기', label: '경기' },
  { value: '인천', label: '인천' },
  { value: '부산', label: '부산' },
  { value: '대구', label: '대구' },
  { value: '광주', label: '광주' },
  { value: '대전', label: '대전' },
  { value: '울산', label: '울산' },
  { value: '충남', label: '충남' },
  { value: '충북', label: '충북' },
  { value: '전북', label: '전북' },
  { value: '전남', label: '전남' },
  { value: '경북', label: '경북' },
  { value: '경남', label: '경남' },
  { value: '강원', label: '강원' },
  { value: '제주', label: '제주' },
];

// Status options
const STATUS_OPTIONS = [
  { value: 'all', label: '전체 상태' },
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
  { value: 'pending', label: '대기중' },
];

// Category options
const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체 업종' },
  { value: '한식/구이', label: '한식/구이' },
  { value: '중식', label: '중식' },
  { value: '일식', label: '일식' },
  { value: '양식', label: '양식' },
  { value: '카페', label: '카페' },
];

interface Campaign {
  id: string;
  name: string;
  date: string;
  sentCount: number;
  status: string;
}

export default function FranchiseStoresPage() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [isSlideoverOpen, setIsSlideoverOpen] = useState(false);

  // Filter dropdowns
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch stores (with demo fallback)
  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        // Use demo data only for demo account with empty results
        if (data.stores?.length > 0) {
          setStores(data.stores);
        } else if (isDemoAccount()) {
          setStores(DEMO_STORES);
        } else {
          setStores([]);
        }
      } else {
        // Use demo data only for demo account if API fails
        setStores(isDemoAccount() ? DEMO_STORES : []);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
      setStores(isDemoAccount() ? DEMO_STORES : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Filter stores
  const filteredStores = stores.filter((store) => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      store.region.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = regionFilter === 'all' || store.region.includes(regionFilter);
    const matchesStatus = statusFilter === 'all' || store.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || store.category === categoryFilter;

    return matchesSearch && matchesRegion && matchesStatus && matchesCategory;
  });

  // Status badge renderer
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium rounded-full">
            활성
          </span>
        );
      case 'inactive':
        return (
          <span className="bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium rounded-full">
            비활성
          </span>
        );
      case 'pending':
        return (
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium rounded-full">
            대기중
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // Open slideover
  const handleRowClick = (store: StoreData) => {
    setSelectedStore(store);
    setIsSlideoverOpen(true);
  };

  // Close slideover
  const closeSlideover = () => {
    setIsSlideoverOpen(false);
    setTimeout(() => setSelectedStore(null), 300);
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-48"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-4 bg-slate-200 rounded w-20"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Store className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-1">가맹점이 없습니다</h3>
      <p className="text-sm text-slate-500">검색 조건을 변경해보세요</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">가맹점</h1>
            <p className="text-sm text-slate-500 mt-1">
              전체 {stores.length}개 가맹점 중 {filteredStores.length}개 표시
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <div className="p-4 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="가맹점명 또는 지역으로 검색"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
              />
            </div>

            {/* Region Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowRegionDropdown(!showRegionDropdown);
                  setShowStatusDropdown(false);
                  setShowCategoryDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <MapPin className="w-4 h-4 text-slate-400" />
                {REGION_OPTIONS.find((r) => r.value === regionFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showRegionDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowRegionDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {REGION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setRegionFilter(option.value);
                          setShowRegionDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          regionFilter === option.value ? 'bg-franchise-50 text-franchise-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Category Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowRegionDropdown(false);
                  setShowStatusDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Filter className="w-4 h-4 text-slate-400" />
                {CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg">
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setCategoryFilter(option.value);
                          setShowCategoryDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          categoryFilter === option.value ? 'bg-franchise-50 text-franchise-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowStatusDropdown(!showStatusDropdown);
                  setShowRegionDropdown(false);
                  setShowCategoryDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Activity className="w-4 h-4 text-slate-400" />
                {STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showStatusDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setStatusFilter(option.value);
                          setShowStatusDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          statusFilter === option.value ? 'bg-franchise-50 text-franchise-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    가맹점명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    지역
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    업종
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    고객수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    마지막 활동
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    상세
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={7}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  filteredStores.map((store) => (
                    <tr
                      key={store.id}
                      onClick={() => handleRowClick(store)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-franchise-100 rounded-lg flex items-center justify-center">
                            <Store className="w-4 h-4 text-franchise-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{store.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{store.region}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{store.category}</td>
                      <td className="px-6 py-4">{renderStatusBadge(store.status)}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {store.customerCount.toLocaleString()}명
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDate(store.lastActivity)}</td>
                      <td className="px-6 py-4 text-center">
                        <ChevronRight className="w-4 h-4 text-slate-400 mx-auto" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slideover */}
      {selectedStore && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 bg-black/30 transition-opacity z-40',
              isSlideoverOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={closeSlideover}
          />

          {/* Slideover Panel */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out',
              isSlideoverOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <div className="h-full flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedStore.name}</h2>
                  <p className="text-sm text-slate-500">{selectedStore.region}</p>
                </div>
                <button
                  onClick={closeSlideover}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Store Info */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">매장 정보</h3>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">업종</span>
                      <span className="text-sm font-medium text-slate-900">{selectedStore.category}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">상태</span>
                      {renderStatusBadge(selectedStore.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">마지막 활동</span>
                      <span className="text-sm font-medium text-slate-900">{formatDate(selectedStore.lastActivity)}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Stats */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">고객 통계</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-franchise-600" />
                        <span className="text-xs text-slate-500">총 고객 수</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">{selectedStore.customerCount.toLocaleString()}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs text-slate-500">이번 달 신규</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">{Math.floor(selectedStore.customerCount * 0.12).toLocaleString()}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-slate-500">재방문율</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">34%</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-amber-600" />
                        <span className="text-xs text-slate-500">평균 방문</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">2.3회</p>
                    </div>
                  </div>
                </div>

                {/* Campaign History */}
                <div>
                  <h3 className="text-sm font-medium text-slate-900 mb-3">캠페인 히스토리</h3>
                  <div className="space-y-2">
                    {DEMO_CAMPAIGNS.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-900">{campaign.name}</span>
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium rounded-full">
                            완료
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{formatDate(campaign.date)}</span>
                          <span>{campaign.sentCount.toLocaleString()}건 발송</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
