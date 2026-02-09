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
  const [showLogoUploadModal, setShowLogoUploadModal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAction, setWalletAction] = useState<'topup' | 'deduct'>('topup');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [walletPassword, setWalletPassword] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '',
  });
  const [editLoading, setEditLoading] = useState(false);

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
  const [logoFile, setLogoFile] = useState<File | null>(null);

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

      // 로고 파일이 있으면 업로드
      if (logoFile) {
        const logoFormData = new FormData();
        logoFormData.append('logo', logoFile);

        const logoRes = await fetch(`${API_URL}/api/admin/franchises/${data.franchise.id}/logo`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: logoFormData,
        });

        if (!logoRes.ok) {
          console.error('로고 업로드 실패');
        }
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
      setLogoFile(null);
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

  const handleLogoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFranchise || !logoFile) return;

    setUploadingLogo(true);

    try {
      const token = localStorage.getItem('adminToken');
      const formData = new FormData();
      formData.append('logo', logoFile);

      const res = await fetch(`${API_URL}/api/admin/franchises/${selectedFranchise.id}/logo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '로고 업로드에 실패했습니다.');
      }

      alert('로고가 업로드되었습니다.');
      setShowLogoUploadModal(false);
      setSelectedFranchise(null);
      setLogoFile(null);
      fetchFranchises();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploadingLogo(false);
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

  const handleWalletAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFranchise) return;

    const amount = parseInt(walletAmount.replace(/,/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      alert('유효한 금액을 입력해주세요.');
      return;
    }

    if (!walletPassword) {
      alert('관리자 비밀번호를 입력해주세요.');
      return;
    }

    setWalletLoading(true);

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_URL}/api/admin/franchises/${selectedFranchise.id}/wallet/${walletAction}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount,
            reason: walletReason || undefined,
            adminPassword: walletPassword,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '처리에 실패했습니다.');
      }

      alert(data.message);
      setShowWalletModal(false);
      setWalletAmount('');
      setWalletReason('');
      setWalletPassword('');
      setSelectedFranchise(null);
      fetchFranchises();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setWalletLoading(false);
    }
  };

  const formatNumberInput = (value: string) => {
    const num = value.replace(/[^\d]/g, '');
    return num ? parseInt(num, 10).toLocaleString() : '';
  };

  const handleOpenEditModal = (franchise: Franchise) => {
    const owner = franchise.users.find((u) => u.role === 'OWNER');
    setSelectedFranchise(franchise);
    setEditFormData({
      name: franchise.name,
      ownerName: owner?.name || '',
      ownerEmail: owner?.email || '',
      ownerPhone: owner?.phone || '',
      ownerPassword: '',
    });
    setShowEditModal(true);
  };

  const handleEditFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFranchise) return;

    setEditLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const body: any = {
        name: editFormData.name,
        ownerName: editFormData.ownerName,
        ownerEmail: editFormData.ownerEmail,
        ownerPhone: editFormData.ownerPhone,
      };
      if (editFormData.ownerPassword) {
        body.ownerPassword = editFormData.ownerPassword;
      }

      const res = await fetch(`${API_URL}/api/admin/franchises/${selectedFranchise.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '수정에 실패했습니다.');
      }

      alert('프랜차이즈 정보가 수정되었습니다.');
      setShowEditModal(false);
      setSelectedFranchise(null);
      fetchFranchises();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setEditLoading(false);
    }
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
                    <tr key={franchise.id} className="hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => handleOpenEditModal(franchise)}>
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
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setSelectedFranchise(franchise);
                              setWalletAction('topup');
                              setShowWalletModal(true);
                            }}
                            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            충전
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFranchise(franchise);
                              setWalletAction('deduct');
                              setShowWalletModal(true);
                            }}
                            className="text-sm text-red-600 hover:text-red-700 font-medium"
                          >
                            차감
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFranchise(franchise);
                              setShowAddStoreModal(true);
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            매장 추가
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFranchise(franchise);
                              setShowLogoUploadModal(true);
                            }}
                            className="text-sm text-neutral-600 hover:text-neutral-700 font-medium"
                          >
                            로고
                          </button>
                        </div>
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
                  로고 파일 (선택)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        alert('로고 파일은 2MB 이하만 업로드 가능합니다.');
                        e.target.value = '';
                        return;
                      }
                      setLogoFile(file);
                    }
                  }}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-neutral-50 file:text-neutral-700 hover:file:bg-neutral-100"
                />
                {logoFile && (
                  <p className="mt-1 text-xs text-neutral-500">
                    선택된 파일: {logoFile.name}
                  </p>
                )}
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
                    setLogoFile(null);
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

      {/* 충전/차감 모달 */}
      {showWalletModal && selectedFranchise && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">
              {selectedFranchise.name} 충전금 {walletAction === 'topup' ? '충전' : '차감'}
            </h2>
            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <div className="text-sm text-neutral-600">현재 잔액</div>
              <div className="text-lg font-bold text-neutral-900">
                {formatCurrency(selectedFranchise.wallet?.balance || 0)}원
              </div>
            </div>
            <form onSubmit={handleWalletAction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {walletAction === 'topup' ? '충전' : '차감'} 금액 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(formatNumberInput(e.target.value))}
                    className="w-full px-3 py-2 pr-8 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-right"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">원</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  사유 (선택)
                </label>
                <input
                  type="text"
                  value={walletReason}
                  onChange={(e) => setWalletReason(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder={walletAction === 'topup' ? '예: 프로모션 지원금' : '예: 환불 처리'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={walletPassword}
                  onChange={(e) => setWalletPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="관리자 비밀번호 입력"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWalletModal(false);
                    setWalletAmount('');
                    setWalletReason('');
                    setWalletPassword('');
                    setSelectedFranchise(null);
                  }}
                  className="flex-1 px-4 py-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                  disabled={walletLoading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium text-white disabled:cursor-not-allowed ${
                    walletAction === 'topup'
                      ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                      : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                  }`}
                  disabled={walletLoading || !walletAmount || !walletPassword}
                >
                  {walletLoading ? '처리 중...' : walletAction === 'topup' ? '충전하기' : '차감하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 로고 업로드 모달 */}
      {showLogoUploadModal && selectedFranchise && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">
              {selectedFranchise.name} 로고 업로드
            </h2>
            <form onSubmit={handleLogoUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  로고 파일 선택 (최대 2MB)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        alert('로고 파일은 2MB 이하만 업로드 가능합니다.');
                        e.target.value = '';
                        return;
                      }
                      setLogoFile(file);
                    }
                  }}
                  required
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-neutral-50 file:text-neutral-700 hover:file:bg-neutral-100"
                />
                {logoFile && (
                  <p className="mt-2 text-sm text-neutral-600">
                    선택된 파일: {logoFile.name} ({(logoFile.size / 1024).toFixed(1)}KB)
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoUploadModal(false);
                    setSelectedFranchise(null);
                    setLogoFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                  disabled={uploadingLogo}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium disabled:bg-neutral-400 disabled:cursor-not-allowed"
                  disabled={uploadingLogo || !logoFile}
                >
                  {uploadingLogo ? '업로드 중...' : '업로드'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 프랜차이즈 편집 모달 */}
      {showEditModal && selectedFranchise && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">프랜차이즈 정보 수정</h2>
            <form onSubmit={handleEditFranchise} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  프랜차이즈명
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={selectedFranchise.slug}
                  readOnly
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg bg-neutral-50 text-neutral-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 이름
                </label>
                <input
                  type="text"
                  value={editFormData.ownerName}
                  onChange={(e) => setEditFormData({ ...editFormData, ownerName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 이메일
                </label>
                <input
                  type="email"
                  value={editFormData.ownerEmail}
                  onChange={(e) => setEditFormData({ ...editFormData, ownerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  관리자 전화번호
                </label>
                <input
                  type="tel"
                  value={editFormData.ownerPhone}
                  onChange={(e) => setEditFormData({ ...editFormData, ownerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="010-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={editFormData.ownerPassword}
                  onChange={(e) => setEditFormData({ ...editFormData, ownerPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="변경 시에만 입력"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedFranchise(null);
                  }}
                  className="flex-1 px-4 py-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
                  disabled={editLoading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium disabled:bg-neutral-400 disabled:cursor-not-allowed"
                  disabled={editLoading}
                >
                  {editLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
