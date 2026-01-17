'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface FranchiseUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  createdAt: string;
}

interface Franchise {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  _count: {
    stores: number;
    users: number;
  };
  wallet: {
    balance: number;
  } | null;
  users: FranchiseUser[];
}

interface Store {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  _count: {
    customers: number;
  };
}

export default function FranchisesPage() {
  const router = useRouter();
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [availableStores, setAvailableStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFranchise, setSelectedFranchise] = useState<Franchise | null>(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);

  // 프랜차이즈 생성 폼 데이터
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    email: '',
    password: '',
    userName: '',
    phone: '',
    logoUrl: '',
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchFranchises();
    fetchAvailableStores();
  }, []);

  const fetchFranchises = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_URL}/api/admin/franchises`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch franchises');

      const data = await res.json();
      setFranchises(data.franchises);
    } catch (error) {
      console.error('Failed to fetch franchises:', error);
      alert('프랜차이즈 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStores = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_URL}/api/admin/stores/available`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch available stores');

      const data = await res.json();
      setAvailableStores(data.stores);
    } catch (error) {
      console.error('Failed to fetch available stores:', error);
    }
  };

  const handleCreateFranchise = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.slug || !formData.email || !formData.password || !formData.userName) {
      alert('필수 정보를 모두 입력해주세요.');
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_URL}/api/admin/franchises`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '프랜차이즈 생성에 실패했습니다.');
      }

      alert('프랜차이즈가 생성되었습니다.');
      setShowCreateModal(false);
      setFormData({
        name: '',
        slug: '',
        email: '',
        password: '',
        userName: '',
        phone: '',
        logoUrl: '',
      });
      fetchFranchises();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleAddStore = async (storeId: string) => {
    if (!selectedFranchise) return;

    if (!confirm('이 매장을 선택한 프랜차이즈에 연결하시겠습니까?')) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_URL}/api/admin/franchises/${selectedFranchise.id}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storeId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '매장 연결에 실패했습니다.');
      }

      alert('매장이 연결되었습니다.');
      setShowAddStoreModal(false);
      setSelectedFranchise(null);
      fetchFranchises();
      fetchAvailableStores();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ko-KR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">프랜차이즈 관리</h1>
          <p className="text-sm text-neutral-500 mt-1">
            프랜차이즈를 등록하고 산하 매장을 관리할 수 있습니다.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium"
        >
          + 프랜차이즈 추가
        </button>
      </div>

      {/* 프랜차이즈 목록 */}
      <div className="bg-white rounded-lg border border-[#EAEAEA]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EAEAEA]">
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  프랜차이즈명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  매장 수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  사용자 수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  지갑 잔액
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  관리자
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  생성일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {franchises.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-neutral-500">
                    등록된 프랜차이즈가 없습니다.
                  </td>
                </tr>
              ) : (
                franchises.map((franchise) => {
                  const owner = franchise.users.find((u) => u.role === 'OWNER');
                  return (
                    <tr key={franchise.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-neutral-900">{franchise.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{franchise.slug}</td>
                      <td className="px-6 py-4 text-sm text-neutral-900 font-medium">
                        {franchise._count.stores}개
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900">
                        {franchise._count.users}명
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900">
                        {formatCurrency(franchise.wallet?.balance || 0)}원
                      </td>
                      <td className="px-6 py-4">
                        {owner ? (
                          <div className="text-sm">
                            <div className="font-medium text-neutral-900">{owner.name}</div>
                            <div className="text-neutral-500">{owner.email}</div>
                          </div>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {formatDate(franchise.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedFranchise(franchise);
                            setShowAddStoreModal(true);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          매장 추가
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 프랜차이즈 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">프랜차이즈 추가</h2>
            <form onSubmit={handleCreateFranchise} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  프랜차이즈명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="예: 맘스터치"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Slug (영문, 숫자, 하이픈만) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="예: momstouch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.userName}
                  onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 이메일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="admin@momstouch.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="8자 이상"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  전화번호 (선택)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="010-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  로고 URL (선택)
                </label>
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({
                      name: '',
                      slug: '',
                      email: '',
                      password: '',
                      userName: '',
                      phone: '',
                      logoUrl: '',
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium"
                >
                  생성하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 매장 추가 모달 */}
      {showAddStoreModal && selectedFranchise && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">
              {selectedFranchise.name}에 매장 추가
            </h2>
            <p className="text-sm text-neutral-600 mb-4">
              프랜차이즈에 연결되지 않은 매장 목록입니다. 연결할 매장을 선택하세요.
            </p>

            {availableStores.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                연결 가능한 매장이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {availableStores.map((store) => (
                  <div
                    key={store.id}
                    className="flex items-center justify-between p-4 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-neutral-900">{store.name}</div>
                      <div className="text-sm text-neutral-600 mt-1">
                        {store.ownerName && `${store.ownerName} · `}
                        {store.address || '주소 없음'} · 고객 {store._count.customers}명
                      </div>
                      {store.slug && (
                        <div className="text-xs text-neutral-400 mt-1">Slug: {store.slug}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddStore(store.id)}
                      className="ml-4 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium"
                    >
                      연결
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={() => {
                  setShowAddStoreModal(false);
                  setSelectedFranchise(null);
                }}
                className="w-full px-4 py-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
