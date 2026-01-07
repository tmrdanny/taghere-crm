'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/utils';

interface Store {
  id: string;
  name: string;
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
  randomPointEnabled?: boolean;
  randomPointMin?: number;
  randomPointMax?: number;
  fixedPointEnabled?: boolean;
  fixedPointAmount?: number;
  pointRateEnabled?: boolean;
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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const storesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storesRes.ok) {
        const storesData = await storesRes.json();
        // Fetch wallet balance for each store
        const storesWithWallet = await Promise.all(
          storesData.map(async (store: Store) => {
            try {
              const walletRes = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${store.id}/wallet`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (walletRes.ok) {
                const walletData = await walletRes.json();
                return { ...store, walletBalance: walletData.balance };
              }
            } catch (e) {
              console.error('Failed to fetch wallet for store:', store.id);
            }
            return { ...store, walletBalance: 0 };
          })
        );
        setStores(storesWithWallet);
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
      slug: store.slug,
      ownerName: store.ownerName,
      phone: store.phone,
      businessRegNumber: store.businessRegNumber,
      address: store.address,
      randomPointEnabled: store.randomPointEnabled ?? true,
      randomPointMin: store.randomPointMin ?? 1,
      randomPointMax: store.randomPointMax ?? 1500,
      fixedPointEnabled: store.fixedPointEnabled ?? false,
      fixedPointAmount: store.fixedPointAmount ?? 100,
      pointRateEnabled: store.pointRateEnabled ?? false,
      pointRatePercent: store.pointRatePercent ?? 5,
      pointUsageRule: store.pointUsageRule,
      pointsAlimtalkEnabled: store.pointsAlimtalkEnabled ?? true,
    });
    setIsEditMode(false);
  };

  const handleSaveStore = async () => {
    if (!selectedStore) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSaving(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/${selectedStore.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(editForm),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setToast({ message: '매장 정보가 수정되었습니다.', type: 'success' });
        // Update local store data
        setStores((prevStores) =>
          prevStores.map((store) =>
            store.id === selectedStore.id
              ? { ...store, ...editForm }
              : store
          )
        );
        setSelectedStore({ ...selectedStore, ...editForm });
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 flex items-center justify-between z-10">
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
            <div className="p-6 space-y-5">
              {/* Store Header Info */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-[20px] font-bold text-neutral-900">{selectedStore.name}</h4>
                  <p className="text-[14px] text-neutral-500 mt-1">{selectedStore.ownerName || '-'}</p>
                  <p className="text-[13px] text-neutral-400">{selectedStore.ownerEmail || '-'}</p>
                  <p className="text-[13px] text-neutral-400">{selectedStore.address || '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResetPassword(selectedStore.id, selectedStore.name)}
                    disabled={resettingStoreId === selectedStore.id}
                    className="text-[13px] font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {resettingStoreId === selectedStore.id ? '초기화 중...' : '비밀번호 초기화'}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#EAEAEA]" />

              {/* Basic Info Fields - Card Style */}
              <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                {/* 매장명 */}
                <div className="px-4 py-3 border-b border-[#EAEAEA]">
                  <label className="block text-[12px] text-neutral-500 mb-1">매장명</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                    />
                  ) : (
                    <p className="text-[15px] text-neutral-900">{selectedStore.name}</p>
                  )}
                </div>

                {/* 2-column grid */}
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 border-b border-r border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">연락처</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[15px] text-neutral-900">{selectedStore.phone || '-'}</p>
                    )}
                  </div>
                  <div className="px-4 py-3 border-b border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">사업자등록번호</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.businessRegNumber || ''}
                        onChange={(e) => setEditForm({ ...editForm, businessRegNumber: e.target.value })}
                        className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[15px] text-neutral-900">{selectedStore.businessRegNumber || '-'}</p>
                    )}
                  </div>
                </div>

                {/* 대표자명 & 점주 이메일 */}
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 border-b border-r border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">대표자명</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.ownerName || ''}
                        onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                        className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[15px] text-neutral-900">{selectedStore.ownerName || '-'}</p>
                    )}
                  </div>
                  <div className="px-4 py-3 border-b border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">점주 이메일</label>
                    <p className="text-[15px] text-neutral-900">{selectedStore.ownerEmail || '-'}</p>
                  </div>
                </div>

                {/* Slug & 가입일 */}
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 border-r border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">Slug (URL)</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editForm.slug || ''}
                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                        className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[15px] text-neutral-900">{selectedStore.slug || '-'}</p>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <label className="block text-[12px] text-neutral-500 mb-1">가입일</label>
                    <p className="text-[15px] text-neutral-900">
                      {new Date(selectedStore.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* 주소 */}
              <div className="border border-[#EAEAEA] rounded-xl px-4 py-3">
                <label className="block text-[12px] text-neutral-500 mb-1">주소</label>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editForm.address || ''}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full text-[15px] text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                    placeholder="주소를 입력하세요"
                  />
                ) : (
                  <p className="text-[15px] text-neutral-900">{selectedStore.address || '-'}</p>
                )}
              </div>

              {/* System Info Card */}
              <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 border-b border-r border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">Store ID</label>
                    <div className="flex items-center gap-2">
                      <code className="text-[13px] text-neutral-700 font-mono truncate">
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
                  <div className="px-4 py-3 border-b border-[#EAEAEA]">
                    <label className="block text-[12px] text-neutral-500 mb-1">고객 수</label>
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-medium text-neutral-900">{formatNumber(selectedStore.customerCount)}명</p>
                      {selectedStore.customerCount > 0 && (
                        <button
                          onClick={(e) => openDeleteCustomersModal(selectedStore, e)}
                          className="text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                        >
                          전체 삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-[#EAEAEA]">
                  <label className="block text-[12px] text-neutral-500 mb-1">충전금</label>
                  <div className="flex items-center gap-3">
                    <p className="text-[18px] font-semibold text-neutral-900">
                      {formatNumber(selectedStore.walletBalance || 0)}원
                    </p>
                    <button
                      onClick={(e) => openTopupModal(selectedStore, e)}
                      className="text-[12px] font-medium text-green-600 hover:text-green-700 transition-colors"
                    >
                      충전
                    </button>
                    {(selectedStore.walletBalance || 0) > 0 && (
                      <button
                        onClick={(e) => openDeductModal(selectedStore, e)}
                        className="text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                      >
                        차감
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3">
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
                    <span className="text-[13px] text-neutral-400">slug 없음</span>
                  )}
                </div>
              </div>

              {/* Divider with Title */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#EAEAEA]"></div>
                </div>
                <div className="relative flex justify-start">
                  <span className="bg-white pr-3 text-[14px] font-semibold text-neutral-900">포인트 설정</span>
                </div>
              </div>

              {/* Point Settings - Card Style */}
              <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                {/* Random Point */}
                <div className="px-4 py-4 border-b border-[#EAEAEA]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[14px] font-medium text-neutral-900">랜덤 포인트</span>
                    {isEditMode ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.randomPointEnabled ?? true}
                          onChange={(e) => setEditForm({ ...editForm, randomPointEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm"></div>
                      </label>
                    ) : (
                      <span className={`px-2.5 py-1 text-[12px] font-medium rounded-full ${selectedStore.randomPointEnabled !== false ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-neutral-100 text-neutral-500'}`}>
                        {selectedStore.randomPointEnabled !== false ? '활성화' : '비활성화'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50 rounded-lg px-3 py-2">
                      <label className="block text-[11px] text-neutral-500 mb-0.5">최소</label>
                      {isEditMode ? (
                        <input
                          type="number"
                          value={editForm.randomPointMin ?? 1}
                          onChange={(e) => setEditForm({ ...editForm, randomPointMin: parseInt(e.target.value) || 0 })}
                          className="w-full text-[15px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        />
                      ) : (
                        <p className="text-[15px] font-medium text-neutral-900">{selectedStore.randomPointMin ?? 1}P</p>
                      )}
                    </div>
                    <div className="bg-neutral-50 rounded-lg px-3 py-2">
                      <label className="block text-[11px] text-neutral-500 mb-0.5">최대</label>
                      {isEditMode ? (
                        <input
                          type="number"
                          value={editForm.randomPointMax ?? 1500}
                          onChange={(e) => setEditForm({ ...editForm, randomPointMax: parseInt(e.target.value) || 0 })}
                          className="w-full text-[15px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        />
                      ) : (
                        <p className="text-[15px] font-medium text-neutral-900">{selectedStore.randomPointMax ?? 1500}P</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fixed Point */}
                <div className="px-4 py-4 border-b border-[#EAEAEA]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[14px] font-medium text-neutral-900">고정 포인트</span>
                    {isEditMode ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.fixedPointEnabled ?? false}
                          onChange={(e) => setEditForm({ ...editForm, fixedPointEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm"></div>
                      </label>
                    ) : (
                      <span className={`px-2.5 py-1 text-[12px] font-medium rounded-full ${selectedStore.fixedPointEnabled ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-neutral-100 text-neutral-500'}`}>
                        {selectedStore.fixedPointEnabled ? '활성화' : '비활성화'}
                      </span>
                    )}
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 inline-block">
                    <label className="block text-[11px] text-neutral-500 mb-0.5">금액</label>
                    {isEditMode ? (
                      <input
                        type="number"
                        value={editForm.fixedPointAmount ?? 100}
                        onChange={(e) => setEditForm({ ...editForm, fixedPointAmount: parseInt(e.target.value) || 0 })}
                        className="w-24 text-[15px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                      />
                    ) : (
                      <p className="text-[15px] font-medium text-neutral-900">{selectedStore.fixedPointAmount ?? 100}P</p>
                    )}
                  </div>
                </div>

                {/* Point Rate */}
                <div className="px-4 py-4 border-b border-[#EAEAEA]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[14px] font-medium text-neutral-900">결제금액 기반 적립</span>
                    {isEditMode ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.pointRateEnabled ?? false}
                          onChange={(e) => setEditForm({ ...editForm, pointRateEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm"></div>
                      </label>
                    ) : (
                      <span className={`px-2.5 py-1 text-[12px] font-medium rounded-full ${selectedStore.pointRateEnabled ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-neutral-100 text-neutral-500'}`}>
                        {selectedStore.pointRateEnabled ? '활성화' : '비활성화'}
                      </span>
                    )}
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 inline-block">
                    <label className="block text-[11px] text-neutral-500 mb-0.5">적립률</label>
                    {isEditMode ? (
                      <div className="flex items-center">
                        <input
                          type="number"
                          value={editForm.pointRatePercent ?? 5}
                          onChange={(e) => setEditForm({ ...editForm, pointRatePercent: parseInt(e.target.value) || 0 })}
                          className="w-16 text-[15px] font-medium text-neutral-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                        />
                        <span className="text-[15px] font-medium text-neutral-900">%</span>
                      </div>
                    ) : (
                      <p className="text-[15px] font-medium text-neutral-900">{selectedStore.pointRatePercent ?? 5}%</p>
                    )}
                  </div>
                </div>

                {/* Points Alimtalk */}
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium text-neutral-900">포인트 알림톡 자동 발송</span>
                    {isEditMode ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.pointsAlimtalkEnabled ?? true}
                          onChange={(e) => setEditForm({ ...editForm, pointsAlimtalkEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm"></div>
                      </label>
                    ) : (
                      <span className={`px-2.5 py-1 text-[12px] font-medium rounded-full ${selectedStore.pointsAlimtalkEnabled !== false ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-neutral-100 text-neutral-500'}`}>
                        {selectedStore.pointsAlimtalkEnabled !== false ? '활성화' : '비활성화'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Point Usage Rule */}
              <div className="border border-[#EAEAEA] rounded-xl px-4 py-3">
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
    </div>
  );
}
