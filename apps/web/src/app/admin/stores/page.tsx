'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/utils';

// 업종 분류
const STORE_CATEGORIES = {
  // 음식점
  KOREAN: '한식',
  CHINESE: '중식',
  JAPANESE: '일식',
  WESTERN: '양식',
  ASIAN: '아시안 (베트남, 태국 등)',
  BUNSIK: '분식',
  FASTFOOD: '패스트푸드',
  MEAT: '고기/구이',
  SEAFOOD: '해산물',
  BUFFET: '뷔페',
  BRUNCH: '브런치',
  // 카페/디저트
  CAFE: '카페',
  BAKERY: '베이커리',
  DESSERT: '디저트',
  ICECREAM: '아이스크림',
  // 주점
  BEER: '호프/맥주',
  IZAKAYA: '이자카야',
  WINE_BAR: '와인바',
  COCKTAIL_BAR: '칵테일바',
  POCHA: '포차/실내포장마차',
  KOREAN_PUB: '한식 주점',
  COOK_PUB: '요리주점',
  // 기타
  FOODCOURT: '푸드코트',
  OTHER: '기타',
} as const;

const CATEGORY_GROUPS = [
  { label: '음식점', options: ['KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'ASIAN', 'BUNSIK', 'FASTFOOD', 'MEAT', 'SEAFOOD', 'BUFFET', 'BRUNCH'] },
  { label: '카페/디저트', options: ['CAFE', 'BAKERY', 'DESSERT', 'ICECREAM'] },
  { label: '주점', options: ['BEER', 'IZAKAYA', 'WINE_BAR', 'COCKTAIL_BAR', 'POCHA', 'KOREAN_PUB', 'COOK_PUB'] },
  { label: '기타', options: ['FOODCOURT', 'OTHER'] },
];

interface Store {
  id: string;
  name: string;
  category: string | null;
  slug: string | null;
  ownerName: string | null;
  phone: string | null;
  businessRegNumber: string | null;
  address: string | null;
  createdAt: string;
  ownerEmail: string | null;
  ownerId: string | null;
  customerCount: number;
  walletBalance?: number;
  // Point settings
  pointRatePercent?: number;
  pointUsageRule?: string | null;
  pointsAlimtalkEnabled?: boolean;
}

interface TopupModalData {
  storeId: string;
  storeName: string;
  currentBalance: number;
}

interface DeductModalData {
  storeId: string;
  storeName: string;
  currentBalance: number;
}

interface DeleteCustomersModalData {
  storeId: string;
  storeName: string;
  customerCount: number;
}

export default function AdminStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resettingStoreId, setResettingStoreId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [topupModal, setTopupModal] = useState<TopupModalData | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupReason, setTopupReason] = useState('');
  const [topupPassword, setTopupPassword] = useState('');
  const [isTopupLoading, setIsTopupLoading] = useState(false);
  const [deductModal, setDeductModal] = useState<DeductModalData | null>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductPassword, setDeductPassword] = useState('');
  const [isDeductLoading, setIsDeductLoading] = useState(false);
  const [deleteCustomersModal, setDeleteCustomersModal] = useState<DeleteCustomersModalData | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Store detail modal
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Store>>({});
  const [pointRateInput, setPointRateInput] = useState(''); // 소수점 입력을 위한 문자열 상태
  const [isSaving, setIsSaving] = useState(false);

  // 발송잔액 부족 알림 모달
  const [lowBalanceModal, setLowBalanceModal] = useState(false);
  const [excludedStoreIds, setExcludedStoreIds] = useState<Set<string>>(new Set());
  const [isSendingLowBalance, setIsSendingLowBalance] = useState(false);
  const [lowBalancePassword, setLowBalancePassword] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedStore) {
          setSelectedStore(null);
          setIsEditMode(false);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedStore]);

  const fetchData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const storesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storesRes.ok) {
        const storesData = await storesRes.json();
        // walletBalance가 이미 API 응답에 포함됨 (N+1 문제 해결)
        setStores(storesData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (storeId: string, storeName: string) => {
    if (!confirm(`${storeName} 매장의 비밀번호를 초기화하시겠습니까?\n\n새 비밀번호: 123456789a`)) {
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setResettingStoreId(storeId);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${storeId}/reset-password`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: `${storeName} 비밀번호가 초기화되었습니다.`, type: 'success' });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '비밀번호 초기화에 실패했습니다.', type: 'error' });
    } finally {
      setResettingStoreId(null);
    }
  };

  const copyToClipboard = (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    setToast({ message: '클립보드에 복사되었습니다.', type: 'success' });
  };

  const openTopupModal = (store: Store, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTopupModal({
      storeId: store.id,
      storeName: store.name,
      currentBalance: store.walletBalance || 0,
    });
    setTopupAmount('');
    setTopupReason('');
    setTopupPassword('');
  };

  const openDeductModal = (store: Store, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeductModal({
      storeId: store.id,
      storeName: store.name,
      currentBalance: store.walletBalance || 0,
    });
    setDeductAmount('');
    setDeductReason('');
    setDeductPassword('');
  };

  const openDeleteCustomersModal = (store: Store, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteCustomersModal({
      storeId: store.id,
      storeName: store.name,
      customerCount: store.customerCount,
    });
    setDeleteConfirmText('');
  };

  const openStoreDetail = (store: Store) => {
    setSelectedStore(store);
    setEditForm({
      name: store.name,
      category: store.category,
      slug: store.slug,
      ownerName: store.ownerName,
      phone: store.phone,
      businessRegNumber: store.businessRegNumber,
      address: store.address,
      pointRatePercent: store.pointRatePercent ?? 5,
      pointUsageRule: store.pointUsageRule,
      pointsAlimtalkEnabled: store.pointsAlimtalkEnabled ?? true,
    });
    setPointRateInput(String(store.pointRatePercent ?? 5));
    setIsEditMode(false);
  };

  const handleSaveStore = async () => {
    if (!selectedStore) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSaving(true);

    // pointRateInput을 숫자로 변환해서 editForm에 반영
    const formData = {
      ...editForm,
      pointRatePercent: parseFloat(pointRateInput) || 5,
    };

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${selectedStore.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: '매장 정보가 수정되었습니다.', type: 'success' });
        // Update local store data
        setStores((prevStores) =>
          prevStores.map((store) =>
            store.id === selectedStore.id
              ? { ...store, ...formData }
              : store
          )
        );
        setSelectedStore({ ...selectedStore, ...formData });
        setIsEditMode(false);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '저장에 실패했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomers = async () => {
    if (!deleteCustomersModal) return;

    if (deleteConfirmText !== '삭제') {
      setToast({ message: '"삭제"를 입력해주세요.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsDeleteLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${deleteCustomersModal.storeId}/customers`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: data.message, type: 'success' });
        setDeleteCustomersModal(null);
        // Update local store data with 0 customers
        setStores((prevStores) =>
          prevStores.map((store) =>
            store.id === deleteCustomersModal.storeId
              ? { ...store, customerCount: 0 }
              : store
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '고객 삭제에 실패했습니다.', type: 'error' });
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const ADMIN_ACTION_PASSWORD = '0614';

  const handleTopup = async () => {
    if (!topupModal) return;

    if (topupPassword !== ADMIN_ACTION_PASSWORD) {
      setToast({ message: '비밀번호가 올바르지 않습니다.', type: 'error' });
      return;
    }

    const amount = parseInt(topupAmount);
    if (!amount || amount <= 0) {
      setToast({ message: '유효한 충전 금액을 입력해주세요.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsTopupLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${topupModal.storeId}/wallet/topup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount, reason: topupReason }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: data.message, type: 'success' });
        setTopupModal(null);
        // Update local store data with new balance
        setStores((prevStores) =>
          prevStores.map((store) =>
            store.id === topupModal.storeId
              ? { ...store, walletBalance: data.newBalance }
              : store
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '충전에 실패했습니다.', type: 'error' });
    } finally {
      setIsTopupLoading(false);
    }
  };

  const handleDeduct = async () => {
    if (!deductModal) return;

    if (deductPassword !== ADMIN_ACTION_PASSWORD) {
      setToast({ message: '비밀번호가 올바르지 않습니다.', type: 'error' });
      return;
    }

    const amount = parseInt(deductAmount);
    if (!amount || amount <= 0) {
      setToast({ message: '유효한 차감 금액을 입력해주세요.', type: 'error' });
      return;
    }

    if (amount > deductModal.currentBalance) {
      setToast({ message: '잔액보다 큰 금액을 차감할 수 없습니다.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsDeductLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${deductModal.storeId}/wallet/deduct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount, reason: deductReason }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: data.message, type: 'success' });
        setDeductModal(null);
        // Update local store data with new balance
        setStores((prevStores) =>
          prevStores.map((store) =>
            store.id === deductModal.storeId
              ? { ...store, walletBalance: data.newBalance }
              : store
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '차감에 실패했습니다.', type: 'error' });
    } finally {
      setIsDeductLoading(false);
    }
  };

  const filteredStores = stores.filter((store) => {
    const query = searchQuery.toLowerCase();
    return (
      store.name.toLowerCase().includes(query) ||
      store.id.toLowerCase().includes(query) ||
      store.ownerEmail?.toLowerCase().includes(query) ||
      store.businessRegNumber?.includes(query)
    );
  });

  // 발송잔액 부족 대상 매장 (300원 미만, 전화번호 있음)
  const lowBalanceStores = stores.filter(
    (s) => (s.walletBalance ?? 0) < 300 && s.phone
  );

  // 발송 대상 매장 (제외된 매장 빼고)
  const targetLowBalanceStores = lowBalanceStores.filter(
    (s) => !excludedStoreIds.has(s.id)
  );

  // 발송잔액 부족 알림 발송 핸들러
  const handleSendLowBalanceNotification = async () => {
    if (lowBalancePassword !== '0614') {
      setToast({ message: '비밀번호가 올바르지 않습니다.', type: 'error' });
      return;
    }

    if (targetLowBalanceStores.length === 0) {
      setToast({ message: '발송 대상 매장이 없습니다.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSendingLowBalance(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/alimtalk/low-balance-bulk`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            excludeStoreIds: Array.from(excludedStoreIds),
          }),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({
          message: `${data.sent}개 매장에 알림톡 발송 완료${data.failed > 0 ? ` (실패: ${data.failed}개)` : ''}`,
          type: 'success',
        });
        setLowBalanceModal(false);
        setLowBalancePassword('');
        setExcludedStoreIds(new Set());
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '발송에 실패했습니다.', type: 'error' });
    } finally {
      setIsSendingLowBalance(false);
    }
  };

  // 모달 열 때 제외 목록 초기화
  const openLowBalanceModal = () => {
    setExcludedStoreIds(new Set());
    setLowBalancePassword('');
    setLowBalanceModal(true);
  };

  // 홈 화면 열기 (매장 대리 로그인)
  const handleOpenStoreHome = async (storeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      setToast({ message: '관리자 인증이 필요합니다.', type: 'error' });
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${storeId}/impersonate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '홈 화면 열기 실패');
      }

      const data = await res.json();

      // Store 토큰 저장 후 새 탭에서 /home 열기
      localStorage.setItem('token', data.token);
      window.open('/home', '_blank');
    } catch (error: any) {
      setToast({ message: error.message || '홈 화면 열기 실패', type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg text-sm font-medium z-50 shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-neutral-900">매장 목록</h2>
            <p className="text-[13px] text-neutral-500 mt-0.5">총 {stores.length}개 매장</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 발송잔액 부족 알림 버튼 */}
            <button
              onClick={openLowBalanceModal}
              className="h-10 px-4 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              발송잔액 부족 알림
              {lowBalanceStores.length > 0 && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px]">
                  {lowBalanceStores.length}
                </span>
              )}
            </button>
            <div className="relative">
              <input
                type="text"
                placeholder="매장명, ID, 이메일 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-72 h-10 pl-10 pr-4 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Store Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
        {filteredStores.map((store) => (
          <div
            key={store.id}
            onClick={() => openStoreDetail(store)}
            className="bg-white border border-[#EAEAEA] rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-[#FFD541] transition-all group"
          >
            {/* Store Name & Owner */}
            <div className="mb-4">
              <h3 className="text-[16px] font-semibold text-neutral-900 group-hover:text-[#D4A800] transition-colors truncate">
                {store.name}
              </h3>
              <p className="text-[13px] text-neutral-500 truncate">{store.ownerName || '-'}</p>
            </div>

            {/* Stats */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-500">고객 수</span>
                <span className="text-[14px] font-medium text-neutral-900">
                  {formatNumber(store.customerCount)}명
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-500">충전금</span>
                <span className="text-[14px] font-medium text-neutral-900">
                  {formatNumber(store.walletBalance || 0)}원
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-500">가입일</span>
                <span className="text-[12px] text-neutral-600">
                  {new Date(store.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pt-3 border-t border-[#EAEAEA]">
              <button
                onClick={(e) => handleOpenStoreHome(store.id, e)}
                className="flex-1 px-2 py-1.5 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
              >
                홈 화면
              </button>
              <button
                onClick={(e) => openTopupModal(store, e)}
                className="flex-1 px-2 py-1.5 text-[11px] font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors"
              >
                + 충전
              </button>
              {(store.walletBalance || 0) > 0 && (
                <button
                  onClick={(e) => openDeductModal(store, e)}
                  className="flex-1 px-2 py-1.5 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors"
                >
                  - 차감
                </button>
              )}
            </div>
          </div>
        ))}
        {filteredStores.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-500">
            {searchQuery ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'}
          </div>
        )}
      </div>

      {/* Store Detail Modal */}
      {selectedStore && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setSelectedStore(null);
            setIsEditMode(false);
          }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">
                  {isEditMode ? '매장 정보 수정' : '매장 상세 정보'}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {!isEditMode ? (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="text-[14px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    수정
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditMode(false)}
                      className="text-[14px] font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSaveStore}
                      disabled={isSaving}
                      className="text-[14px] font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isSaving && (
                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      )}
                      저장
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedStore(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* 기본 정보 카드 */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-[15px] font-semibold text-neutral-900 mb-2">기본 정보</h4>

                {/* 2-column: 매장명 & 업종 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">매장명</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">{selectedStore.name}</p>
                    )}
                  </div>
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">업종</label>
                    {isEditMode ? (
                      <select
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value || null })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      >
                        <option value="">업종 선택</option>
                        {CATEGORY_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((key) => (
                              <option key={key} value={key}>
                                {STORE_CATEGORIES[key as keyof typeof STORE_CATEGORIES]}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">
                        {selectedStore.category ? STORE_CATEGORIES[selectedStore.category as keyof typeof STORE_CATEGORIES] || selectedStore.category : '-'}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2-column: 연락처 & 사업자등록번호 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">연락처</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        placeholder="연락처 입력"
                      />
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">{selectedStore.phone || '-'}</p>
                    )}
                  </div>
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">사업자등록번호</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.businessRegNumber || ''}
                        onChange={(e) => setEditForm({ ...editForm, businessRegNumber: e.target.value })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        placeholder="000-00-00000"
                      />
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">{selectedStore.businessRegNumber || '-'}</p>
                    )}
                  </div>
                </div>

                {/* 2-column: 대표자명 & 점주 이메일 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">대표자명</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.ownerName || ''}
                        onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        placeholder="대표자명 입력"
                      />
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">{selectedStore.ownerName || '-'}</p>
                    )}
                  </div>
                  <div className="rounded-xl p-4 bg-neutral-50">
                    <label className="block text-[12px] text-neutral-500 mb-1">점주 이메일</label>
                    <p className="text-[16px] font-medium text-neutral-900">{selectedStore.ownerEmail || '-'}</p>
                  </div>
                </div>

                {/* 2-column: Slug & 가입일 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">Slug (URL)</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.slug || ''}
                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                        className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        placeholder="slug 입력"
                      />
                    ) : (
                      <p className="text-[16px] font-medium text-neutral-900">{selectedStore.slug || '-'}</p>
                    )}
                  </div>
                  <div className="rounded-xl p-4 bg-neutral-50">
                    <label className="block text-[12px] text-neutral-500 mb-1">가입일</label>
                    <p className="text-[16px] font-medium text-neutral-900">
                      {new Date(selectedStore.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>

                {/* 주소 */}
                <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                  <label className="block text-[12px] text-neutral-500 mb-1">주소</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editForm.address || ''}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full text-[16px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      placeholder="주소 입력"
                    />
                  ) : (
                    <p className="text-[16px] font-medium text-neutral-900">{selectedStore.address || '-'}</p>
                  )}
                </div>
              </div>

              {/* 시스템 정보 카드 */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-[15px] font-semibold text-neutral-900 mb-2">시스템 정보</h4>

                {/* 2-column: Store ID & 고객 수 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-4 bg-neutral-50">
                    <label className="block text-[12px] text-neutral-500 mb-1">Store ID</label>
                    <div className="flex items-center gap-2">
                      <code className="text-[14px] text-neutral-700 font-mono truncate">
                        {selectedStore.id}
                      </code>
                      <button
                        onClick={(e) => copyToClipboard(selectedStore.id, e)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl p-4 bg-neutral-50">
                    <label className="block text-[12px] text-neutral-500 mb-1">고객 수</label>
                    <p className="text-[16px] font-semibold text-neutral-900">{formatNumber(selectedStore.customerCount)}명</p>
                  </div>
                </div>

                {/* 충전금 */}
                <div className="rounded-xl p-4 bg-neutral-50">
                  <label className="block text-[12px] text-neutral-500 mb-1">충전금</label>
                  <div className="flex items-center gap-3">
                    <p className="text-[20px] font-bold text-blue-600">
                      {formatNumber(selectedStore.walletBalance || 0)}원
                    </p>
                    <button
                      onClick={(e) => openTopupModal(selectedStore, e)}
                      className="px-3 py-1.5 text-[12px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                    >
                      충전
                    </button>
                    {(selectedStore.walletBalance || 0) > 0 && (
                      <button
                        onClick={(e) => openDeductModal(selectedStore, e)}
                        className="px-3 py-1.5 text-[12px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                      >
                        차감
                      </button>
                    )}
                  </div>
                </div>

                {/* 고객등록 링크 */}
                <div className="rounded-xl p-4 bg-neutral-50">
                  <label className="block text-[12px] text-neutral-500 mb-1">고객등록 링크</label>
                  {selectedStore.slug ? (
                    <div className="flex items-center gap-2">
                      <code className="text-[13px] text-blue-600 font-mono truncate flex-1">
                        /taghere-enroll/{selectedStore.slug}?ordersheetId=&#123;ordersheetId&#125;
                      </code>
                      <button
                        onClick={(e) => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/taghere-enroll/${selectedStore.slug}?ordersheetId={ordersheetId}`, e)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[14px] text-neutral-400">slug 없음</span>
                  )}
                </div>
              </div>

              {/* 포인트 설정 카드 */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-[15px] font-semibold text-neutral-900 mb-2">포인트 설정</h4>

                {/* 2-column: 적립률 & 알림톡 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-1">적립률 (0.1~99.9%)</label>
                    {isEditMode ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={pointRateInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            // 0~99.9 범위의 숫자 허용 (소수점 한 자리까지)
                            if (val === '' || /^\d{0,2}(\.\d?)?$/.test(val)) {
                              setPointRateInput(val);
                            }
                          }}
                          className="w-20 text-[20px] font-bold text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        />
                        <span className="text-[20px] font-bold text-neutral-900">%</span>
                      </div>
                    ) : (
                      <p className="text-[20px] font-bold text-neutral-900">{selectedStore.pointRatePercent ?? 5}%</p>
                    )}
                  </div>
                  <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                    <label className="block text-[12px] text-neutral-500 mb-2">포인트 알림톡</label>
                    {isEditMode ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, pointsAlimtalkEnabled: true })}
                          className={`flex-1 py-2 px-3 text-[14px] font-medium rounded-lg border transition-all ${
                            editForm.pointsAlimtalkEnabled !== false
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          활성화
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, pointsAlimtalkEnabled: false })}
                          className={`flex-1 py-2 px-3 text-[14px] font-medium rounded-lg border transition-all ${
                            editForm.pointsAlimtalkEnabled === false
                              ? 'bg-neutral-700 text-white border-neutral-700'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          비활성화
                        </button>
                      </div>
                    ) : (
                      <span className={`inline-block px-3 py-1.5 text-[13px] font-medium rounded-lg ${
                        selectedStore.pointsAlimtalkEnabled !== false
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}>
                        {selectedStore.pointsAlimtalkEnabled !== false ? '활성화' : '비활성화'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 포인트 사용 규칙 */}
                <div className={`rounded-xl p-4 ${isEditMode ? 'bg-white border border-neutral-200' : 'bg-neutral-50'}`}>
                  <label className="block text-[12px] text-neutral-500 mb-1">포인트 사용 규칙 안내</label>
                  {isEditMode ? (
                    <textarea
                      value={editForm.pointUsageRule || ''}
                      onChange={(e) => setEditForm({ ...editForm, pointUsageRule: e.target.value })}
                      placeholder="예: 1,000P 이상 적립 시 사용 가능"
                      rows={2}
                      className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0 resize-none placeholder-neutral-400"
                    />
                  ) : (
                    <p className="text-[15px] text-neutral-900">{selectedStore.pointUsageRule || '-'}</p>
                  )}
                </div>
              </div>

              {/* 액션 버튼들 */}
              <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
                <button
                  onClick={(e) => handleOpenStoreHome(selectedStore.id, e)}
                  className="px-4 py-2 text-[13px] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  홈 화면 열기
                </button>
                <button
                  onClick={() => handleResetPassword(selectedStore.id, selectedStore.name)}
                  disabled={resettingStoreId === selectedStore.id}
                  className="text-[13px] font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {resettingStoreId === selectedStore.id ? '초기화 중...' : '비밀번호 초기화'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topup Modal */}
      {topupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6 shadow-xl">
            <h3 className="text-[18px] font-semibold text-neutral-900 mb-4">
              충전금 충전
            </h3>
            <p className="text-[14px] text-neutral-600 mb-4">
              <span className="text-neutral-900 font-medium">{topupModal.storeName}</span> 매장에 충전금을 충전합니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  현재 잔액
                </label>
                <p className="text-[18px] font-semibold text-neutral-900">
                  {formatNumber(topupModal.currentBalance)}원
                </p>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  충전 금액 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="충전할 금액을 입력하세요"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  충전 사유 (선택)
                </label>
                <input
                  type="text"
                  value={topupReason}
                  onChange={(e) => setTopupReason(e.target.value)}
                  placeholder="예: 프로모션 지급, 보상 처리 등"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={topupPassword}
                  onChange={(e) => setTopupPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setTopupModal(null)}
                className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[14px] font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleTopup}
                disabled={isTopupLoading || !topupAmount || !topupPassword}
                className="flex-1 h-10 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTopupLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                    충전 중...
                  </>
                ) : (
                  '충전하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduct Modal */}
      {deductModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6 shadow-xl">
            <h3 className="text-[18px] font-semibold text-neutral-900 mb-4">
              충전금 삭제 (차감)
            </h3>
            <p className="text-[14px] text-neutral-600 mb-4">
              <span className="text-neutral-900 font-medium">{deductModal.storeName}</span> 매장의 충전금을 차감합니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  현재 잔액
                </label>
                <p className="text-[18px] font-semibold text-neutral-900">
                  {formatNumber(deductModal.currentBalance)}원
                </p>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  차감 금액 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                  placeholder="차감할 금액을 입력하세요"
                  max={deductModal.currentBalance}
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  차감 사유 (선택)
                </label>
                <input
                  type="text"
                  value={deductReason}
                  onChange={(e) => setDeductReason(e.target.value)}
                  placeholder="예: 오충전 정정, 환불 처리 등"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={deductPassword}
                  onChange={(e) => setDeductPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeductModal(null)}
                className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[14px] font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeduct}
                disabled={isDeductLoading || !deductAmount || !deductPassword}
                className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeductLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    차감 중...
                  </>
                ) : (
                  '차감하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Customers Modal */}
      {deleteCustomersModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6 shadow-xl">
            <h3 className="text-[18px] font-semibold text-neutral-900 mb-4">
              고객 전체 삭제
            </h3>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-[14px] text-red-700 font-medium">
                이 작업은 되돌릴 수 없습니다!
              </p>
            </div>
            <p className="text-[14px] text-neutral-600 mb-2">
              <span className="text-neutral-900 font-medium">{deleteCustomersModal.storeName}</span> 매장의 모든 고객을 삭제합니다.
            </p>
            <p className="text-[14px] text-neutral-600 mb-4">
              삭제될 고객 수: <span className="text-red-600 font-semibold">{formatNumber(deleteCustomersModal.customerCount)}명</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-neutral-700 mb-1.5">
                  확인을 위해 &quot;삭제&quot;를 입력하세요
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="삭제"
                  className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteCustomersModal(null)}
                className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[14px] font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteCustomers}
                disabled={isDeleteLoading || deleteConfirmText !== '삭제'}
                className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleteLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    삭제 중...
                  </>
                ) : (
                  '고객 전체 삭제'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 발송잔액 부족 알림 모달 */}
      {lowBalanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <h3 className="text-[16px] font-semibold text-neutral-900 mb-4">
              발송잔액 부족 알림 발송
            </h3>

            {/* 통계 */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[12px] text-orange-600">잔액 300원 미만</p>
                  <p className="text-[18px] font-bold text-orange-700">{lowBalanceStores.length}개</p>
                </div>
                <div>
                  <p className="text-[12px] text-orange-600">발송 제외</p>
                  <p className="text-[18px] font-bold text-orange-700">{excludedStoreIds.size}개</p>
                </div>
                <div>
                  <p className="text-[12px] text-orange-600">발송 대상</p>
                  <p className="text-[18px] font-bold text-orange-700">{targetLowBalanceStores.length}개</p>
                </div>
              </div>
            </div>

            {/* 안내 문구 */}
            <p className="text-[13px] text-neutral-500 mb-3">
              체크 해제한 매장은 발송에서 제외됩니다.
            </p>

            {/* 전체 선택/해제 */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setExcludedStoreIds(new Set())}
                className="text-[12px] text-blue-600 hover:underline"
              >
                전체 선택
              </button>
              <span className="text-neutral-300">|</span>
              <button
                onClick={() => setExcludedStoreIds(new Set(lowBalanceStores.map(s => s.id)))}
                className="text-[12px] text-blue-600 hover:underline"
              >
                전체 해제
              </button>
            </div>

            {/* 매장 목록 */}
            <div className="flex-1 overflow-y-auto border border-[#EAEAEA] rounded-lg mb-4">
              {lowBalanceStores.length === 0 ? (
                <div className="p-4 text-center text-neutral-500 text-[13px]">
                  잔액 300원 미만인 매장이 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-[#EAEAEA]">
                  {lowBalanceStores.map((store) => (
                    <label
                      key={store.id}
                      className="flex items-center gap-3 p-3 hover:bg-neutral-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!excludedStoreIds.has(store.id)}
                        onChange={(e) => {
                          const newSet = new Set(excludedStoreIds);
                          if (e.target.checked) {
                            newSet.delete(store.id);
                          } else {
                            newSet.add(store.id);
                          }
                          setExcludedStoreIds(newSet);
                        }}
                        className="w-4 h-4 rounded border-neutral-300 text-orange-500 focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-neutral-900 truncate">
                          {store.name}
                        </p>
                        <p className="text-[12px] text-neutral-500">
                          잔액: {formatNumber(store.walletBalance ?? 0)}원 · {store.phone}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 비밀번호 입력 */}
            <div className="mb-4">
              <label className="block text-[13px] font-medium text-neutral-700 mb-1">
                관리자 비밀번호
              </label>
              <input
                type="password"
                value={lowBalancePassword}
                onChange={(e) => setLowBalancePassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setLowBalanceModal(false);
                  setLowBalancePassword('');
                  setExcludedStoreIds(new Set());
                }}
                className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[14px] font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSendLowBalanceNotification}
                disabled={isSendingLowBalance || targetLowBalanceStores.length === 0}
                className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSendingLowBalance ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    발송 중...
                  </>
                ) : (
                  `발송 (${targetLowBalanceStores.length}개)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
