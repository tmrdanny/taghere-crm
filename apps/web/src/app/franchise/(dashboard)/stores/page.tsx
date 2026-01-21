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
  Wallet,
  Send,
  Loader2,
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
  address?: string;
  category?: string;
  customerCount: number;
  ownerName?: string;
  phone?: string;
  createdAt?: string;
  stats?: {
    customerCount: number;
    totalOrders: number;
    recentOrders: number;
    totalPointsEarned: number;
    walletBalance: number;
    revisitRate: number;
    averageVisits: number;
  };
}

// Category label mapping
const CATEGORY_LABELS: Record<string, string> = {
  KOREAN: '한식',
  CHINESE: '중식',
  JAPANESE: '일식',
  WESTERN: '양식',
  ASIAN: '아시안',
  BUNSIK: '분식',
  FASTFOOD: '패스트푸드',
  MEAT: '고기/구이',
  SEAFOOD: '해산물',
  BUFFET: '뷔페',
  BRUNCH: '브런치',
  CAFE: '카페',
  BAKERY: '베이커리',
  DESSERT: '디저트',
  ICECREAM: '아이스크림',
  BEER: '호프/맥주',
  IZAKAYA: '이자카야',
  WINE_BAR: '와인바',
  COCKTAIL_BAR: '칵테일바',
  POCHA: '포차',
  KOREAN_PUB: '주점',
  FOODCOURT: '푸드코트',
  OTHER: '기타',
};

// Category options
const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체 업종' },
  { value: 'KOREAN', label: '한식' },
  { value: 'CHINESE', label: '중식' },
  { value: 'JAPANESE', label: '일식' },
  { value: 'WESTERN', label: '양식' },
  { value: 'CAFE', label: '카페' },
  { value: 'MEAT', label: '고기/구이' },
];

export default function FranchiseStoresPage() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [isSlideoverOpen, setIsSlideoverOpen] = useState(false);
  const [storeDetail, setStoreDetail] = useState<StoreData | null>(null);

  // Filter dropdowns
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Transfer state
  const [franchiseWalletBalance, setFranchiseWalletBalance] = useState<number>(0);
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferMemo, setTransferMemo] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch stores
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
        setStores(data.stores || []);
      } else {
        setStores([]);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
      setStores([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch franchise wallet balance
  const fetchFranchiseWallet = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/wallet`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setFranchiseWalletBalance(data.balance || 0);
      }
    } catch (err) {
      console.error('Failed to fetch franchise wallet:', err);
    }
  }, []);

  useEffect(() => {
    fetchStores();
    fetchFranchiseWallet();
  }, [fetchStores, fetchFranchiseWallet]);

  // Fetch store detail
  const fetchStoreDetail = useCallback(async (storeId: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores/${storeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStoreDetail(data);
      }
    } catch (err) {
      console.error('Failed to fetch store detail:', err);
    }
  }, []);

  // Transfer funds to store
  const handleTransfer = async () => {
    if (!selectedStore) return;

    const amount = parseInt(transferAmount.replace(/,/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      setTransferError('이체 금액을 입력해주세요.');
      return;
    }

    if (amount > franchiseWalletBalance) {
      setTransferError('본사 잔액이 부족합니다.');
      return;
    }

    setIsTransferring(true);
    setTransferError(null);
    setTransferSuccess(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores/${selectedStore.id}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          memo: transferMemo || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setTransferSuccess(`${amount.toLocaleString()}원이 이체되었습니다.`);
        setTransferAmount('');
        setTransferMemo('');
        setFranchiseWalletBalance(data.franchiseNewBalance);
        // Update store detail with new balance
        if (storeDetail) {
          setStoreDetail({
            ...storeDetail,
            stats: {
              ...storeDetail.stats!,
              walletBalance: data.storeNewBalance,
            },
          });
        }
        // Clear success message after 3 seconds
        setTimeout(() => setTransferSuccess(null), 3000);
      } else {
        setTransferError(data.error || '이체에 실패했습니다.');
      }
    } catch (err) {
      console.error('Transfer failed:', err);
      setTransferError('이체 중 오류가 발생했습니다.');
    } finally {
      setIsTransferring(false);
    }
  };

  // Format number with commas
  const formatNumberInput = (value: string) => {
    const num = value.replace(/[^\d]/g, '');
    return num ? parseInt(num, 10).toLocaleString() : '';
  };

  // Filter stores
  const filteredStores = stores.filter((store) => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (store.address || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || store.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Open slideover
  const handleRowClick = (store: StoreData) => {
    setSelectedStore(store);
    setIsSlideoverOpen(true);
    fetchStoreDetail(store.id);
    // Reset transfer state
    setTransferAmount('');
    setTransferMemo('');
    setTransferError(null);
    setTransferSuccess(null);
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
                placeholder="가맹점명 또는 주소로 검색"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Filter className="w-4 h-4 text-slate-400" />
                {CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
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
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">
                    가맹점명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">
                    지역
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    업종
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    고객수
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={4}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{renderEmptyState()}</td>
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
                      <td className="px-6 py-4 text-sm text-slate-600">{store.address || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{store.category ? CATEGORY_LABELS[store.category] || store.category : '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {store.customerCount.toLocaleString()}명
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
                  <p className="text-sm text-slate-500">{selectedStore.address || '-'}</p>
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
                      <span className="text-sm font-medium text-slate-900">
                        {selectedStore.category ? CATEGORY_LABELS[selectedStore.category] || selectedStore.category : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">주소</span>
                      <span className="text-sm font-medium text-slate-900">{selectedStore.address || '-'}</span>
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
                      <p className="text-xl font-bold text-slate-900">
                        {storeDetail?.stats?.customerCount?.toLocaleString() || selectedStore.customerCount.toLocaleString()}명
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs text-slate-500">총 주문</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        {storeDetail?.stats?.totalOrders?.toLocaleString() || '-'}회
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-slate-500">재방문율</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        {storeDetail?.stats?.revisitRate !== undefined
                          ? `${Math.round(storeDetail.stats.revisitRate)}%`
                          : '-'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-amber-600" />
                        <span className="text-xs text-slate-500">평균 방문</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        {storeDetail?.stats?.averageVisits !== undefined
                          ? `${storeDetail.stats.averageVisits.toFixed(1)}회`
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Transfer Section */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">충전금 관리</h3>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                    {/* Store Wallet Balance */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">가맹점 충전금 잔액</span>
                      <span className="text-lg font-bold text-slate-900">
                        {storeDetail?.stats?.walletBalance !== undefined
                          ? `${storeDetail.stats.walletBalance.toLocaleString()}원`
                          : '-'}
                      </span>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      {/* Transfer Amount Input */}
                      <div className="mb-3">
                        <label className="block text-xs text-slate-500 mb-1">이체 금액</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={transferAmount}
                            onChange={(e) => {
                              setTransferAmount(formatNumberInput(e.target.value));
                              setTransferError(null);
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
                        </div>
                      </div>

                      {/* Memo Input */}
                      <div className="mb-3">
                        <label className="block text-xs text-slate-500 mb-1">메모 (선택)</label>
                        <input
                          type="text"
                          value={transferMemo}
                          onChange={(e) => setTransferMemo(e.target.value)}
                          placeholder="예: 1월 마케팅 지원금"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
                        />
                      </div>

                      {/* Franchise Balance Display */}
                      <div className="flex items-center justify-between mb-3 text-sm">
                        <span className="text-slate-500">본사 잔액</span>
                        <span className="font-medium text-slate-700">
                          {franchiseWalletBalance.toLocaleString()}원
                        </span>
                      </div>

                      {/* Error Message */}
                      {transferError && (
                        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                          {transferError}
                        </div>
                      )}

                      {/* Success Message */}
                      {transferSuccess && (
                        <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-600">
                          {transferSuccess}
                        </div>
                      )}

                      {/* Transfer Button */}
                      <button
                        onClick={handleTransfer}
                        disabled={isTransferring || !transferAmount}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          isTransferring || !transferAmount
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-franchise-600 text-white hover:bg-franchise-700'
                        )}
                      >
                        {isTransferring ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            이체 중...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            충전금 이체하기
                          </>
                        )}
                      </button>
                    </div>
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
