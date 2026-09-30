'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect } from 'react';
import { Building2, Mail, User, Phone, Store, Link2, Eye, EyeOff, Plus, Gift, Calendar, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface OrganizationInfo {
  id: string;
  brandName: string;
  ownerName: string;
  email: string;
  phone: string | null;
  createdAt: string;
}


// Skeleton component for loading state
function InfoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-[color:var(--ad-bg)]" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-[color:var(--ad-bg)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[color:var(--ad-bg-alt)]" />
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* Page Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">설정</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          조직 정보를 확인하고 가맹점을 관리하세요
        </p>
      </div>

      <div className="mx-auto max-w-4xl space-y-4">
        {/* Organization Info Card */}
        <div className="adm-card">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">조직 정보</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              프랜차이즈 본부의 기본 정보입니다.
            </p>
          </div>

          <div className="px-5 pb-5">
            {isLoadingOrg ? (
              <InfoSkeleton />
            ) : orgInfo ? (
              <div className="space-y-5">
                {/* Brand Name */}
                <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">브랜드명</p>
                  <p className="mt-0.5 text-[16px] font-semibold text-[color:var(--ad-ink)]">{orgInfo.brandName}</p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {/* Owner Name */}
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">대표자명</p>
                      <p className="mt-0.5 text-[13.5px] text-[color:var(--ad-ink)]">{orgInfo.ownerName}</p>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">이메일</p>
                      <p className="mt-0.5 text-[13.5px] text-[color:var(--ad-ink)]">{orgInfo.email}</p>
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">연락처</p>
                      <p className="mt-0.5 text-[13.5px] text-[color:var(--ad-ink)]">{orgInfo.phone || '-'}</p>
                    </div>
                  </div>

                  {/* Created At */}
                  <div className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">가입일</p>
                      <p className="mt-0.5 text-[13.5px] text-[color:var(--ad-ink)]">{formatDate(orgInfo.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-[13px] text-[color:var(--ad-faint)]">
                조직 정보를 불러올 수 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* Self Claim Toggle Card */}
        <div className="adm-card">
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Gift className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">스탬프 보상 셀프 신청</h2>
                  <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">
                    고객이 마이페이지에서 직접 스탬프 보상을 신청할 수 있습니다.
                  </p>
                </div>
              </div>
              {isLoadingSelfClaim ? (
                <div className="h-6 w-11 flex-shrink-0 animate-pulse rounded-full bg-[color:var(--ad-bg)]" />
              ) : (
                <button
                  onClick={handleToggleSelfClaim}
                  disabled={isTogglingSelfClaim}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    selfClaimEnabled ? 'bg-[color:var(--ad-ink)]' : 'bg-[color:var(--ad-line-strong)]'
                  } ${isTogglingSelfClaim ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      selfClaimEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Store Connection Card */}
        <div className="adm-card">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">가맹점 추가 등록</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              태그히어 CRM에 등록된 매장의 이메일과 비밀번호를 입력하여 가맹점을 등록할 수 있습니다.
            </p>
          </div>

          <div className="px-5 pb-5">
            <form onSubmit={handleConnectStore} className="space-y-4">
              {/* Info Banner */}
              <div className="flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
                <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <p className="font-medium text-[color:var(--ad-ink-2)]">가맹점 연동 안내</p>
                  <p className="mt-0.5">
                    가맹점 사장님이 이미 태그히어 CRM에 가입되어 있어야 합니다.
                    가맹점의 로그인 정보를 입력하면 해당 매장이 본부에 연동됩니다.
                  </p>
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  가맹점 이메일 <span className="text-[color:var(--ad-neg)]">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </div>
                  <input
                    type="email"
                    placeholder="store@example.com"
                    value={connectEmail}
                    onChange={(e) => setConnectEmail(e.target.value)}
                    required
                    className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] transition-colors focus:border-[color:var(--ad-ink)] focus:outline-none pl-9 pr-3"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  가맹점 비밀번호 <span className="text-[color:var(--ad-neg)]">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </div>
                  <input
                    type={showConnectPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={connectPassword}
                    onChange={(e) => setConnectPassword(e.target.value)}
                    required
                    className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] transition-colors focus:border-[color:var(--ad-ink)] focus:outline-none pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConnectPassword(!showConnectPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink-2)]"
                  >
                    {showConnectPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="adm-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isConnecting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      연동 중...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
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
