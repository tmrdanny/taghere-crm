'use client';

import { useState, useEffect } from 'react';
import { Building2, Mail, User, Phone, Store, Link2, Eye, EyeOff, Plus, Gift } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface OrganizationInfo {
  id: string;
  brandName: string;
  ownerName: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Skeleton component for loading state
function InfoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-200 rounded-lg animate-pulse" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function FranchiseSettingsPage() {
  const { showToast, ToastComponent } = useToast();
  const [orgInfo, setOrgInfo] = useState<OrganizationInfo | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Stamp self-claim setting
  const [selfClaimEnabled, setSelfClaimEnabled] = useState(false);
  const [isLoadingSelfClaim, setIsLoadingSelfClaim] = useState(true);
  const [isTogglingSelfClaim, setIsTogglingSelfClaim] = useState(false);

  // Store connection form
  const [connectEmail, setConnectEmail] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [showConnectPassword, setShowConnectPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch organization info
  useEffect(() => {
    const fetchOrgInfo = async () => {
      try {
        const token = localStorage.getItem('franchiseToken');
        const res = await fetch(`${API_BASE}/api/franchise/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setOrgInfo(data);
        }
      } catch (error) {
        console.error('Failed to fetch organization info:', error);
      } finally {
        setIsLoadingOrg(false);
      }
    };

    fetchOrgInfo();
  }, []);

  // Fetch stamp self-claim setting
  useEffect(() => {
    const fetchStampSetting = async () => {
      try {
        const token = localStorage.getItem('franchiseToken');
        const res = await fetch(`${API_BASE}/api/franchise/stamp-setting`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSelfClaimEnabled(data.setting?.selfClaimEnabled ?? false);
        }
      } catch (error) {
        console.error('Failed to fetch stamp setting:', error);
      } finally {
        setIsLoadingSelfClaim(false);
      }
    };
    fetchStampSetting();
  }, []);

  const handleToggleSelfClaim = async () => {
    setIsTogglingSelfClaim(true);
    try {
      const token = localStorage.getItem('franchiseToken');
      const newValue = !selfClaimEnabled;
      const res = await fetch(`${API_BASE}/api/franchise/stamp-setting`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selfClaimEnabled: newValue }),
      });
      if (res.ok) {
        setSelfClaimEnabled(newValue);
        showToast(newValue ? '스탬프 보상 셀프 신청이 활성화되었습니다.' : '스탬프 보상 셀프 신청이 비활성화되었습니다.', 'success');
      } else {
        showToast('설정 변경에 실패했습니다.', 'error');
      }
    } catch {
      showToast('설정 변경 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsTogglingSelfClaim(false);
    }
  };

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connectEmail.trim()) {
      showToast('이메일을 입력해주세요.', 'error');
      return;
    }

    if (!connectPassword) {
      showToast('비밀번호를 입력해주세요.', 'error');
      return;
    }

    setIsConnecting(true);

    try {
      const token = localStorage.getItem('franchiseToken');
      const res = await fetch(`${API_BASE}/api/franchise/stores/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: connectEmail,
          password: connectPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '가맹점 연동에 실패했습니다.');
      }

      showToast('가맹점이 성공적으로 연동되었습니다.', 'success');
      setConnectEmail('');
      setConnectPassword('');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        <p className="text-slate-500 mt-1">
          조직 정보를 확인하고 가맹점을 관리하세요
        </p>
      </div>

      <div className="space-y-6">
        {/* Organization Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">조직 정보</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              프랜차이즈 본부의 기본 정보입니다.
            </p>
          </div>

          <div className="p-6">
            {isLoadingOrg ? (
              <InfoSkeleton />
            ) : orgInfo ? (
              <div className="space-y-6">
                {/* Brand Name */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-franchise-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-franchise-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">브랜드명</p>
                    <p className="text-lg font-semibold text-slate-900">{orgInfo.brandName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Owner Name */}
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">대표자명</p>
                      <p className="text-base text-slate-900">{orgInfo.ownerName}</p>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">이메일</p>
                      <p className="text-base text-slate-900">{orgInfo.email}</p>
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">연락처</p>
                      <p className="text-base text-slate-900">
                        {orgInfo.phone || '-'}
                      </p>
                    </div>
                  </div>

                  {/* Created At */}
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">가입일</p>
                      <p className="text-base text-slate-900">{formatDate(orgInfo.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                조직 정보를 불러올 수 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* Self Claim Toggle Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Gift className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">스탬프 보상 셀프 신청</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    고객이 마이페이지에서 직접 스탬프 보상을 신청할 수 있습니다.
                  </p>
                </div>
              </div>
              {isLoadingSelfClaim ? (
                <div className="w-11 h-6 bg-slate-200 rounded-full animate-pulse" />
              ) : (
                <button
                  onClick={handleToggleSelfClaim}
                  disabled={isTogglingSelfClaim}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    selfClaimEnabled ? 'bg-franchise-600' : 'bg-slate-200'
                  } ${isTogglingSelfClaim ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      selfClaimEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Store Connection Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">가맹점 추가 등록</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              태그히어 CRM에 등록된 매장의 이메일과 비밀번호를 입력하여 가맹점을 등록할 수 있습니다.
            </p>
          </div>

          <div className="p-6">
            <form onSubmit={handleConnectStore} className="space-y-5">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-4 bg-franchise-50 border border-franchise-100 rounded-lg">
                <Link2 className="w-5 h-5 text-franchise-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-franchise-900">가맹점 연동 안내</p>
                  <p className="text-sm text-franchise-700 mt-1">
                    가맹점 사장님이 이미 태그히어 CRM에 가입되어 있어야 합니다.
                    가맹점의 로그인 정보를 입력하면 해당 매장이 본부에 연동됩니다.
                  </p>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  가맹점 이메일 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    placeholder="store@example.com"
                    value={connectEmail}
                    onChange={(e) => setConnectEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  가맹점 비밀번호 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showConnectPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={connectPassword}
                    onChange={(e) => setConnectPassword(e.target.value)}
                    required
                    className="w-full pl-12 pr-12 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConnectPassword(!showConnectPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  >
                    {showConnectPassword ? (
                      <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="inline-flex items-center gap-2 bg-franchise-500 text-white hover:bg-franchise-700 px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      연동 중...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      가맹점 연동
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
