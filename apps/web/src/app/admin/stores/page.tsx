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
  createdAt: string;
  ownerEmail: string | null;
  ownerId: string | null;
  customerCount: number;
  walletBalance?: number;
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast({ message: '클립보드에 복사되었습니다.', type: 'success' });
  };

  const openTopupModal = (store: Store) => {
    setTopupModal({
      storeId: store.id,
      storeName: store.name,
      currentBalance: store.walletBalance || 0,
    });
    setTopupAmount('');
    setTopupReason('');
    setTopupPassword('');
  };

  const openDeductModal = (store: Store) => {
    setDeductModal({
      storeId: store.id,
      storeName: store.name,
      currentBalance: store.walletBalance || 0,
    });
    setDeductAmount('');
    setDeductReason('');
    setDeductPassword('');
  };

  const openDeleteCustomersModal = (store: Store) => {
    setDeleteCustomersModal({
      storeId: store.id,
      storeName: store.name,
      customerCount: store.customerCount,
    });
    setDeleteConfirmText('');
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

      {/* Stores Table */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#EAEAEA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EAEAEA] bg-neutral-50">
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  매장
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  ID
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  점주 이메일
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  고객 수
                </th>
                <th className="text-right text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  충전금
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  가입일
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  고객등록 링크
                </th>
                <th className="text-right text-[12px] font-medium text-neutral-500 uppercase tracking-wider px-5 py-3">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {filteredStores.map((store) => (
                <tr key={store.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-[14px] font-medium text-neutral-900">{store.name}</p>
                      <p className="text-[12px] text-neutral-500">{store.ownerName || '-'}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => copyToClipboard(store.id)}
                      className="group flex items-center gap-1.5"
                    >
                      <code className="text-[12px] text-neutral-600 bg-neutral-100 px-2 py-1 rounded font-mono">
                        {store.id.slice(0, 12)}...
                      </code>
                      <svg
                        className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[14px] text-neutral-600">{store.ownerEmail || '-'}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-neutral-600">{formatNumber(store.customerCount)}</span>
                      {store.customerCount > 0 && (
                        <button
                          onClick={() => openDeleteCustomersModal(store)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="고객 전체 삭제"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[14px] font-medium text-neutral-900">
                        {formatNumber(store.walletBalance || 0)}원
                      </span>
                      <button
                        onClick={() => openTopupModal(store)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        충전
                      </button>
                      {(store.walletBalance || 0) > 0 && (
                        <button
                          onClick={() => openDeductModal(store)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[14px] text-neutral-500">
                      {new Date(store.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {store.slug ? (
                      <button
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/taghere-enroll/${store.slug}?ordersheetId={ordersheetId}`)}
                        className="group flex items-center gap-1.5"
                        title="클릭하여 복사"
                      >
                        <code className="text-[12px] text-blue-600 bg-blue-50 px-2 py-1 rounded font-mono max-w-[200px] truncate">
                          /taghere-enroll/{store.slug}?ordersheetId=...
                        </code>
                        <svg
                          className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 transition-colors flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    ) : (
                      <span className="text-[12px] text-neutral-400">slug 없음</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleResetPassword(store.id, store.name)}
                      disabled={resettingStoreId === store.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {resettingStoreId === store.id ? (
                        <>
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          초기화 중...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          비밀번호 초기화
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-neutral-500">
                    {searchQuery ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
