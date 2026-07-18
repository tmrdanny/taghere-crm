'use client';

import { API_BASE } from '@/lib/api-config';
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
  Gift,
  Settings,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';


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
  addressSido?: string | null;
  addressSigungu?: string | null;
  managerName?: string | null;
  category?: string;
  customerCount: number;
  stampRewardCustomers?: number;
  ownerName?: string;
  phone?: string;
  createdAt?: string;
  franchiseStampEnabled?: boolean;
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

interface StampRewardSetting {
  tier: number;
  description: string;
  options?: string[];
}

interface FranchiseStampSettingData {
  id?: string;
  enabled: boolean;
  rewards: StampRewardSetting[];
  alimtalkEnabled: boolean;
  storeEditLocked?: boolean;
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
  // 지역(시/도 + 시/군/구)/담당자 필터
  const [sidoFilter, setSidoFilter] = useState('all');
  const [sigunguFilter, setSigunguFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  // 정렬 (고객수/스탬프 보상 수령)
  const [sortKey, setSortKey] = useState<'customerCount' | 'stampRewardCustomers' | null>(null);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  // 담당자 인라인 편집 상태
  const [editingManagerStoreId, setEditingManagerStoreId] = useState<string | null>(null);
  const [managerInput, setManagerInput] = useState('');
  const [savingManager, setSavingManager] = useState(false);
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

  // Stamp setting state
  const [stampSetting, setStampSetting] = useState<FranchiseStampSettingData | null>(null);
  const [isStampSettingOpen, setIsStampSettingOpen] = useState(false);
  const [stampSettingForm, setStampSettingForm] = useState<StampRewardSetting[]>([]);
  const [stampAlimtalk, setStampAlimtalk] = useState(true);
  const [stampStoreEditLocked, setStampStoreEditLocked] = useState(false);
  const [isSavingStampSetting, setIsSavingStampSetting] = useState(false);

  // 공통 보상 가맹점 일괄 적용 state
  const [applyStoreIds, setApplyStoreIds] = useState<Set<string>>(new Set());
  const [isApplyingRewards, setIsApplyingRewards] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [togglingStoreId, setTogglingStoreId] = useState<string | null>(null);
  const [isTogglingAll, setIsTogglingAll] = useState(false);

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

  // Fetch franchise stamp setting
  const fetchStampSetting = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stamp-setting`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const s = data.setting;
        if (s) {
          const rewards: StampRewardSetting[] = s.rewards || [];
          setStampSetting({ id: s.id, enabled: s.enabled, rewards, alimtalkEnabled: s.alimtalkEnabled, storeEditLocked: s.storeEditLocked });
          setStampSettingForm(rewards.length > 0 ? rewards : [{ tier: 5, description: '' }, { tier: 10, description: '' }]);
          setStampAlimtalk(s.alimtalkEnabled ?? true);
          setStampStoreEditLocked(s.storeEditLocked ?? false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stamp setting:', err);
    }
  }, []);

  // Toggle individual store stamp
  const handleStampToggle = async (storeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingStoreId(storeId);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores/${storeId}/stamp-toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, franchiseStampEnabled: data.franchiseStampEnabled } : s)));
        if (selectedStore?.id === storeId) {
          setSelectedStore((prev) => prev ? { ...prev, franchiseStampEnabled: data.franchiseStampEnabled } : prev);
        }
        // If turning on and no stamp setting yet, fetch it
        if (data.franchiseStampEnabled && !stampSetting) {
          fetchStampSetting();
        }
      }
    } catch (err) {
      console.error('Failed to toggle stamp:', err);
    } finally {
      setTogglingStoreId(null);
    }
  };

  // Toggle all stores stamp
  const handleStampToggleAll = async (enabled: boolean) => {
    setIsTogglingAll(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores/stamp-toggle-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setStores((prev) => prev.map((s) => ({ ...s, franchiseStampEnabled: enabled })));
        if (selectedStore) {
          setSelectedStore((prev) => prev ? { ...prev, franchiseStampEnabled: enabled } : prev);
        }
        if (enabled && !stampSetting) {
          fetchStampSetting();
        }
      }
    } catch (err) {
      console.error('Failed to toggle all stamps:', err);
    } finally {
      setIsTogglingAll(false);
    }
  };

  // Save stamp setting
  const handleSaveStampSetting = async () => {
    setIsSavingStampSetting(true);
    try {
      const token = getAuthToken();
      const validRewards = stampSettingForm.filter((r) => r.description.trim());
      const res = await fetch(`${API_BASE}/api/franchise/stamp-setting`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rewards: validRewards, alimtalkEnabled: stampAlimtalk, storeEditLocked: stampStoreEditLocked }),
      });
      if (res.ok) {
        const data = await res.json();
        const s = data.setting;
        if (s) {
          const rewards: StampRewardSetting[] = s.rewards || [];
          setStampSetting({ id: s.id, enabled: s.enabled, rewards, alimtalkEnabled: s.alimtalkEnabled, storeEditLocked: s.storeEditLocked });
          setStampStoreEditLocked(s.storeEditLocked ?? false);
        }
        setIsStampSettingOpen(false);
      }
    } catch (err) {
      console.error('Failed to save stamp setting:', err);
    } finally {
      setIsSavingStampSetting(false);
    }
  };

  // 공통 보상을 선택한 가맹점의 개별 스탬프 설정에 일괄 적용 (현재 폼 내용 저장 후 적용)
  const handleApplyRewardsToStores = async () => {
    if (applyStoreIds.size === 0) return;
    const validRewards = stampSettingForm.filter((r) => r.description.trim());
    if (validRewards.length === 0) {
      setApplyMessage({ type: 'error', text: '먼저 보상 내용을 입력해주세요.' });
      return;
    }

    setIsApplyingRewards(true);
    setApplyMessage(null);
    try {
      const token = getAuthToken();

      // 1. 현재 폼의 공통 보상을 먼저 저장
      const saveRes = await fetch(`${API_BASE}/api/franchise/stamp-setting`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rewards: validRewards, alimtalkEnabled: stampAlimtalk, storeEditLocked: stampStoreEditLocked }),
      });
      if (!saveRes.ok) {
        const body = await saveRes.json().catch(() => ({}));
        throw new Error(body.error || '공통 보상 저장에 실패했습니다.');
      }
      const saved = await saveRes.json();
      if (saved.setting) {
        setStampSetting({
          id: saved.setting.id,
          enabled: saved.setting.enabled,
          rewards: saved.setting.rewards || [],
          alimtalkEnabled: saved.setting.alimtalkEnabled,
          storeEditLocked: saved.setting.storeEditLocked,
        });
      }

      // 2. 선택한 가맹점에 일괄 적용
      const res = await fetch(`${API_BASE}/api/franchise/stamp-setting/apply-to-stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeIds: Array.from(applyStoreIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '보상 일괄 적용에 실패했습니다.');
      }
      setApplyMessage({ type: 'success', text: `${data.appliedCount}개 가맹점에 공통 보상을 적용했습니다.` });
      setApplyStoreIds(new Set());
    } catch (err: any) {
      setApplyMessage({ type: 'error', text: err.message || '보상 일괄 적용 중 오류가 발생했습니다.' });
    } finally {
      setIsApplyingRewards(false);
    }
  };

  const toggleApplyStore = (storeId: string) => {
    setApplyStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  };

  const toggleApplyAllStores = () => {
    setApplyStoreIds((prev) =>
      prev.size === stores.length ? new Set() : new Set(stores.map((s) => s.id))
    );
  };

  // Add reward tier
  const handleAddRewardTier = () => {
    const usedTiers = stampSettingForm.map((r) => r.tier);
    const nextTier = [5, 10, 15, 20, 25, 30, 1, 2, 3, 4, 6, 7, 8, 9].find((t) => !usedTiers.includes(t));
    if (nextTier) {
      setStampSettingForm([...stampSettingForm, { tier: nextTier, description: '' }]);
    }
  };

  // Remove reward tier
  const handleRemoveRewardTier = (index: number) => {
    setStampSettingForm(stampSettingForm.filter((_, i) => i !== index));
  };

  // Update reward tier
  const handleUpdateRewardTier = (index: number, field: 'tier' | 'description', value: string | number) => {
    setStampSettingForm(stampSettingForm.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  useEffect(() => {
    fetchStores();
    fetchFranchiseWallet();
    fetchStampSetting();
  }, [fetchStores, fetchFranchiseWallet, fetchStampSetting]);

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

  // 지역 헬퍼: 시/도, 시/군/구 (정규화 필드 우선, 없으면 주소 토큰)
  const getSido = (store: StoreData): string =>
    (store.addressSido || '').trim() || (store.address || '').split(' ')[0] || '미상';
  const getSigungu = (store: StoreData): string =>
    (store.addressSigungu || '').trim() || (store.address || '').split(' ')[1] || '';
  // 지역 라벨 (시/도 + 시/군/구)
  const getRegionLabel = (store: StoreData): string => {
    const parts = [getSido(store), getSigungu(store)].filter(Boolean);
    return parts.join(' ') || '미상';
  };

  // 필터 옵션 (데이터에서 유니크 추출)
  const sidoOptions = Array.from(new Set(stores.map(getSido).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
  // 시/군/구 옵션은 선택된 시/도에 종속
  const sigunguOptions = Array.from(
    new Set(
      stores
        .filter((s) => sidoFilter === 'all' || getSido(s) === sidoFilter)
        .map(getSigungu)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ko'));
  const managerOptions = Array.from(
    new Set(stores.map((s) => (s.managerName || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'ko'));
  const hasUnassigned = stores.some((s) => !(s.managerName || '').trim());

  // Filter stores
  const filteredStores = stores.filter((store) => {
    const matchesSearch = store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (store.address || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || store.category === categoryFilter;
    const matchesSido = sidoFilter === 'all' || getSido(store) === sidoFilter;
    const matchesSigungu = sigunguFilter === 'all' || getSigungu(store) === sigunguFilter;
    const matchesManager =
      managerFilter === 'all' ||
      (managerFilter === '__unassigned__'
        ? !(store.managerName || '').trim()
        : (store.managerName || '').trim() === managerFilter);

    return matchesSearch && matchesCategory && matchesSido && matchesSigungu && matchesManager;
  });

  // 정렬 적용 (미선택 시 기존 순서 = 최신 등록순)
  const sortedStores = sortKey
    ? [...filteredStores].sort((a, b) => {
        const av = (a[sortKey] as number) || 0;
        const bv = (b[sortKey] as number) || 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      })
    : filteredStores;

  // 정렬 헤더 클릭: 같은 키면 방향 토글, 다른 키면 많은 순부터
  const handleSortClick = (key: 'customerCount' | 'stampRewardCustomers') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // 필터 결과 합계
  const filteredTotalCustomers = filteredStores.reduce((sum, s) => sum + (s.customerCount || 0), 0);
  const filteredTotalRewardCustomers = filteredStores.reduce((sum, s) => sum + (s.stampRewardCustomers || 0), 0);

  // 담당자 저장
  const saveManagerName = async (storeId: string) => {
    if (savingManager) return;
    setSavingManager(true);
    const name = managerInput.trim();
    try {
      const token = localStorage.getItem('franchiseToken');
      const res = await fetch(`${API_BASE}/api/franchise/stores/${storeId}/manager`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ managerName: name }),
      });
      if (res.ok) {
        setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, managerName: name || null } : s)));
      }
    } catch (e) {
      console.error('Failed to save manager name:', e);
    } finally {
      setSavingManager(false);
      setEditingManagerStoreId(null);
      setManagerInput('');
    }
  };

  // 엑셀 다운로드 (현재 필터 결과)
  const handleExcelDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = sortedStores.map((s) => ({
      상호명: s.name,
      지역: getRegionLabel(s),
      담당자: (s.managerName || '').trim() || '미지정',
      '고객 수': s.customerCount || 0,
      '스탬프 보상 수령 고객': s.stampRewardCustomers || 0,
    }));
    // 합계 행
    rows.push({
      상호명: `합계 (${filteredStores.length}개 매장)`,
      지역: '',
      담당자: '',
      '고객 수': filteredTotalCustomers,
      '스탬프 보상 수령 고객': filteredTotalRewardCustomers,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '가맹점 고객 현황');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `가맹점_고객현황_${date}.xlsx`);
  };

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

            {/* 지역 필터: 시/도 → 시/군/구 (시 단위만으로도 필터 가능) */}
            <select
              value={sidoFilter}
              onChange={(e) => {
                setSidoFilter(e.target.value);
                setSigunguFilter('all'); // 시/도 변경 시 세부지역 초기화
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-franchise-600"
            >
              <option value="all">시/도 전체</option>
              {sidoOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={sigunguFilter}
              onChange={(e) => setSigunguFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-franchise-600"
            >
              <option value="all">시/군/구 전체</option>
              {sigunguOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* 담당자 필터 */}
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-franchise-600"
            >
              <option value="all">담당자 전체</option>
              {managerOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {hasUnassigned && <option value="__unassigned__">미지정</option>}
            </select>

            {/* 엑셀 다운로드 */}
            <button
              onClick={handleExcelDownload}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              엑셀 다운로드
            </button>
          </div>

          {/* 필터 결과 합계 */}
          <div className="px-4 pb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">
              필터 결과 <span className="font-semibold text-slate-900">{filteredStores.length.toLocaleString()}개</span> 매장
            </span>
            <span className="text-slate-500">
              총 고객 수 <span className="font-semibold text-franchise-700">{filteredTotalCustomers.toLocaleString()}명</span>
            </span>
            <span className="text-slate-500">
              스탬프 보상 수령 고객 <span className="font-semibold text-amber-600">{filteredTotalRewardCustomers.toLocaleString()}명</span>
            </span>
          </div>
        </div>

        {/* Franchise Stamp Setting Section */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <button
            onClick={() => setIsStampSettingOpen(!isStampSettingOpen)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-franchise-100 rounded-lg flex items-center justify-center">
                <Gift className="w-5 h-5 text-franchise-600" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-slate-900">통합 스탬프 보상 설정</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {stampSetting?.rewards && stampSetting.rewards.length > 0
                    ? `${stampSetting.rewards.length}개 보상 설정됨`
                    : '보상을 설정해주세요'}
                </p>
              </div>
            </div>
            <ChevronDown className={cn('w-5 h-5 text-slate-400 transition-transform', isStampSettingOpen && 'rotate-180')} />
          </button>

          {isStampSettingOpen && (
            <div className="px-6 pb-6 border-t border-slate-100">
              <div className="pt-4 space-y-4">
                {/* Reward Tiers */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">보상 목록</label>
                  <div className="space-y-3">
                    {stampSettingForm.map((reward, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-20">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={reward.tier}
                            onChange={(e) => handleUpdateRewardTier(idx, 'tier', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-franchise-600"
                          />
                          <span className="text-[10px] text-slate-400 block text-center mt-0.5">개 달성</span>
                        </div>
                        <input
                          type="text"
                          value={reward.description}
                          onChange={(e) => handleUpdateRewardTier(idx, 'description', e.target.value)}
                          placeholder="보상 내용 (예: 아메리카노 1잔)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-600"
                        />
                        <button
                          onClick={() => handleRemoveRewardTier(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {stampSettingForm.length < 10 && (
                    <button
                      onClick={handleAddRewardTier}
                      className="mt-3 text-sm text-franchise-600 hover:text-franchise-700 font-medium"
                    >
                      + 보상 추가
                    </button>
                  )}
                </div>

                {/* AlimTalk Toggle */}
                <div className="flex items-center justify-between py-3 border-t border-slate-100">
                  <div>
                    <span className="text-sm font-medium text-slate-700">알림톡 발송</span>
                    <p className="text-xs text-slate-500 mt-0.5">스탬프 적립 시 고객에게 카카오 알림톡을 발송합니다</p>
                  </div>
                  <button
                    onClick={() => setStampAlimtalk(!stampAlimtalk)}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      stampAlimtalk ? 'bg-franchise-600' : 'bg-slate-200'
                    )}
                  >
                    <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', stampAlimtalk && 'translate-x-5')} />
                  </button>
                </div>

                {/* 가맹점 수정 잠금 Toggle */}
                <div className="flex items-center justify-between py-3 border-t border-slate-100">
                  <div>
                    <span className="text-sm font-medium text-slate-700">가맹점 스탬프 설정 잠금</span>
                    <p className="text-xs text-slate-500 mt-0.5">전 매장의 점주가 스탬프 보상·설정을 수정하지 못하도록 잠급니다</p>
                  </div>
                  <button
                    onClick={() => setStampStoreEditLocked(!stampStoreEditLocked)}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      stampStoreEditLocked ? 'bg-franchise-600' : 'bg-slate-200'
                    )}
                  >
                    <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', stampStoreEditLocked && 'translate-x-5')} />
                  </button>
                </div>

                {/* 가맹점 일괄 적용 */}
                <div className="py-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium text-slate-700">가맹점에 공통 보상 일괄 적용</span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        선택한 가맹점의 개별 스탬프 보상을 위 공통 보상으로 덮어쓰고 스탬프를 활성화합니다
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={stores.length > 0 && applyStoreIds.size === stores.length}
                        onChange={toggleApplyAllStores}
                        className="w-4 h-4 rounded border-slate-300 text-franchise-600 focus:ring-franchise-600"
                      />
                      모두 선택
                    </label>
                  </div>
                  <div className="mt-3 max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {stores.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">가맹점이 없습니다.</p>
                    ) : (
                      stores.map((store) => (
                        <label
                          key={store.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={applyStoreIds.has(store.id)}
                            onChange={() => toggleApplyStore(store.id)}
                            className="w-4 h-4 rounded border-slate-300 text-franchise-600 focus:ring-franchise-600"
                          />
                          <span className="text-sm text-slate-700 flex-1">{store.name}</span>
                          {store.address && (
                            <span className="text-xs text-slate-400 truncate max-w-[200px]">{store.address}</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className={cn(
                      'text-xs',
                      applyMessage?.type === 'success' ? 'text-green-600' : applyMessage?.type === 'error' ? 'text-red-600' : 'text-slate-500'
                    )}>
                      {applyMessage
                        ? applyMessage.text
                        : applyStoreIds.size > 0
                          ? `${applyStoreIds.size}개 가맹점 선택됨`
                          : ''}
                    </p>
                    <button
                      onClick={handleApplyRewardsToStores}
                      disabled={isApplyingRewards || applyStoreIds.size === 0}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        isApplyingRewards || applyStoreIds.size === 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-franchise-600 text-white hover:bg-franchise-700'
                      )}
                    >
                      {isApplyingRewards ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 적용 중...</>
                      ) : (
                        <><Check className="w-4 h-4" /> 선택 가맹점에 적용</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveStampSetting}
                    disabled={isSavingStampSetting}
                    className={cn(
                      'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isSavingStampSetting ? 'bg-slate-100 text-slate-400' : 'bg-franchise-600 text-white hover:bg-franchise-700'
                    )}
                  >
                    {isSavingStampSetting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
                    ) : (
                      <><Check className="w-4 h-4" /> 보상 설정 저장</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-full">
                    가맹점명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    지역
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    업종
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <span>통합 스탬프</span>
                      <button
                        onClick={() => {
                          const allEnabled = stores.every((s) => s.franchiseStampEnabled);
                          handleStampToggleAll(!allEnabled);
                        }}
                        disabled={isTogglingAll}
                        className={cn(
                          'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                          isTogglingAll ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                          stores.length > 0 && stores.every((s) => s.franchiseStampEnabled) ? 'bg-franchise-600' : 'bg-slate-200'
                        )}
                      >
                        <div className={cn(
                          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                          stores.length > 0 && stores.every((s) => s.franchiseStampEnabled) && 'translate-x-4'
                        )} />
                      </button>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    담당자
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    <button
                      onClick={() => handleSortClick('customerCount')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase"
                      title="클릭하여 정렬 (많은 순 ↔ 적은 순)"
                    >
                      고객수
                      <span className={cn('text-[10px]', sortKey === 'customerCount' ? 'text-franchise-600' : 'text-slate-300')}>
                        {sortKey === 'customerCount' ? (sortDir === 'desc' ? '▼' : '▲') : '▼'}
                      </span>
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    <button
                      onClick={() => handleSortClick('stampRewardCustomers')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase"
                      title="클릭하여 정렬 (많은 순 ↔ 적은 순)"
                    >
                      스탬프 보상 수령
                      <span className={cn('text-[10px]', sortKey === 'stampRewardCustomers' ? 'text-franchise-600' : 'text-slate-300')}>
                        {sortKey === 'stampRewardCustomers' ? (sortDir === 'desc' ? '▼' : '▲') : '▼'}
                      </span>
                    </button>
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
                  sortedStores.map((store) => (
                    <tr
                      key={store.id}
                      onClick={() => handleRowClick(store)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-franchise-100 rounded-lg flex items-center justify-center shrink-0">
                            <Store className="w-4 h-4 text-franchise-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 whitespace-nowrap">{store.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                        <span title={store.address || ''}>{getRegionLabel(store)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{store.category ? CATEGORY_LABELS[store.category] || store.category : '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={(e) => handleStampToggle(store.id, e)}
                          disabled={togglingStoreId === store.id}
                          className={cn(
                            'relative w-9 h-5 rounded-full transition-colors inline-block',
                            togglingStoreId === store.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                            store.franchiseStampEnabled ? 'bg-franchise-600' : 'bg-slate-200'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                            store.franchiseStampEnabled && 'translate-x-4'
                          )} />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {editingManagerStoreId === store.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={managerInput}
                            onChange={(e) => setManagerInput(e.target.value)}
                            onBlur={() => saveManagerName(store.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                setEditingManagerStoreId(null);
                                setManagerInput('');
                              }
                            }}
                            placeholder="담당자 이름"
                            disabled={savingManager}
                            className="w-24 px-2 py-1 text-sm border border-franchise-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setEditingManagerStoreId(store.id);
                              setManagerInput((store.managerName || '').trim());
                            }}
                            className={cn(
                              'px-2 py-1 text-sm rounded-lg transition-colors whitespace-nowrap',
                              (store.managerName || '').trim()
                                ? 'text-slate-900 hover:bg-slate-100'
                                : 'text-slate-400 hover:bg-slate-100 border border-dashed border-slate-300'
                            )}
                            title="클릭하여 담당자 입력"
                          >
                            {(store.managerName || '').trim() || '+ 입력'}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium whitespace-nowrap">
                        {store.customerCount.toLocaleString()}명
                      </td>
                      <td className="px-6 py-4 text-sm text-amber-600 text-right font-medium whitespace-nowrap">
                        {(store.stampRewardCustomers || 0).toLocaleString()}명
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

                {/* Franchise Stamp Toggle */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">통합 스탬프</h3>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">통합 스탬프 참여</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {selectedStore.franchiseStampEnabled
                            ? '이 매장의 스탬프가 프랜차이즈 통합으로 적립됩니다'
                            : '이 매장은 개별 스탬프를 사용합니다'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleStampToggle(selectedStore.id, e)}
                        disabled={togglingStoreId === selectedStore.id}
                        className={cn(
                          'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                          togglingStoreId === selectedStore.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                          selectedStore.franchiseStampEnabled ? 'bg-franchise-600' : 'bg-slate-200'
                        )}
                      >
                        <div className={cn(
                          'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                          selectedStore.franchiseStampEnabled && 'translate-x-5'
                        )} />
                      </button>
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
