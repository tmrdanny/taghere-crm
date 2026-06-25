'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Store, User, LogOut, MessageSquare, Percent, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

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
  // 기타
  FOODCOURT: '푸드코트',
  OTHER: '기타',
} as const;

const CATEGORY_GROUPS = [
  { label: '음식점', options: ['KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'ASIAN', 'BUNSIK', 'FASTFOOD', 'MEAT', 'SEAFOOD', 'BUFFET', 'BRUNCH'] },
  { label: '카페/디저트', options: ['CAFE', 'BAKERY', 'DESSERT', 'ICECREAM'] },
  { label: '주점', options: ['BEER', 'IZAKAYA', 'WINE_BAR', 'COCKTAIL_BAR', 'POCHA', 'KOREAN_PUB'] },
  { label: '기타', options: ['FOODCOURT', 'OTHER'] },
];

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const apiUrl = API_BASE;
  const { showToast, ToastComponent } = useToast();

  // Store info states
  const [storeName, setStoreName] = useState('');
  const [storeCategory, setStoreCategory] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [businessRegNumber, setBusinessRegNumber] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');
  const [isLoadingStore, setIsLoadingStore] = useState(true);
  const [isSavingStore, setIsSavingStore] = useState(false);

  // User info states
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // Alimtalk settings
  const [pointsAlimtalkEnabled, setPointsAlimtalkEnabled] = useState(true);
  const [pointsAlimtalkFrequency, setPointsAlimtalkFrequency] = useState<'EVERY_ORDER' | 'FIRST_ONLY'>('EVERY_ORDER');
  const [isSavingAlimtalk, setIsSavingAlimtalk] = useState(false);
  const [isSavingFrequency, setIsSavingFrequency] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // 충전금이 5원 미만이면 알림톡을 켤 수 없음
  const MIN_BALANCE_FOR_ALIMTALK = 5;
  const canEnableAlimtalk = walletBalance >= MIN_BALANCE_FOR_ALIMTALK;

  // Stamp alimtalk settings
  const [stampAlimtalkEnabled, setStampAlimtalkEnabled] = useState(true);
  const [isSavingStampAlimtalk, setIsSavingStampAlimtalk] = useState(false);

  // Point rate settings (결제금액 기반 적립률)
  const [pointRatePercent, setPointRatePercent] = useState('5');
  const [isSavingPointRate, setIsSavingPointRate] = useState(false);

  // Point usage rule settings (포인트 사용 규칙)
  const [pointUsageRule, setPointUsageRule] = useState('');
  const [isSavingPointUsageRule, setIsSavingPointUsageRule] = useState(false);

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
          setStoreCategory(data.category || '');
          setOwnerName(data.ownerName || '');
          setStorePhone(data.phone || '');
          setBusinessRegNumber(data.businessRegNumber || '');
          setStoreAddress(data.address || '');
          setNaverPlaceUrl(data.naverPlaceUrl || '');
          setPointUsageRule(data.pointUsageRule || '');
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
          setPointsAlimtalkFrequency(data.pointsAlimtalkFrequency || 'EVERY_ORDER');
        }
      } catch (error) {
        console.error('Failed to fetch alimtalk settings:', error);
      }
    };

    const fetchPointRateSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/settings/point-rate`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setPointRatePercent(String(data.pointRatePercent ?? 5));
        }
      } catch (error) {
        console.error('Failed to fetch point rate settings:', error);
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

    const fetchStampAlimtalkSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/stamp-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStampAlimtalkEnabled(data.alimtalkEnabled ?? true);
        }
      } catch (error) {
        console.error('Failed to fetch stamp alimtalk settings:', error);
      }
    };

    fetchStoreInfo();
    fetchUserInfo();
    fetchAlimtalkSettings();
    fetchPointRateSettings();
    fetchWalletBalance();
    fetchStampAlimtalkSettings();
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
          category: storeCategory || null,
          ownerName,
          phone: storePhone,
          businessRegNumber,
          address: storeAddress,
          naverPlaceUrl,
        }),
      });

      if (res.ok) {
        trackEvent('owner_settings_save', { section: 'store' });
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
    if (!enabled) {
      const confirmed = window.confirm('알림톡 발송을 하지 않을 경우 고객은 적립이 얼마나 되었는지 확인할 수 없습니다. 알림톡을 끄시겠습니까?');
      if (!confirmed) return;
    }
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
        trackEvent('owner_settings_save', { section: 'alimtalk' });
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

  const handleToggleStampAlimtalk = async (enabled: boolean) => {
    if (!enabled) {
      const confirmed = window.confirm('알림톡 발송을 하지 않을 경우 고객은 적립이 얼마나 되었는지 확인할 수 없습니다. 알림톡을 끄시겠습니까?');
      if (!confirmed) return;
    }
    setIsSavingStampAlimtalk(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alimtalkEnabled: enabled }),
      });

      if (res.ok) {
        setStampAlimtalkEnabled(enabled);
        showToast(enabled ? '스탬프 알림톡이 활성화되었습니다.' : '스탬프 알림톡이 비활성화되었습니다.', 'success');
      } else {
        showToast('설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save stamp alimtalk settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingStampAlimtalk(false);
    }
  };

  const handleChangeFrequency = async (frequency: 'EVERY_ORDER' | 'FIRST_ONLY') => {
    setIsSavingFrequency(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/alimtalk`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pointsAlimtalkFrequency: frequency,
        }),
      });

      if (res.ok) {
        setPointsAlimtalkFrequency(frequency);
        showToast('발송 빈도 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save frequency settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingFrequency(false);
    }
  };

  const handleSavePointRate = async () => {
    const rateValue = parseFloat(pointRatePercent) || 0;
    if (rateValue < 0.1 || rateValue > 99.9) {
      showToast('적립률은 0.1~99.9% 사이여야 합니다.', 'error');
      return;
    }

    setIsSavingPointRate(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/point-rate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pointRatePercent: rateValue,
        }),
      });

      if (res.ok) {
        trackEvent('owner_settings_save', { section: 'point_rate' });
        showToast('포인트 적립률이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save point rate settings:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingPointRate(false);
    }
  };

  const handleSavePointUsageRule = async () => {
    setIsSavingPointUsageRule(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/settings/point-usage-rule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pointUsageRule,
        }),
      });

      if (res.ok) {
        showToast('포인트 사용 규칙이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save point usage rule:', error);
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingPointUsageRule(false);
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
                      업종
                    </label>
                    <select
                      value={storeCategory}
                      onChange={(e) => setStoreCategory(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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

        {/* Customer Enroll Link Card - admin으로 이동됨, 숨김 처리
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  매장 전용 링크
                </label>
                <div className="flex gap-2">
                  <Input
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/taghere-enroll/${storeSlug}?ordersheetId={ordersheetId}`}
                    readOnly
                    className="font-mono text-sm bg-neutral-50"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = `${window.location.origin}/taghere-enroll/${storeSlug}?ordersheetId={ordersheetId}`;
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
                <p className="text-xs text-neutral-500">
                  💡 태그히어 배너에 복사하여 사용하세요. ordersheetId는 자동으로 치환됩니다.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  QR 코드
                </label>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg inline-block">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/taghere-enroll/${storeSlug}`)}`}
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
                        const link = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/taghere-enroll/${storeSlug}`)}`;
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
        */}

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

            {/* 발송 빈도 설정 */}
            {pointsAlimtalkEnabled && canEnableAlimtalk && (
              <div className="mt-4 pt-4 border-t border-neutral-200">
                <p className="text-sm font-medium text-neutral-700 mb-3">발송 빈도</p>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="alimtalkFrequency"
                      value="EVERY_ORDER"
                      checked={pointsAlimtalkFrequency === 'EVERY_ORDER'}
                      onChange={() => handleChangeFrequency('EVERY_ORDER')}
                      disabled={isSavingFrequency}
                      className="mt-1 w-4 h-4 text-brand-600 border-neutral-300 focus:ring-brand-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-900">매 주문 발송</span>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        포인트 적립 시마다 알림톡을 발송합니다.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="alimtalkFrequency"
                      value="FIRST_ONLY"
                      checked={pointsAlimtalkFrequency === 'FIRST_ONLY'}
                      onChange={() => handleChangeFrequency('FIRST_ONLY')}
                      disabled={isSavingFrequency}
                      className="mt-1 w-4 h-4 text-brand-600 border-neutral-300 focus:ring-brand-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-900">첫 주문 1회만 발송</span>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        당일 첫 주문 시에만 알림톡을 발송합니다. (포인트는 매번 적립)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 스탬프 적립 알림톡 */}
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-900">
                    스탬프 적립 알림톡 발송
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
                    스탬프 적립 시 고객에게 현재 스탬프 수와 보상 정보를 알림톡으로 발송합니다.
                  </p>
                </div>
                <Switch
                  checked={stampAlimtalkEnabled && canEnableAlimtalk}
                  onCheckedChange={handleToggleStampAlimtalk}
                  disabled={isSavingStampAlimtalk || !canEnableAlimtalk}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Point Rate Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">포인트 적립률</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              주문/결제 금액의 일정 비율을 포인트로 적립합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 적립률 설정 */}
            <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  적립률 (0.1~99.9%)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={pointRatePercent}
                    onChange={(e) => {
                      const val = e.target.value;
                      // 0~99.9 범위의 숫자 허용 (소수점 한 자리까지)
                      if (val === '' || /^\d{0,2}(\.\d?)?$/.test(val)) {
                        setPointRatePercent(val);
                      }
                    }}
                    placeholder="5"
                    className="w-24"
                  />
                  <span className="text-neutral-500">%</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                예: 5% 설정 시 10,000원 결제 → 500P 적립 (소수점 한 자리까지, 반올림 적용)
              </p>
              <div className="flex justify-end">
                <Button onClick={handleSavePointRate} disabled={isSavingPointRate}>
                  {isSavingPointRate ? '저장 중...' : '저장하기'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Point Usage Rule Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">포인트 사용 규칙</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객이 포인트를 어떤 기준으로 쓸 수 있는지 작성해주세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={pointUsageRule}
                onChange={(e) => setPointUsageRule(e.target.value)}
                placeholder="3,000원 이상부터 사용 가능, 다음 번 방문부터 사용 가능, (자유롭게 작성 하셔도 돼요)."
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-neutral-500">
                💡 이 내용은 포인트 적립 알림톡에 포함되어 고객에게 발송됩니다.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSavePointUsageRule} disabled={isSavingPointUsageRule}>
                {isSavingPointUsageRule ? '저장 중...' : '저장하기'}
              </Button>
            </div>
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
