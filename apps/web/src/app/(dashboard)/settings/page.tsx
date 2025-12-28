'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Store, User, LogOut, MessageSquare, Gift, Coins, Link2, QrCode, Copy, Check, Download } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const { showToast, ToastComponent } = useToast();

  // Store info states
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [businessRegNumber, setBusinessRegNumber] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [isLoadingStore, setIsLoadingStore] = useState(true);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // User info states
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // Alimtalk settings
  const [pointsAlimtalkEnabled, setPointsAlimtalkEnabled] = useState(true);
  const [isSavingAlimtalk, setIsSavingAlimtalk] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // 충전금이 5원 미만이면 알림톡을 켤 수 없음
  const MIN_BALANCE_FOR_ALIMTALK = 5;
  const canEnableAlimtalk = walletBalance >= MIN_BALANCE_FOR_ALIMTALK;

  // Random point settings
  const [randomPointEnabled, setRandomPointEnabled] = useState(false);
  const [randomPointMin, setRandomPointMin] = useState(100);
  const [randomPointMax, setRandomPointMax] = useState(1000);
  const [isSavingRandomPoint, setIsSavingRandomPoint] = useState(false);

  // Fixed point settings
  const [fixedPointEnabled, setFixedPointEnabled] = useState(false);
  const [fixedPointAmount, setFixedPointAmount] = useState(100);
  const [isSavingFixedPoint, setIsSavingFixedPoint] = useState(false);

  // Fetch store info
  useEffect(() => {
    const fetchStoreInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/settings/store`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setStoreName(data.name || '');
          setOwnerName(data.ownerName || '');
          setStorePhone(data.phone || '');
          setBusinessRegNumber(data.businessRegNumber || '');
          setStoreAddress(data.address || '');
          setNaverPlaceUrl(data.naverPlaceUrl || '');
          setStoreSlug(data.slug || null);
        }
      } catch (error) {
        console.error('Failed to fetch store info:', error);
      } finally {
        setIsLoadingStore(false);
      }
    };

    const fetchUserInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setUserInfo(data);
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    const fetchAlimtalkSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/settings/alimtalk`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setPointsAlimtalkEnabled(data.pointsAlimtalkEnabled ?? true);
        }
      } catch (error) {
        console.error('Failed to fetch alimtalk settings:', error);
      }
    };

    const fetchRandomPointSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/settings/random-point`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setRandomPointEnabled(data.randomPointEnabled ?? false);
          setRandomPointMin(data.randomPointMin ?? 100);
          setRandomPointMax(data.randomPointMax ?? 1000);
        }
      } catch (error) {
        console.error('Failed to fetch random point settings:', error);
      }
    };

    const fetchFixedPointSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/settings/fixed-point`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setFixedPointEnabled(data.fixedPointEnabled ?? false);
          setFixedPointAmount(data.fixedPointAmount ?? 100);
        }
      } catch (error) {
        console.error('Failed to fetch fixed point settings:', error);
      }
    };

    const fetchWalletBalance = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/wallet`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.balance ?? 0);
          // 충전금이 5원 미만이면 알림톡 강제 OFF
          if ((data.balance ?? 0) < MIN_BALANCE_FOR_ALIMTALK) {
            setPointsAlimtalkEnabled(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch wallet balance:', error);
      }
    };

    fetchStoreInfo();
    fetchUserInfo();
    fetchAlimtalkSettings();
    fetchRandomPointSettings();
    fetchFixedPointSettings();
    fetchWalletBalance();
  }, [apiUrl]);

  const handleSaveStore = async () => {
    if (!storeName.trim()) {
      showToast('매장명은 필수입니다.', 'error');
      return;
    }

    setIsSavingStore(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/store`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: storeName,
          ownerName,
          phone: storePhone,
          businessRegNumber,
          address: storeAddress,
          naverPlaceUrl,
        }),
      });

      if (res.ok) {
        showToast('매장 정보가 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save store info:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.replace('/login');
  };

  const handleToggleAlimtalk = async (enabled: boolean) => {
    setIsSavingAlimtalk(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/alimtalk`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pointsAlimtalkEnabled: enabled,
        }),
      });

      if (res.ok) {
        setPointsAlimtalkEnabled(enabled);
        showToast('알림톡 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save alimtalk settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingAlimtalk(false);
    }
  };

  const handleSaveRandomPoint = async () => {
    if (randomPointMin < 0 || randomPointMax < 0) {
      showToast('포인트는 0 이상이어야 합니다.', 'error');
      return;
    }
    if (randomPointMin > randomPointMax) {
      showToast('최소 포인트가 최대 포인트보다 클 수 없습니다.', 'error');
      return;
    }

    setIsSavingRandomPoint(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/random-point`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          randomPointEnabled,
          randomPointMin,
          randomPointMax,
        }),
      });

      if (res.ok) {
        // 랜덤 포인트 활성화 시 고정 포인트는 자동으로 비활성화됨
        if (randomPointEnabled) {
          setFixedPointEnabled(false);
        }
        showToast('랜덤 포인트 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save random point settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingRandomPoint(false);
    }
  };

  const handleSaveFixedPoint = async () => {
    if (fixedPointAmount < 0) {
      showToast('포인트는 0 이상이어야 합니다.', 'error');
      return;
    }

    setIsSavingFixedPoint(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/fixed-point`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixedPointEnabled,
          fixedPointAmount,
        }),
      });

      if (res.ok) {
        // 고정 포인트 활성화 시 랜덤 포인트는 자동으로 비활성화됨
        if (fixedPointEnabled) {
          setRandomPointEnabled(false);
        }
        showToast('고정 포인트 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save fixed point settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingFixedPoint(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">설정</h1>
        <p className="text-neutral-500 mt-1">
          매장 운영에 필요한 주요 설정을 관리하세요.
        </p>
      </div>

      <div className="space-y-6">
        {/* Store Info Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">매장 정보</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              매장의 기본 정보를 관리합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingStore ? (
              <div className="text-center py-8 text-neutral-500">
                불러오는 중...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      매장명 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="매장명을 입력하세요"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      대표자명
                    </label>
                    <Input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="대표자명을 입력하세요"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      연락처
                    </label>
                    <Input
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      placeholder="연락처를 입력하세요"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      사업자등록번호
                    </label>
                    <Input
                      value={businessRegNumber}
                      onChange={(e) => setBusinessRegNumber(e.target.value)}
                      placeholder="사업자등록번호를 입력하세요"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    주소
                  </label>
                  <Input
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    placeholder="매장 주소를 입력하세요"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    네이버 플레이스 링크
                  </label>
                  <Input
                    value={naverPlaceUrl}
                    onChange={(e) => setNaverPlaceUrl(e.target.value)}
                    placeholder="https://naver.me/..."
                  />
                  <p className="text-xs text-neutral-500">
                    네이버플레이스 -&gt; &apos;공유&apos;를 클릭하여 나오는 링크를 넣어주세요.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveStore} disabled={isSavingStore}>
                    {isSavingStore ? '저장 중...' : '저장하기'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Customer Enroll Link Card */}
        {storeSlug && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">고객 등록 링크</CardTitle>
              </div>
              <p className="text-sm text-neutral-500 mt-1">
                고객이 이 링크로 접속하면 카카오 로그인 후 포인트를 받을 수 있습니다.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Link Display */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  매장 전용 링크
                </label>
                <div className="flex gap-2">
                  <Input
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/enroll/${storeSlug}`}
                    readOnly
                    className="font-mono text-sm bg-neutral-50"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = `${window.location.origin}/enroll/${storeSlug}`;
                      navigator.clipboard.writeText(link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        복사
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* QR Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  QR 코드
                </label>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg inline-block">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/enroll/${storeSlug}`)}`}
                      alt="QR Code"
                      width={150}
                      height={150}
                      className="block"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500">
                      QR 코드를 스캔하면 고객 등록 페이지로 이동합니다.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/enroll/${storeSlug}`)}`;
                        const a = document.createElement('a');
                        a.href = link;
                        a.download = `taghere-qr-${storeSlug}.png`;
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      QR 다운로드
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alimtalk Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">알림톡 설정</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객에게 발송되는 알림톡을 관리합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  포인트 적립/사용 알림톡 자동 발송
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  포인트 적립 또는 사용 시 고객에게 알림톡을 자동으로 발송합니다.
                </p>
              </div>
              <Switch
                checked={pointsAlimtalkEnabled && canEnableAlimtalk}
                onCheckedChange={handleToggleAlimtalk}
                disabled={isSavingAlimtalk || !canEnableAlimtalk}
              />
            </div>
            {!canEnableAlimtalk && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  ⚠️ 충전금이 {MIN_BALANCE_FOR_ALIMTALK}원 미만입니다. 알림톡을 발송하려면 먼저 충전해주세요.
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  현재 잔액: {walletBalance.toLocaleString()}원
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Random Point Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">랜덤 포인트</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객이 방문할 때마다 랜덤한 포인트를 적립받을 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 활성화 토글 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  랜덤 포인트 활성화
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  활성화하면 고정 포인트 대신 랜덤 포인트가 적립됩니다.
                </p>
              </div>
              <Switch
                checked={randomPointEnabled}
                onCheckedChange={setRandomPointEnabled}
              />
            </div>

            {/* 포인트 범위 설정 */}
            {randomPointEnabled && (
              <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      최소 포인트
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={randomPointMin}
                      onChange={(e) => setRandomPointMin(parseInt(e.target.value) || 0)}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      최대 포인트
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={randomPointMax}
                      onChange={(e) => setRandomPointMax(parseInt(e.target.value) || 0)}
                      placeholder="1000"
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  💡 낮은 금액이 더 자주 나오고, 높은 금액은 드물게 나옵니다.
                </p>
                <div className="flex justify-end">
                  <Button onClick={handleSaveRandomPoint} disabled={isSavingRandomPoint}>
                    {isSavingRandomPoint ? '저장 중...' : '저장하기'}
                  </Button>
                </div>
              </div>
            )}

            {!randomPointEnabled && (
              <div className="flex justify-end">
                <Button onClick={handleSaveRandomPoint} disabled={isSavingRandomPoint}>
                  {isSavingRandomPoint ? '저장 중...' : '저장하기'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fixed Point Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">고정 포인트</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객이 방문할 때마다 고정된 포인트를 적립받습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 활성화 토글 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  고정 포인트 활성화
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  활성화하면 랜덤 포인트 대신 고정 포인트가 적립됩니다.
                </p>
              </div>
              <Switch
                checked={fixedPointEnabled}
                onCheckedChange={setFixedPointEnabled}
              />
            </div>

            {/* 포인트 금액 설정 */}
            {fixedPointEnabled && (
              <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    적립 포인트
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={fixedPointAmount}
                    onChange={(e) => setFixedPointAmount(parseInt(e.target.value) || 0)}
                    placeholder="100"
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  💡 매 방문 시 설정한 포인트가 동일하게 적립됩니다.
                </p>
                <div className="flex justify-end">
                  <Button onClick={handleSaveFixedPoint} disabled={isSavingFixedPoint}>
                    {isSavingFixedPoint ? '저장 중...' : '저장하기'}
                  </Button>
                </div>
              </div>
            )}

            {!fixedPointEnabled && (
              <div className="flex justify-end">
                <Button onClick={handleSaveFixedPoint} disabled={isSavingFixedPoint}>
                  {isSavingFixedPoint ? '저장 중...' : '저장하기'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">계정 관리</CardTitle>
            </div>
            <p className="text-sm text-neutral-500">
              로그인 정보 및 계정 보안을 관리합니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  {userInfo?.email || ''}
                </p>
              </div>
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                로그아웃
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
