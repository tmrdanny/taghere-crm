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

interface Stats {
  storeCount: number;
  customerCount: number;
  userCount: number;
}

export default function AdminDashboardPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resettingStoreId, setResettingStoreId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [topupModal, setTopupModal] = useState<TopupModalData | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupReason, setTopupReason] = useState('');
  const [isTopupLoading, setIsTopupLoading] = useState(false);

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
      const [storesRes, statsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

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

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
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
  };

  const handleTopup = async () => {
    if (!topupModal) return;

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
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg text-sm font-medium z-50 ${
            toast.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-neutral-500 mt-1">TagHere 전체 매장 관리</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-sm text-neutral-500">전체 매장</p>
            <p className="text-3xl font-semibold text-white mt-1">{formatNumber(stats.storeCount)}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-sm text-neutral-500">전체 고객</p>
            <p className="text-3xl font-semibold text-white mt-1">{formatNumber(stats.customerCount)}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-sm text-neutral-500">전체 사용자</p>
            <p className="text-3xl font-semibold text-white mt-1">{formatNumber(stats.userCount)}</p>
          </div>
        </div>
      )}

      {/* Stores Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-white">매장 목록</h2>
          <div className="relative">
            <input
              type="text"
              placeholder="매장명, ID, 이메일 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 h-9 pl-9 pr-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
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
              <tr className="border-b border-neutral-800">
                <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  매장
                </th>
                <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  ID
                </th>
                <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  점주 이메일
                </th>
                <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  고객 수
                </th>
                <th className="text-right text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  충전금
                </th>
                <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  가입일
                </th>
                <th className="text-right text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredStores.map((store) => (
                <tr key={store.id} className="hover:bg-neutral-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{store.name}</p>
                      <p className="text-xs text-neutral-500">{store.ownerName || '-'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyToClipboard(store.id)}
                      className="group flex items-center gap-1.5"
                    >
                      <code className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded font-mono">
                        {store.id.slice(0, 12)}...
                      </code>
                      <svg
                        className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400 transition-colors"
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
                  <td className="px-4 py-3">
                    <span className="text-sm text-neutral-400">{store.ownerEmail || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-neutral-400">{formatNumber(store.customerCount)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-medium text-white">
                        {formatNumber(store.walletBalance || 0)}원
                      </span>
                      <button
                        onClick={() => openTopupModal(store)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        충전
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-neutral-500">
                      {new Date(store.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleResetPassword(store.id, store.name)}
                      disabled={resettingStoreId === store.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
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
                  <td colSpan={7} className="px-4 py-12 text-center text-neutral-500">
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              충전금 충전
            </h3>
            <p className="text-sm text-neutral-400 mb-4">
              <span className="text-white font-medium">{topupModal.storeName}</span> 매장에 충전금을 충전합니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  현재 잔액
                </label>
                <p className="text-lg font-semibold text-white">
                  {formatNumber(topupModal.currentBalance)}원
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  충전 금액 <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="충전할 금액을 입력하세요"
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  충전 사유 (선택)
                </label>
                <input
                  type="text"
                  value={topupReason}
                  onChange={(e) => setTopupReason(e.target.value)}
                  placeholder="예: 프로모션 지급, 보상 처리 등"
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setTopupModal(null)}
                className="flex-1 h-10 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleTopup}
                disabled={isTopupLoading || !topupAmount}
                className="flex-1 h-10 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTopupLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
    </div>
  );
}
