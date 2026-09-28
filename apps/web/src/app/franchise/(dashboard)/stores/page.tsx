'use client';

import { API_BASE } from '@/lib/api-config';
import { getFranchiseToken } from '@/lib/auth-token';
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
  Compass,
  ExternalLink,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skel, rise } from '@/features/admin-ui';


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

  // 방문 경로 설정 (전 가맹점 일괄)
  const [isVisitSourceOpen, setIsVisitSourceOpen] = useState(false);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(true);
  const [visitSourceOptions, setVisitSourceOptions] = useState<Array<{ id: string; label: string; order: number; enabled: boolean }>>([]);
  const [newVisitSourceLabel, setNewVisitSourceLabel] = useState('');
  const [isSavingVisitSource, setIsSavingVisitSource] = useState(false);
  const [visitSourceMsg, setVisitSourceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [stampSettingForm, setStampSettingForm] = useState<StampRewardSetting[]>([]);
  const [stampAlimtalk, setStampAlimtalk] = useState(true);
  const [stampStoreEditLocked, setStampStoreEditLocked] = useState(false);
  const [isSavingStampSetting, setIsSavingStampSetting] = useState(false);

  // 공통 보상 가맹점 일괄 적용 state
  const [applyStoreIds, setApplyStoreIds] = useState<Set<string>>(new Set());
  const [isApplyingRewards, setIsApplyingRewards] = useState(false);
  const [applyMessage, setApplyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [togglingStoreId, setTogglingStoreId] = useState<string | null>(null);
  const [impersonatingStoreId, setImpersonatingStoreId] = useState<string | null>(null);
  const [isTogglingAll, setIsTogglingAll] = useState(false);

  // Auth token helper
  // Fetch stores
  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();
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

  // 방문 경로 설정 조회 (전 가맹점 일괄 편집 기준값)
  const fetchVisitSource = useCallback(async () => {
    try {
      const token = getFranchiseToken();
      const res = await fetch(`${API_BASE}/api/franchise/visit-source`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVisitSourceEnabled(data.enabled ?? true);
        setVisitSourceOptions(Array.isArray(data.options) ? data.options : []);
      }
    } catch (err) {
      console.error('Failed to fetch visit source:', err);
    }
  }, []);

  // 방문 경로 설정 전 가맹점 일괄 적용
  const handleSaveVisitSource = async () => {
    const enabledCount = visitSourceOptions.filter((o) => o.enabled).length;
    if (visitSourceOptions.length === 0 || enabledCount === 0) {
      setVisitSourceMsg({ type: 'error', text: '활성화된 방문 경로가 1개 이상 필요합니다.' });
      return;
    }
    if (!window.confirm(`모든 가맹점(${stores.length}개)의 방문 경로 설정을 이 내용으로 덮어씁니다. 진행할까요?`)) return;
    setIsSavingVisitSource(true);
    setVisitSourceMsg(null);
    try {
      const token = getFranchiseToken();
      const res = await fetch(`${API_BASE}/api/franchise/visit-source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: visitSourceEnabled, options: visitSourceOptions }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVisitSourceMsg({ type: 'success', text: `${data.appliedStores}개 가맹점에 적용됐습니다.` });
        setVisitSourceOptions(data.options || visitSourceOptions);
      } else {
        setVisitSourceMsg({ type: 'error', text: data.error || '적용에 실패했습니다.' });
      }
    } catch {
      setVisitSourceMsg({ type: 'error', text: '적용 중 오류가 발생했습니다.' });
    } finally {
      setIsSavingVisitSource(false);
    }
  };

  const addVisitSourceOption = () => {
    const label = newVisitSourceLabel.trim();
    if (!label) return;
    if (visitSourceOptions.length >= 12) {
      setVisitSourceMsg({ type: 'error', text: '방문 경로 옵션은 최대 12개까지 가능합니다.' });
      return;
    }
    setVisitSourceOptions((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label, order: prev.length + 1, enabled: true },
    ]);
    setNewVisitSourceLabel('');
  };

  // Toggle individual store stamp
  // 가맹점 CRM 대리 로그인 — 새 탭에서 해당 가맹점 대시보드 열기
  const handleOpenStoreCrm = async (storeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setImpersonatingStoreId(storeId);
    try {
      const token = localStorage.getItem('franchiseToken');
      const res = await fetch(`${API_BASE}/api/franchise/stores/${storeId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CRM 접속에 실패했습니다.');
      // 가맹점 Owner 토큰 저장 후 새 탭에서 매장 대시보드 열기
      localStorage.setItem('token', data.token);
      window.open('/home', '_blank');
    } catch (err: any) {
      alert(err.message || 'CRM 접속에 실패했습니다.');
    } finally {
      setImpersonatingStoreId(null);
    }
  };

  const handleStampToggle = async (storeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingStoreId(storeId);
    try {
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();

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
    fetchVisitSource();
  }, [fetchStores, fetchFranchiseWallet, fetchStampSetting, fetchVisitSource]);

  // Fetch store detail
  const fetchStoreDetail = useCallback(async (storeId: string) => {
    try {
      const token = getFranchiseToken();
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
      const token = getFranchiseToken();
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
  // "시" 구분(특별시/광역시/특별자치시) vs "도" 구분(도/특별자치도) 분리
  // 예: 서울특별시·부산광역시·세종특별자치시 → 시 / 경기도·강원특별자치도·제주특별자치도 → 도
  const isSiType = (sido: string) => /(특별시|광역시|특별자치시)$/.test(sido);
  const siOptions = sidoOptions.filter(isSiType);
  const doOptions = sidoOptions.filter((s) => !isSiType(s));
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

  // 공통 스타일 (표시 전용)
  const primaryBtn =
    'ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40';
  const secondaryBtn =
    'ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40';
  const fieldCls =
    'h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none';
  const selectCls =
    'h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] focus:border-[color:var(--ad-navy)] focus:outline-none';
  const thCls = 'whitespace-nowrap px-4 py-2.5 font-medium';
  const checkboxCls = 'h-4 w-4 rounded border-[color:var(--ad-line-strong)] accent-[#1d2022]';

  // Loading skeleton
  const renderSkeleton = () => (
    <div>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[color:var(--ad-line)] px-4 py-3.5 last:border-b-0">
          <Skel className="h-4 w-48" />
          <Skel className="h-4 w-24" />
          <Skel className="h-4 w-20" />
          <Skel className="h-4 w-16" />
          <Skel className="h-4 w-16" />
          <Skel className="h-4 w-24" />
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--ad-bg)]">
        <Store className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
      </span>
      <h3 className="mt-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">가맹점이 없습니다</h3>
      <p className="text-[13px] text-[color:var(--ad-muted)]">검색 조건을 변경해보세요</p>
    </div>
  );

  // 토글 스위치 (on = 검정)
  const switchCls = (on: boolean, size: 'sm' | 'md' = 'sm') =>
    cn(
      'relative shrink-0 rounded-full transition-colors',
      size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
      on ? 'bg-[color:var(--ad-ink)]' : 'bg-[color:var(--ad-line-strong)]'
    );
  const knobCls = (on: boolean, size: 'sm' | 'md' = 'sm') =>
    cn(
      'absolute left-0.5 top-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform',
      size === 'md' ? 'h-5 w-5' : 'h-4 w-4',
      on && (size === 'md' ? 'translate-x-5' : 'translate-x-4')
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Header */}
      <header className="ad-rise mb-5 flex flex-wrap items-center justify-between gap-3" style={rise(0)}>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">가맹점</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            전체 <span className="ad-tnum">{stores.length}</span>개 가맹점 중 <span className="ad-tnum">{filteredStores.length}</span>개 표시
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Search and Filters */}
        <section className="ad-card ad-rise" style={rise(1)}>
          <div className="flex flex-wrap items-center gap-2 p-4">
            {/* Search */}
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="가맹점명 또는 주소로 검색"
                className={cn(fieldCls, 'h-9 w-full pl-9 pr-3 text-[13px]')}
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className={secondaryBtn}
              >
                <Filter className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                {CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" />
              </button>
              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute z-20 mt-1.5 max-h-80 w-48 overflow-y-auto rounded-[14px] bg-white p-1 shadow-[0_0_0_1px_var(--ad-line),0_16px_40px_-16px_rgba(19,22,81,0.3)]">
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setCategoryFilter(option.value);
                          setShowCategoryDropdown(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                          categoryFilter === option.value
                            ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]'
                            : 'text-[color:var(--ad-ink-2)]'
                        )}
                      >
                        {option.label}
                        {categoryFilter === option.value && <Check className="h-3.5 w-3.5 text-[color:var(--ad-ink)]" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 지역 필터: "시"(특별시·광역시·특별자치시)와 "도"를 별도 드롭다운으로 구분 */}
            <select
              value={siOptions.includes(sidoFilter) ? sidoFilter : 'all'}
              onChange={(e) => {
                setSidoFilter(e.target.value);
                setSigunguFilter('all'); // 시/도 변경 시 세부지역 초기화
              }}
              className={selectCls}
            >
              <option value="all">시 전체</option>
              {siOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={doOptions.includes(sidoFilter) ? sidoFilter : 'all'}
              onChange={(e) => {
                setSidoFilter(e.target.value);
                setSigunguFilter('all'); // 시/도 변경 시 세부지역 초기화
              }}
              className={selectCls}
            >
              <option value="all">도 전체</option>
              {doOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={sigunguFilter}
              onChange={(e) => setSigunguFilter(e.target.value)}
              className={selectCls}
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
              className={selectCls}
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
              className={cn(secondaryBtn, 'ml-auto')}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              엑셀 다운로드
            </button>
          </div>

          {/* 필터 결과 합계 */}
          <div className="grid grid-cols-1 border-t border-[color:var(--ad-line)] sm:grid-cols-3">
            <div className="px-5 py-3.5">
              <p className="text-[12px] text-[color:var(--ad-muted)]">필터 결과</p>
              <p className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {filteredStores.length.toLocaleString()}
                <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">개 매장</span>
              </p>
            </div>
            <div className="border-t border-[color:var(--ad-line)] px-5 py-3.5 sm:border-l sm:border-t-0">
              <p className="text-[12px] text-[color:var(--ad-muted)]">총 고객 수</p>
              <p className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {filteredTotalCustomers.toLocaleString()}
                <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">명</span>
              </p>
            </div>
            <div className="border-t border-[color:var(--ad-line)] px-5 py-3.5 sm:border-l sm:border-t-0">
              <p className="text-[12px] text-[color:var(--ad-muted)]">스탬프 보상 수령 고객</p>
              <p className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {filteredTotalRewardCustomers.toLocaleString()}
                <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">명</span>
              </p>
            </div>
          </div>
        </section>

        {/* Franchise Stamp Setting Section */}
        <section className="ad-card ad-rise overflow-hidden" style={rise(2)}>
          <button
            onClick={() => setIsStampSettingOpen(!isStampSettingOpen)}
            className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
          >
            <div className="flex items-center gap-3">
              <Gift className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="text-left">
                <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">통합 스탬프 보상 설정</h3>
                <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
                  {stampSetting?.rewards && stampSetting.rewards.length > 0
                    ? `${stampSetting.rewards.length}개 보상 설정됨`
                    : '보상을 설정해주세요'}
                </p>
              </div>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-[color:var(--ad-faint)] transition-transform', isStampSettingOpen && 'rotate-180')} />
          </button>

          {isStampSettingOpen && (
            <div className="border-t border-[color:var(--ad-line)] px-5 pb-5">
              <div className="space-y-4 pt-4">
                {/* Reward Tiers */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">보상 목록</label>
                  <div className="space-y-2.5">
                    {stampSettingForm.map((reward, idx) => (
                      <div key={idx} className="flex items-center gap-2.5">
                        <div className="w-20">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={reward.tier}
                            onChange={(e) => handleUpdateRewardTier(idx, 'tier', parseInt(e.target.value) || 1)}
                            className={cn(fieldCls, 'ad-tnum w-full text-center')}
                          />
                          <span className="mt-0.5 block text-center text-[10.5px] text-[color:var(--ad-faint)]">개 달성</span>
                        </div>
                        <input
                          type="text"
                          value={reward.description}
                          onChange={(e) => handleUpdateRewardTier(idx, 'description', e.target.value)}
                          placeholder="보상 내용 (예: 아메리카노 1잔)"
                          className={cn(fieldCls, 'min-w-0 flex-1 self-start')}
                        />
                        <button
                          onClick={() => handleRemoveRewardTier(idx)}
                          className="ad-press grid h-8 w-8 shrink-0 place-items-center self-start rounded-[10px] text-[color:var(--ad-faint)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-neg)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {stampSettingForm.length < 10 && (
                    <button
                      onClick={handleAddRewardTier}
                      className="mt-3 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                    >
                      + 보상 추가
                    </button>
                  )}
                </div>

                {/* AlimTalk Toggle */}
                <div className="flex items-center justify-between gap-4 border-t border-[color:var(--ad-line)] py-3">
                  <div>
                    <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">알림톡 발송</span>
                    <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">스탬프 적립 시 고객에게 카카오 알림톡을 발송합니다</p>
                  </div>
                  <button
                    onClick={() => setStampAlimtalk(!stampAlimtalk)}
                    className={switchCls(stampAlimtalk, 'md')}
                  >
                    <div className={knobCls(stampAlimtalk, 'md')} />
                  </button>
                </div>

                {/* 가맹점 수정 잠금 Toggle */}
                <div className="flex items-center justify-between gap-4 border-t border-[color:var(--ad-line)] py-3">
                  <div>
                    <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">가맹점 스탬프 설정 잠금</span>
                    <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">전 매장의 점주가 스탬프 보상·설정을 수정하지 못하도록 잠급니다</p>
                  </div>
                  <button
                    onClick={() => setStampStoreEditLocked(!stampStoreEditLocked)}
                    className={switchCls(stampStoreEditLocked, 'md')}
                  >
                    <div className={knobCls(stampStoreEditLocked, 'md')} />
                  </button>
                </div>

                {/* 가맹점 일괄 적용 */}
                <div className="border-t border-[color:var(--ad-line)] py-3">
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">가맹점에 공통 보상 일괄 적용</span>
                      <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">
                        선택한 가맹점의 개별 스탬프 보상을 위 공통 보상으로 덮어쓰고 스탬프를 활성화합니다
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-[color:var(--ad-ink-2)]">
                      <input
                        type="checkbox"
                        checked={stores.length > 0 && applyStoreIds.size === stores.length}
                        onChange={toggleApplyAllStores}
                        className={checkboxCls}
                      />
                      모두 선택
                    </label>
                  </div>
                  <div className="mt-3 max-h-52 divide-y divide-[color:var(--ad-line)] overflow-y-auto rounded-[12px] border border-[color:var(--ad-line)]">
                    {stores.length === 0 ? (
                      <p className="px-4 py-3 text-[13px] text-[color:var(--ad-faint)]">가맹점이 없습니다.</p>
                    ) : (
                      stores.map((store) => (
                        <label
                          key={store.id}
                          className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                        >
                          <input
                            type="checkbox"
                            checked={applyStoreIds.has(store.id)}
                            onChange={() => toggleApplyStore(store.id)}
                            className={checkboxCls}
                          />
                          <span className="flex-1 text-[13px] text-[color:var(--ad-ink-2)]">{store.name}</span>
                          {store.address && (
                            <span className="max-w-[200px] truncate text-[12px] text-[color:var(--ad-faint)]">{store.address}</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className={cn(
                      'text-[12px]',
                      applyMessage?.type === 'success' ? 'text-[color:var(--ad-pos)]' : applyMessage?.type === 'error' ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-muted)]'
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
                      className={secondaryBtn}
                    >
                      {isApplyingRewards ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> 적용 중...</>
                      ) : (
                        <><Check className="h-4 w-4" /> 선택 가맹점에 적용</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end border-t border-[color:var(--ad-line)] pt-4">
                  <button
                    onClick={handleSaveStampSetting}
                    disabled={isSavingStampSetting}
                    className={primaryBtn}
                  >
                    {isSavingStampSetting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> 저장 중...</>
                    ) : (
                      <><Check className="h-4 w-4" /> 보상 설정 저장</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 방문 경로 설정 (전 가맹점 일괄) */}
        <section className="ad-card ad-rise overflow-hidden" style={rise(3)}>
          <button
            onClick={() => setIsVisitSourceOpen(!isVisitSourceOpen)}
            className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
          >
            <div className="flex items-center gap-3">
              <Compass className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="text-left">
                <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">방문 경로 설정</h3>
                <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
                  고객 적립 시 묻는 방문 경로 선택지를 전 가맹점에 일괄 적용합니다
                </p>
              </div>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-[color:var(--ad-faint)] transition-transform', isVisitSourceOpen && 'rotate-180')} />
          </button>

          {isVisitSourceOpen && (
            <div className="border-t border-[color:var(--ad-line)] px-5 pb-5">
              <div className="space-y-4 pt-4">
                {/* 전체 사용 여부 */}
                <div className="flex items-center justify-between gap-4 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">방문 경로 질문 사용</p>
                    <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">끄면 전 가맹점에서 방문 경로를 묻지 않습니다</p>
                  </div>
                  <button
                    onClick={() => setVisitSourceEnabled(!visitSourceEnabled)}
                    className={switchCls(visitSourceEnabled)}
                  >
                    <div className={knobCls(visitSourceEnabled)} />
                  </button>
                </div>

                {/* 옵션 목록 */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                    선택지 목록 <span className="ad-tnum font-normal text-[color:var(--ad-faint)]">({visitSourceOptions.length}/12)</span>
                  </label>
                  <div className="space-y-2">
                    {visitSourceOptions.map((opt, idx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <span className="ad-tnum w-6 text-center text-[12px] text-[color:var(--ad-faint)]">{idx + 1}</span>
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) =>
                            setVisitSourceOptions((prev) =>
                              prev.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o))
                            )
                          }
                          className={cn(fieldCls, 'min-w-0 flex-1')}
                        />
                        <button
                          onClick={() =>
                            setVisitSourceOptions((prev) =>
                              prev.map((o) => (o.id === opt.id ? { ...o, enabled: !o.enabled } : o))
                            )
                          }
                          className={cn(
                            'ad-press h-8 shrink-0 rounded-full px-3 text-[12px] font-medium transition-colors',
                            opt.enabled
                              ? 'bg-[color:var(--ad-ink)] text-white'
                              : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)]'
                          )}
                        >
                          {opt.enabled ? '노출' : '숨김'}
                        </button>
                        <button
                          onClick={() => setVisitSourceOptions((prev) => prev.filter((o) => o.id !== opt.id))}
                          className="ad-press grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[color:var(--ad-faint)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-neg)]"
                          title="삭제"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 옵션 추가 */}
                  <div className="mt-3 flex items-center gap-2 pl-8">
                    <input
                      type="text"
                      value={newVisitSourceLabel}
                      onChange={(e) => setNewVisitSourceLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addVisitSourceOption(); }}
                      placeholder="새 선택지 이름 (예: 틱톡)"
                      className={cn(fieldCls, 'min-w-0 flex-1')}
                    />
                    <button
                      onClick={addVisitSourceOption}
                      className={secondaryBtn}
                    >
                      추가
                    </button>
                  </div>
                </div>

                {visitSourceMsg && (
                  <p className={cn('text-[13px]', visitSourceMsg.type === 'success' ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]')}>
                    {visitSourceMsg.text}
                  </p>
                )}

                <div className="flex justify-end border-t border-[color:var(--ad-line)] pt-4">
                  <button
                    onClick={handleSaveVisitSource}
                    disabled={isSavingVisitSource}
                    className={primaryBtn}
                  >
                    {isSavingVisitSource ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> 적용 중...</>
                    ) : (
                      <><Check className="h-4 w-4" /> 전 가맹점에 일괄 적용</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Table */}
        <section className="ad-card ad-rise overflow-hidden" style={rise(4)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                  <th className={cn(thCls, 'w-full')}>
                    가맹점명
                  </th>
                  <th className={thCls}>
                    지역
                  </th>
                  <th className={thCls}>
                    업종
                  </th>
                  <th className={cn(thCls, 'text-center')}>
                    <div className="flex items-center justify-center gap-2">
                      <span>통합 스탬프</span>
                      <button
                        onClick={() => {
                          const allEnabled = stores.every((s) => s.franchiseStampEnabled);
                          handleStampToggleAll(!allEnabled);
                        }}
                        disabled={isTogglingAll}
                        className={cn(
                          switchCls(stores.length > 0 && stores.every((s) => s.franchiseStampEnabled)),
                          isTogglingAll ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                        )}
                      >
                        <div className={knobCls(stores.length > 0 && stores.every((s) => s.franchiseStampEnabled))} />
                      </button>
                    </div>
                  </th>
                  <th className={thCls}>
                    담당자
                  </th>
                  <th className={cn(thCls, 'text-right')}>
                    <button
                      onClick={() => handleSortClick('customerCount')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--ad-ink)]"
                      title="클릭하여 정렬 (많은 순 ↔ 적은 순)"
                    >
                      고객수
                      <span className={cn('text-[10px]', sortKey === 'customerCount' ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-line-strong)]')}>
                        {sortKey === 'customerCount' ? (sortDir === 'desc' ? '▼' : '▲') : '▼'}
                      </span>
                    </button>
                  </th>
                  <th className={cn(thCls, 'text-right')}>
                    <button
                      onClick={() => handleSortClick('stampRewardCustomers')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--ad-ink)]"
                      title="클릭하여 정렬 (많은 순 ↔ 적은 순)"
                    >
                      스탬프 보상 수령
                      <span className={cn('text-[10px]', sortKey === 'stampRewardCustomers' ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-line-strong)]')}>
                        {sortKey === 'stampRewardCustomers' ? (sortDir === 'desc' ? '▼' : '▲') : '▼'}
                      </span>
                    </button>
                  </th>
                  <th className={cn(thCls, 'text-center')}>
                    CRM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
                {isLoading ? (
                  <tr>
                    <td colSpan={8}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={8}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  sortedStores.map((store) => (
                    <tr
                      key={store.id}
                      onClick={() => handleRowClick(store)}
                      className="cursor-pointer transition-colors hover:bg-[rgba(110,173,255,0.05)]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Store className="h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                          <span className="whitespace-nowrap font-medium text-[color:var(--ad-ink)]">{store.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[color:var(--ad-ink-2)]">
                        <span title={store.address || ''}>{getRegionLabel(store)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[color:var(--ad-ink-2)]">{store.category ? CATEGORY_LABELS[store.category] || store.category : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => handleStampToggle(store.id, e)}
                          disabled={togglingStoreId === store.id}
                          className={cn(
                            switchCls(!!store.franchiseStampEnabled),
                            'inline-block align-middle',
                            togglingStoreId === store.id ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          )}
                        >
                          <div className={knobCls(!!store.franchiseStampEnabled)} />
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                            className="h-8 w-24 rounded-[8px] border border-[color:var(--ad-navy)] bg-white px-2 text-[13px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setEditingManagerStoreId(store.id);
                              setManagerInput((store.managerName || '').trim());
                            }}
                            className={cn(
                              'whitespace-nowrap rounded-[8px] px-2 py-1 text-[13px] transition-colors hover:bg-[color:var(--ad-bg)]',
                              (store.managerName || '').trim()
                                ? 'text-[color:var(--ad-ink)]'
                                : 'border border-dashed border-[color:var(--ad-line-strong)] text-[color:var(--ad-faint)]'
                            )}
                            title="클릭하여 담당자 입력"
                          >
                            {(store.managerName || '').trim() || '+ 입력'}
                          </button>
                        )}
                      </td>
                      <td className="ad-tnum whitespace-nowrap px-4 py-3 text-right font-medium text-[color:var(--ad-ink)]">
                        {store.customerCount.toLocaleString()}명
                      </td>
                      <td className="ad-tnum whitespace-nowrap px-4 py-3 text-right text-[color:var(--ad-ink-2)]">
                        {(store.stampRewardCustomers || 0).toLocaleString()}명
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleOpenStoreCrm(store.id, e)}
                          disabled={impersonatingStoreId === store.id}
                          className="ad-press inline-flex h-8 items-center gap-1 rounded-[10px] bg-white px-2.5 text-[12px] font-medium text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50"
                          title="이 가맹점의 CRM 대시보드를 새 탭에서 엽니다"
                        >
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                          {impersonatingStoreId === store.id ? '접속 중...' : 'CRM 접속'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Slideover */}
      {selectedStore && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm transition-opacity',
              isSlideoverOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={closeSlideover}
          />

          {/* Slideover Panel */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 w-full max-w-lg transform bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] transition-transform duration-300 ease-in-out',
              isSlideoverOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ad-line)] px-6 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ad-ink)]">{selectedStore.name}</h2>
                  <p className="mt-0.5 truncate text-[12.5px] text-[color:var(--ad-muted)]">{selectedStore.address || '-'}</p>
                </div>
                <button
                  onClick={closeSlideover}
                  className="ad-press grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[color:var(--ad-muted)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {/* Store Info */}
                <div>
                  <h3 className="mb-2.5 text-[14px] font-semibold text-[color:var(--ad-ink)]">매장 정보</h3>
                  <div className="space-y-2.5 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="shrink-0 text-[13px] text-[color:var(--ad-muted)]">업종</span>
                      <span className="text-[13px] font-medium text-[color:var(--ad-ink)]">
                        {selectedStore.category ? CATEGORY_LABELS[selectedStore.category] || selectedStore.category : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="shrink-0 text-[13px] text-[color:var(--ad-muted)]">주소</span>
                      <span className="text-right text-[13px] font-medium text-[color:var(--ad-ink)]">{selectedStore.address || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Franchise Stamp Toggle */}
                <div>
                  <h3 className="mb-2.5 text-[14px] font-semibold text-[color:var(--ad-ink)]">통합 스탬프</h3>
                  <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">통합 스탬프 참여</p>
                        <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">
                          {selectedStore.franchiseStampEnabled
                            ? '이 매장의 스탬프가 프랜차이즈 통합으로 적립됩니다'
                            : '이 매장은 개별 스탬프를 사용합니다'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleStampToggle(selectedStore.id, e)}
                        disabled={togglingStoreId === selectedStore.id}
                        className={cn(
                          switchCls(!!selectedStore.franchiseStampEnabled, 'md'),
                          togglingStoreId === selectedStore.id ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                        )}
                      >
                        <div className={knobCls(!!selectedStore.franchiseStampEnabled, 'md')} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Customer Stats */}
                <div>
                  <h3 className="mb-2.5 text-[14px] font-semibold text-[color:var(--ad-ink)]">고객 통계</h3>
                  <div className="ad-card grid grid-cols-2 overflow-hidden">
                    <div className="p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                        <span className="text-[12px] text-[color:var(--ad-muted)]">총 고객 수</span>
                      </div>
                      <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {storeDetail?.stats?.customerCount?.toLocaleString() || selectedStore.customerCount.toLocaleString()}명
                      </p>
                    </div>
                    <div className="border-l border-[color:var(--ad-line)] p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                        <span className="text-[12px] text-[color:var(--ad-muted)]">총 주문</span>
                      </div>
                      <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {storeDetail?.stats?.totalOrders?.toLocaleString() || '-'}회
                      </p>
                    </div>
                    <div className="border-t border-[color:var(--ad-line)] p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                        <span className="text-[12px] text-[color:var(--ad-muted)]">재방문율</span>
                      </div>
                      <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {storeDetail?.stats?.revisitRate !== undefined
                          ? `${Math.round(storeDetail.stats.revisitRate)}%`
                          : '-'}
                      </p>
                    </div>
                    <div className="border-l border-t border-[color:var(--ad-line)] p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                        <span className="text-[12px] text-[color:var(--ad-muted)]">평균 방문</span>
                      </div>
                      <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {storeDetail?.stats?.averageVisits !== undefined
                          ? `${storeDetail.stats.averageVisits.toFixed(1)}회`
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Transfer Section */}
                <div>
                  <h3 className="mb-2.5 text-[14px] font-semibold text-[color:var(--ad-ink)]">충전금 관리</h3>
                  <div className="ad-card space-y-4 p-4">
                    {/* Store Wallet Balance */}
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[color:var(--ad-muted)]">가맹점 충전금 잔액</span>
                      <span className="ad-tnum text-[18px] font-medium tracking-[-0.02em] text-[color:var(--ad-ink)]">
                        {storeDetail?.stats?.walletBalance !== undefined
                          ? `${storeDetail.stats.walletBalance.toLocaleString()}원`
                          : '-'}
                      </span>
                    </div>

                    <div className="border-t border-[color:var(--ad-line)] pt-4">
                      {/* Transfer Amount Input */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">이체 금액</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={transferAmount}
                            onChange={(e) => {
                              setTransferAmount(formatNumberInput(e.target.value));
                              setTransferError(null);
                            }}
                            placeholder="0"
                            className={cn(fieldCls, 'ad-tnum w-full pr-8 text-right')}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[color:var(--ad-muted)]">원</span>
                        </div>
                      </div>

                      {/* Memo Input */}
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">메모 (선택)</label>
                        <input
                          type="text"
                          value={transferMemo}
                          onChange={(e) => setTransferMemo(e.target.value)}
                          placeholder="예: 1월 마케팅 지원금"
                          className={cn(fieldCls, 'w-full')}
                        />
                      </div>

                      {/* Franchise Balance Display */}
                      <div className="mb-3 flex items-center justify-between text-[13px]">
                        <span className="text-[color:var(--ad-muted)]">본사 잔액</span>
                        <span className="ad-tnum font-medium text-[color:var(--ad-ink-2)]">
                          {franchiseWalletBalance.toLocaleString()}원
                        </span>
                      </div>

                      {/* Error Message */}
                      {transferError && (
                        <div className="mb-3 rounded-[12px] bg-[#fff2f5] px-4 py-2.5 text-[13px] text-[color:var(--ad-neg)]">
                          {transferError}
                        </div>
                      )}

                      {/* Success Message */}
                      {transferSuccess && (
                        <div className="mb-3 flex items-center gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-2.5 text-[13px] text-[color:var(--ad-ink-2)]">
                          <Check className="h-4 w-4 shrink-0 text-[color:var(--ad-pos)]" />
                          {transferSuccess}
                        </div>
                      )}

                      {/* Transfer Button */}
                      <button
                        onClick={handleTransfer}
                        disabled={isTransferring || !transferAmount}
                        className={cn(primaryBtn, 'w-full')}
                      >
                        {isTransferring ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            이체 중...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
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
