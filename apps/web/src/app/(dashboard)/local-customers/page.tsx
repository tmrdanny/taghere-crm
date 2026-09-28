'use client';

import { API_BASE } from '@/lib/api-config';
import { getStoreToken } from '@/lib/auth-token';
import { AGE_GROUP_OPTIONS } from '@/lib/constants';
import { useState, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  MapPin,
  Users,
  Send,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronUp,
  Camera,
  X,
  Search,
  Plus,
  TrendingUp,
  Menu,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChargeModal } from '@/components/ChargeModal';
import { IPhoneFrame } from '@/components/ui/iphone-frame';


// 대한민국 17개 시/도 목록 + 미지정
const KOREA_SIDOS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '미지정'
];

// 성별 옵션
const GENDER_OPTIONS = [
  { value: 'all', label: '전체 성별' },
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
];

// 비용 상수
const SMS_COST_PER_MESSAGE = 150;
const COUPON_ALIMTALK_COST = 150;

// 인증 토큰 가져오기
// 예상 매출 타입
interface EstimatedRevenue {
  avgOrderValue: number;
  conversionRate: number;
}

export default function LocalCustomersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // 충전 모달 상태
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'kakao' | 'sms'>('sms');

  // 지역 상태 (시/도 및 시/군/구 선택)
  const [selectedSidos, setSelectedSidos] = useState<string[]>([]);
  const [selectedSigungus, setSelectedSigungus] = useState<Record<string, string[]>>({});
  const [regionSearchQuery, setRegionSearchQuery] = useState('');
  const [sigunguSearchQuery, setSigunguSearchQuery] = useState('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [isSigunguDropdownOpen, setIsSigunguDropdownOpen] = useState(false);
  const [activeSidoForSigungu, setActiveSidoForSigungu] = useState<string | null>(null);

  // 필터 상태
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [gender, setGender] = useState<string>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPreferredCategories, setSelectedPreferredCategories] = useState<string[]>([]);

  // 발송 대상 상태
  const [globalTotalCount, setGlobalTotalCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);
  const [sendCount, setSendCount] = useState(0);

  // 메시지 상태 (공통)
  const [content, setContent] = useState('');

  // 쿠폰 알림톡 전용 상태
  const [couponContent, setCouponContent] = useState('');
  const [couponExpiryDate, setCouponExpiryDate] = useState('');
  const [couponStoreName, setCouponStoreName] = useState('');
  const [isCouponSending, setIsCouponSending] = useState(false);
  const [kakaoEstimate, setKakaoEstimate] = useState<{
    costPerMessage: number;
    totalCost: number;
    walletBalance: number;
    canSend: boolean;
    estimatedRevenue?: EstimatedRevenue;
  } | null>(null);

  // 지갑 상태
  const [walletBalance, setWalletBalance] = useState(0);

  // 지역별 고객 수 상태
  const [regionCounts, setRegionCounts] = useState<{
    sidoCounts: Record<string, number>;
    sigunguCounts: Record<string, Record<string, number>>;
  }>({ sidoCounts: {}, sigunguCounts: {} });

  // UI 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 테스트 발송 상태
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);

  // 전체 고객 수 및 지역별 카운트 로드 (병렬 실행)
  useEffect(() => {
    const fetchInitialData = async () => {
      const token = getStoreToken();
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [globalCountRes, regionCountsRes] = await Promise.all([
          fetch(`${API_BASE}/api/local-customers/total-count`, { headers }),
          fetch(`${API_BASE}/api/local-customers/region-counts`, { headers }),
        ]);

        const [globalCountData, regionCountsData] = await Promise.all([
          globalCountRes.json(),
          regionCountsRes.ok ? regionCountsRes.json() : { sidoCounts: {}, sigunguCounts: {} },
        ]);

        setGlobalTotalCount(globalCountData.totalCount || 0);
        setRegionCounts({
          sidoCounts: regionCountsData.sidoCounts || {},
          sigunguCounts: regionCountsData.sigunguCounts || {},
        });
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      }
    };

    fetchInitialData();
  }, []);

  // 쿠폰 설정 불러오기 (매장명)
  useEffect(() => {
    const fetchCouponSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/retarget-coupon/settings`, {
          headers: { Authorization: `Bearer ${getStoreToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCouponStoreName(data.storeName || '');
        }
      } catch (error) {
        console.error('Failed to fetch coupon settings:', error);
      }
    };
    fetchCouponSettings();
  }, []);

  // 결제 완료 후 잔액 갱신
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');

    if (paymentKey && orderId && amountParam) {
      const confirmPayment = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/payments/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getStoreToken()}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId,
              amount: parseInt(amountParam),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setWalletBalance(data.newBalance || 0);
            setSuccessMessage('충전이 완료되었습니다!');
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
        } finally {
          // URL 파라미터 제거
          router.replace('/local-customers');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router]);

  // Draft 저장/복원을 위한 localStorage 키
  const DRAFT_KEY = 'taghere-local-customers-draft';

  // Draft 복원 (페이지 로드 시)
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.content) setContent(draft.content);
        if (draft.activeTab) setActiveTab(draft.activeTab);
        if (draft.selectedSidos) setSelectedSidos(draft.selectedSidos);
        if (draft.selectedAgeGroups) setSelectedAgeGroups(draft.selectedAgeGroups);
        if (draft.gender) setGender(draft.gender);
        if (draft.couponContent) setCouponContent(draft.couponContent);
        if (draft.couponExpiryDate) setCouponExpiryDate(draft.couponExpiryDate);
      } catch (e) {
        console.error('Failed to restore draft:', e);
      }
    }
  }, []);

  // Draft 자동 저장 (debounce 500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = {
        content,
        activeTab,
        selectedSidos,
        selectedAgeGroups,
        gender,
        couponContent,
        couponExpiryDate,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 500);
    return () => clearTimeout(timer);
  }, [content, activeTab, selectedSidos, selectedAgeGroups, gender, couponContent, couponExpiryDate]);

  // Draft 삭제 함수
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  // 고객 수 조회
  const fetchCount = useCallback(async () => {
    if (selectedSidos.length === 0) {
      setTotalCount(0);
      setAvailableCount(0);
      setSendCount(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('regionSidos', selectedSidos.join(','));

      const sigunguList: string[] = [];
      Object.entries(selectedSigungus).forEach(([sido, sigungus]) => {
        if (sigungus && sigungus.length > 0) {
          sigungus.forEach(sigungu => sigunguList.push(`${sido}/${sigungu}`));
        }
      });
      if (sigunguList.length > 0) params.set('regionSigungus', sigunguList.join(','));
      if (selectedAgeGroups.length > 0) params.set('ageGroups', selectedAgeGroups.join(','));
      if (gender !== 'all') params.set('gender', gender);
      if (selectedCategories.length > 0) params.set('categories', selectedCategories.join(','));
      if (selectedPreferredCategories.length > 0) params.set('preferredCategories', selectedPreferredCategories.join(','));

      const res = await fetch(`${API_BASE}/api/local-customers/count?${params}`, {
        headers: { Authorization: `Bearer ${getStoreToken()}` },
      });
      const data = await res.json();

      setTotalCount(data.totalCount || 0);
      setAvailableCount(data.availableCount || 0);
      setSendCount(data.availableCount || 0);
    } catch (err) {
      console.error('Failed to fetch count:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSidos, selectedSigungus, selectedAgeGroups, gender, selectedCategories, selectedPreferredCategories]);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  // SMS 비용 예상 조회
  const fetchSmsEstimate = useCallback(async () => {
    if (activeTab !== 'sms') return;
    try {
      const res = await fetch(`${API_BASE}/api/local-customers/estimate?sendCount=${sendCount}`, {
        headers: { Authorization: `Bearer ${getStoreToken()}` },
      });
      const data = await res.json();
      setWalletBalance(data.walletBalance || 0);
    } catch (err) {
      console.error('Failed to fetch estimate:', err);
    }
  }, [sendCount, activeTab]);

  // 쿠폰 알림톡 비용 예상 조회
  const fetchKakaoEstimate = useCallback(async () => {
    if (activeTab !== 'kakao' || sendCount <= 0) {
      setKakaoEstimate(null);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/local-customers/estimate?sendCount=${sendCount}`,
        { headers: { Authorization: `Bearer ${getStoreToken()}` } }
      );
      const data = await res.json();
      setKakaoEstimate({
        costPerMessage: COUPON_ALIMTALK_COST,
        totalCost: sendCount * COUPON_ALIMTALK_COST,
        walletBalance: data.walletBalance || 0,
        canSend: (data.walletBalance || 0) >= sendCount * COUPON_ALIMTALK_COST,
      });
      setWalletBalance(data.walletBalance || 0);
    } catch (err) {
      console.error('Failed to fetch coupon estimate:', err);
    }
  }, [sendCount, activeTab]);

  useEffect(() => {
    if (activeTab === 'sms') fetchSmsEstimate();
    else fetchKakaoEstimate();
  }, [fetchSmsEstimate, fetchKakaoEstimate, activeTab]);

  // 시/도 추가/제거 (functional setState로 안정적인 콜백)
  const addSido = useCallback((sido: string) => {
    setSelectedSidos(prev => prev.includes(sido) ? prev : [...prev, sido]);
    setActiveSidoForSigungu(sido);
    setRegionSearchQuery('');
    setIsRegionDropdownOpen(false);
  }, []);

  const removeSido = useCallback((sido: string) => {
    setSelectedSidos(prev => {
      const next = prev.filter(s => s !== sido);
      // 삭제된 sido가 활성 탭이면 다른 탭으로 전환
      if (activeSidoForSigungu === sido) {
        setActiveSidoForSigungu(next.length > 0 ? next[0] : null);
      }
      return next;
    });
    // 해당 시도의 시군구 선택도 함께 제거
    setSelectedSigungus(prev => {
      const next = { ...prev };
      delete next[sido];
      return next;
    });
  }, [activeSidoForSigungu]);

  // 연령대 토글 (functional setState로 최적화)
  const toggleAgeGroup = useCallback((value: string) => {
    setSelectedAgeGroups(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }, []);

  // 검색어로 필터링된 시/도 목록
  const filteredSidos = regionSearchQuery.trim()
    ? KOREA_SIDOS.filter((sido) => sido.toLowerCase().includes(regionSearchQuery.toLowerCase()))
    : KOREA_SIDOS;

  // 발송 수량 초과 확인
  const isOverLimit = sendCount > availableCount && availableCount > 0;

  // 예상 비용 계산
  const getCostPerMessage = () => {
    if (activeTab === 'kakao') return COUPON_ALIMTALK_COST;
    return SMS_COST_PER_MESSAGE;
  };

  const estimatedCost = sendCount * getCostPerMessage();
  const canAfford = walletBalance >= estimatedCost;
  const canSendSms = selectedSidos.length > 0 && content.trim() && sendCount > 0 && sendCount <= availableCount && canAfford && !isSending;
  const canSendCoupon = selectedSidos.length > 0 && couponContent.trim() && couponExpiryDate.trim() && sendCount > 0 && sendCount <= availableCount && canAfford && !isCouponSending;
  const canSend = activeTab === 'sms' ? canSendSms : canSendCoupon;

  // SMS 메시지 발송
  const handleSmsSend = async () => {
    if (isOverLimit) {
      setError(`발송 가능한 고객이 ${availableCount.toLocaleString()}명입니다.`);
      setSendCount(availableCount);
      return;
    }
    if (!canSend) return;

    setIsSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const sigunguList: string[] = [];
      Object.entries(selectedSigungus).forEach(([sido, sigungus]) => {
        if (sigungus && sigungus.length > 0) sigungus.forEach(sigungu => sigunguList.push(`${sido}/${sigungu}`));
      });

      const res = await fetch(`${API_BASE}/api/local-customers/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoreToken()}` },
        body: JSON.stringify({
          content,
          ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : null,
          gender: gender !== 'all' ? gender : null,
          regionSidos: selectedSidos,
          regionSigungus: sigunguList.length > 0 ? sigunguList : null,
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          preferredCategories: selectedPreferredCategories.length > 0 ? selectedPreferredCategories : null,
          sendCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발송에 실패했습니다.');

      trackEvent('owner_localmkt_send', { type: 'sms', count: data.pendingCount });
      setSuccessMessage(`${data.pendingCount.toLocaleString()}건 발송 요청 완료! 결과는 발송 내역에서 확인하세요.`);
      setContent('');
      clearDraft();
      fetchCount();
      fetchSmsEstimate();
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // 쿠폰 알림톡 발송
  const handleCouponSend = async () => {
    if (isOverLimit) {
      setError(`발송 가능한 고객이 ${availableCount.toLocaleString()}명입니다.`);
      setSendCount(availableCount);
      return;
    }
    if (!canSend) return;

    setIsCouponSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 지역 필터 구성
      const regions = selectedSidos.map(sido => {
        const sigungus = selectedSigungus[sido];
        if (sigungus && sigungus.length > 0) {
          return sigungus.map(sigungu => ({ sido, sigungu }));
        }
        return [{ sido }];
      }).flat();

      const res = await fetch(`${API_BASE}/api/local-customers/coupon-alimtalk/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoreToken()}` },
        body: JSON.stringify({
          regions,
          sendCount,
          couponContent: couponContent.trim(),
          expiryDate: couponExpiryDate.trim(),
          ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : [],
          gender: gender !== 'all' ? gender : 'all',
          categories: selectedCategories.length > 0 ? selectedCategories : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발송에 실패했습니다.');

      trackEvent('owner_localmkt_send', { type: 'coupon', count: data.sentCount });
      setSuccessMessage(`${data.sentCount.toLocaleString()}건 쿠폰 알림톡 발송 요청 완료!`);
      setCouponContent('');
      setCouponExpiryDate('');
      clearDraft();
      fetchCount();
      fetchKakaoEstimate();
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsCouponSending(false);
    }
  };

  const handleSend = () => { activeTab === 'sms' ? handleSmsSend() : handleCouponSend(); };

  // 테스트 발송
  const handleTestSend = async () => {
    if (!testPhone || !content.trim()) {
      setError('테스트 전화번호와 메시지 내용을 입력해주세요.');
      return;
    }
    setIsTestSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/local-customers/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoreToken()}` },
        body: JSON.stringify({ content, phone: testPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '테스트 발송에 실패했습니다.');
      setSuccessMessage('테스트 메시지가 발송되었습니다.');
    } catch (err: any) {
      setError(err.message || '테스트 발송 중 오류가 발생했습니다.');
    } finally {
      setIsTestSending(false);
    }
  };

  // 바이트 길이 계산
  const getByteLength = (str: string): number => {
    let byteLength = 0;
    for (let i = 0; i < str.length; i++) {
      byteLength += str.charCodeAt(i) > 127 ? 2 : 1;
    }
    return byteLength;
  };

  const byteLength = getByteLength(content);
  const smsMessageType = byteLength > 90 ? 'LMS' : 'SMS';


  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:items-start gap-6 mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8 lg:justify-center">
      {/* Left Panel - Settings */}
      <div className="ad-card flex-1 lg:max-w-[720px] p-5 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[color:var(--ad-line)]">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">신규 고객 유치</h1>
            <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">NEW</span>
          </div>
          <div className="flex rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px] self-start sm:self-auto">
            <button onClick={() => setActiveTab('kakao')} className={cn('px-3 sm:px-4 h-8 text-[12.5px] sm:text-[13px] font-semibold rounded-[8px] transition-all', activeTab === 'kakao' ? 'bg-white shadow-sm text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]')}>쿠폰 알림톡</button>
            <button onClick={() => setActiveTab('sms')} className={cn('px-3 sm:px-4 h-8 text-[12.5px] sm:text-[13px] font-semibold rounded-[8px] transition-all', activeTab === 'sms' ? 'bg-white shadow-sm text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]')}>문자 (SMS/LMS)</button>
          </div>
        </div>

        {/* 안내 콜아웃 */}
        <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[color:var(--ad-faint)] flex-shrink-0 mt-0.5" strokeWidth={1.8} />
          <p className="leading-relaxed">문자를 받으시는 고객분들은 전국 태그히어 이용 고객 중 매장의 이벤트와 혜택을 주기적으로 받기 희망하신 분들입니다.</p>
        </div>

        {/* 에러/성공 메시지 */}
        {error && <div className="px-4 py-3 rounded-[12px] bg-[#fff2f5] flex items-center gap-2 text-[13px] text-[color:var(--ad-neg)]"><AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} /><span>{error}</span></div>}
        {successMessage && <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)] text-[color:var(--ad-ink-2)]">{successMessage}</div>}

        {/* 발송 대상 선택 */}
        <div>
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">발송 대상 선택</h2>
          <div className="grid grid-cols-3 rounded-[14px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line)] overflow-hidden">
            <div className="p-4"><p className="text-[12px] text-[color:var(--ad-muted)]">전체 고객</p><p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{globalTotalCount.toLocaleString()}명</p></div>
            <div className={cn('p-4 border-l border-[color:var(--ad-line)] transition-all', selectedSidos.length > 0 ? 'bg-[color:var(--ad-bg)]' : 'bg-white')}><p className="text-[12px] text-[color:var(--ad-muted)]">선택 지역</p><p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{isLoading ? '...' : availableCount.toLocaleString()}명</p></div>
            <div className="p-4 border-l border-[color:var(--ad-line)]"><p className="text-[12px] text-[color:var(--ad-muted)]">발송 예정</p><p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{sendCount.toLocaleString()}명</p></div>
          </div>
        </div>

        {/* 지역 선택 */}
        <div>
          <div className="p-4 rounded-[14px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line)]">
            <div className="flex items-center gap-3 mb-3">
              <MapPin className="w-4 h-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="flex-1"><p className="text-[14px] font-semibold text-[color:var(--ad-ink)]">지역 선택</p><p className="text-[12px] text-[color:var(--ad-faint)]">여러 지역을 선택할 수 있습니다</p></div>
            </div>

            {selectedSidos.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="flex flex-wrap gap-2">
                  {selectedSidos.map((sido) => (
                    <span key={sido} className="inline-flex items-center gap-1 px-3 py-1.5 bg-[color:var(--ad-bg)] text-[color:var(--ad-ink)] rounded-full text-[13px] font-medium">
                      {sido}
                      {(selectedSigungus[sido]?.length || 0) > 0 && (
                        <span className="text-[11.5px] text-[color:var(--ad-faint)]">({selectedSigungus[sido].length})</span>
                      )}
                      <button onClick={() => removeSido(sido)} className="hover:bg-[color:var(--ad-line)] rounded-full p-0.5 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ))}
                </div>

                {/* 시/군/구 상세 선택 */}
                <div className="border border-[color:var(--ad-line)] rounded-[12px] overflow-hidden">
                  <div className="flex overflow-x-auto bg-[color:var(--ad-bg-alt)] border-b border-[color:var(--ad-line)]">
                    {selectedSidos.map((sido) => (
                      <button
                        key={sido}
                        onClick={() => setActiveSidoForSigungu(activeSidoForSigungu === sido ? null : sido)}
                        className={cn(
                          'px-3 py-2 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors',
                          activeSidoForSigungu === sido
                            ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)] bg-white'
                            : 'border-transparent text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
                        )}
                      >
                        {sido}
                        {(selectedSigungus[sido]?.length || 0) > 0 && (
                          <span className="ml-1 text-[color:var(--ad-muted)]">{selectedSigungus[sido].length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {activeSidoForSigungu && regionCounts.sigunguCounts[activeSidoForSigungu] && (
                    <div className="p-3">
                      <div className="mb-2">
                        <input
                          type="text"
                          value={sigunguSearchQuery}
                          onChange={(e) => setSigunguSearchQuery(e.target.value)}
                          placeholder={`${activeSidoForSigungu} 시/군/구 검색...`}
                          className="w-full h-8 px-3 rounded-[8px] border border-[color:var(--ad-line-strong)] text-[12.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {Object.entries(regionCounts.sigunguCounts[activeSidoForSigungu])
                          .filter(([sigungu]) => !sigunguSearchQuery || sigungu.includes(sigunguSearchQuery))
                          .sort((a, b) => b[1] - a[1])
                          .map(([sigungu, count]) => {
                            const isSelected = selectedSigungus[activeSidoForSigungu]?.includes(sigungu);
                            return (
                              <button
                                key={sigungu}
                                onClick={() => {
                                  setSelectedSigungus(prev => {
                                    const current = prev[activeSidoForSigungu!] || [];
                                    if (isSelected) {
                                      return { ...prev, [activeSidoForSigungu!]: current.filter(s => s !== sigungu) };
                                    } else {
                                      return { ...prev, [activeSidoForSigungu!]: [...current, sigungu] };
                                    }
                                  });
                                }}
                                className={cn(
                                  'px-2.5 py-1 rounded-[8px] text-[12px] font-medium transition-colors',
                                  isSelected
                                    ? 'bg-[color:var(--ad-ink)] text-white'
                                    : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-line)]'
                                )}
                              >
                                {sigungu} <span className={cn('text-[10px]', isSelected ? 'text-white/60' : 'text-[color:var(--ad-faint)]')}>{count.toLocaleString()}</span>
                              </button>
                            );
                          })}
                      </div>
                      {(selectedSigungus[activeSidoForSigungu]?.length || 0) > 0 && (
                        <p className="text-[11px] text-[color:var(--ad-faint)] mt-2">
                          * 미선택 시 {activeSidoForSigungu} 전체에 발송됩니다
                        </p>
                      )}
                      {(selectedSigungus[activeSidoForSigungu]?.length || 0) === 0 && (
                        <p className="text-[11px] text-[color:var(--ad-faint)] mt-2">
                          * 상세 지역 미선택 시 {activeSidoForSigungu} 전체에 발송됩니다
                        </p>
                      )}
                    </div>
                  )}

                  {activeSidoForSigungu && !regionCounts.sigunguCounts[activeSidoForSigungu] && (
                    <div className="p-3 text-[12px] text-[color:var(--ad-faint)] text-center">상세 지역 데이터가 없습니다</div>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
                <input type="text" value={regionSearchQuery} onChange={(e) => { setRegionSearchQuery(e.target.value); setIsRegionDropdownOpen(true); }} onFocus={() => setIsRegionDropdownOpen(true)} placeholder="지역 검색 (예: 서울, 경기, 부산...)" className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none" />
              </div>

              {isRegionDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(29,32,34,0.22)] max-h-72 overflow-y-auto">
                  {filteredSidos.length > 0 && selectedSidos.length < KOREA_SIDOS.length && (
                    <button onClick={() => { setSelectedSidos(KOREA_SIDOS); setIsRegionDropdownOpen(false); setRegionSearchQuery(''); }} className="w-full px-4 py-2.5 text-left text-[13px] flex items-center justify-between transition-colors bg-white hover:bg-[color:var(--ad-bg-alt)] text-[color:var(--ad-ink)] border-b border-[color:var(--ad-line)]">
                      <span className="font-semibold">전체 선택</span>
                      <span className="text-[12px] text-[color:var(--ad-muted)] ad-tnum">+{globalTotalCount.toLocaleString()}명</span>
                    </button>
                  )}
                  {filteredSidos.length > 0 ? filteredSidos.map((sido) => {
                    const isSelected = selectedSidos.includes(sido);
                    const count = regionCounts.sidoCounts[sido] || 0;
                    return (
                      <button key={sido} onClick={() => !isSelected && addSido(sido)} disabled={isSelected} className={cn("w-full px-4 py-2.5 text-left text-[13px] flex items-center justify-between transition-colors", isSelected ? "bg-[color:var(--ad-bg-alt)] text-[color:var(--ad-faint)]" : "hover:bg-[color:var(--ad-bg-alt)] text-[color:var(--ad-ink-2)]")}>
                        <span className="font-medium">{sido}</span>
                        <div className="flex items-center gap-2">
                          {count > 0 && !isSelected && <span className="text-[12px] text-[color:var(--ad-muted)] ad-tnum">+{count.toLocaleString()}명</span>}
                          {isSelected ? <span className="text-[12px] text-[color:var(--ad-faint)]">선택됨</span> : <Plus className="w-4 h-4 text-[color:var(--ad-faint)]" />}
                        </div>
                      </button>
                    );
                  }) : <div className="px-4 py-3 text-[13px] text-[color:var(--ad-faint)]">검색 결과가 없습니다</div>}
                </div>
              )}
            </div>
            {isRegionDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsRegionDropdownOpen(false)} />}
          </div>
        </div>

        {/* 상세 필터 */}
        <div>
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">상세 필터</h2>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => (<button key={option.value} onClick={() => setGender(option.value)} className={cn('ad-press px-3.5 h-9 rounded-full text-[13px] font-medium transition-colors border', gender === option.value ? 'bg-[color:var(--ad-ink)] text-white border-[color:var(--ad-ink)]' : 'bg-white text-[color:var(--ad-ink-2)] border-[color:var(--ad-line-strong)] hover:border-[color:var(--ad-ink)]')}>{option.label}</button>))}
            <div className="w-px h-8 bg-[color:var(--ad-line-strong)] mx-1" />
            {AGE_GROUP_OPTIONS.map((option) => (<button key={option.value} onClick={() => toggleAgeGroup(option.value)} className={cn('ad-press px-3.5 h-9 rounded-full text-[13px] font-medium transition-colors border', selectedAgeGroups.includes(option.value) ? 'bg-[color:var(--ad-ink)] text-white border-[color:var(--ad-ink)]' : 'bg-white text-[color:var(--ad-ink-2)] border-[color:var(--ad-line-strong)] hover:border-[color:var(--ad-ink)]')}>{option.label}</button>))}
          </div>
          {selectedAgeGroups.length === 0 && <p className="text-[12px] text-[color:var(--ad-muted)] mt-2">연령대 미선택 시 전체 연령대로 발송됩니다</p>}
        </div>

        {/* 발송 인원 수 */}
        <div>
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">발송 인원 수</h2>
          <div className="flex items-center gap-3">
            <input type="number" min={0} max={availableCount || 10000} value={sendCount} onChange={(e) => setSendCount(Math.max(0, parseInt(e.target.value) || 0))} className={cn('w-32 h-10 border rounded-[10px] px-3 text-right text-[13.5px] ad-tnum focus:outline-none focus:border-[color:var(--ad-navy)]', isOverLimit ? 'border-[color:var(--ad-neg)] bg-[#fff2f5]' : 'border-[color:var(--ad-line-strong)]')} />
            <span className="text-[13px] text-[color:var(--ad-muted)]">명</span>
            {isOverLimit && <span className="text-[12.5px] text-[color:var(--ad-neg)] flex items-center gap-1"><AlertCircle className="w-4 h-4" strokeWidth={1.8} />발송 가능 인원 초과</span>}
          </div>
          {availableCount > 0 && <p className="text-[12px] text-[color:var(--ad-muted)] mt-2">최대 발송 가능: {availableCount.toLocaleString()}명</p>}
        </div>

        {/* 쿠폰 알림톡 전용: 쿠폰 정보 입력 */}
        {activeTab === 'kakao' && (
          <div className="flex flex-col gap-4">
            <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">쿠폰 정보</label>

            {/* 쿠폰 내용 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">쿠폰 내용</label>
              <input
                type="text"
                value={couponContent}
                onChange={(e) => setCouponContent(e.target.value)}
                placeholder="예: 아메리카노 1잔 무료"
                className="w-full h-10 px-3 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
              />
            </div>

            {/* 유효기간 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">유효기간</label>
              <input
                type="text"
                value={couponExpiryDate}
                onChange={(e) => setCouponExpiryDate(e.target.value)}
                placeholder="예: 2025년 3월 31일까지"
                className="w-full h-10 px-3 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
              />
            </div>

            <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[color:var(--ad-faint)] flex-shrink-0 mt-0.5" strokeWidth={1.8} />
              <p>카카오톡 알림톡으로 쿠폰이 발송됩니다. 건당 150원이 차감됩니다.</p>
            </div>
          </div>
        )}

        {/* 메시지 내용 입력 (SMS만) */}
        {activeTab === 'sms' && (
          <div>
            <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-3">메시지 내용 입력 <span className="text-[color:var(--ad-faint)] font-normal">(단문/장문 자동 전환)</span></h2>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={`[태그히어] 4월 봄맞이 이벤트 안내\n\n안녕하세요!\n따뜻한 봄을 맞아 태그히어 강남본점에서 특별한 혜택을 준비했습니다.\n\n[이벤트 혜택]\n- 첫 방문 고객 10% 할인\n- 2인 이상 방문 시 음료 무료\n\n기간: 4/1 ~ 4/30\n\n많은 관심 부탁드립니다!`} rows={8} className="w-full px-3 py-2.5 text-[color:var(--ad-ink)] leading-relaxed rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-none" />
            <div className="flex justify-between text-[12px] text-[color:var(--ad-muted)] ad-tnum mt-2">
              <span>{smsMessageType} ({byteLength}byte)</span><span>{content.length}자</span>
            </div>
          </div>
        )}

        {/* SMS 전용: 이미지 첨부 안내 */}
        {activeTab === 'sms' && <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]"><div className="flex items-center gap-2.5"><Info className="w-4 h-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} /><span>외부 고객 SMS는 텍스트만 발송 가능합니다. (이미지 첨부 불가)</span></div></div>}

        {/* 비용 요약 및 발송 버튼 */}
        <div className="border-t border-[color:var(--ad-line)] pt-5 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-[12px] text-[color:var(--ad-muted)]">예상 비용</p><p className="mt-1 text-[18px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{sendCount.toLocaleString()}명 × {getCostPerMessage()}원 = <span className="font-semibold text-[color:var(--ad-ink)]">{estimatedCost.toLocaleString()}원</span></p></div>
            <div className="text-right">
              <p className="text-[12px] text-[color:var(--ad-muted)]">현재 잔액</p>
              <p className={cn('mt-1 text-[18px] font-medium tracking-[-0.03em] ad-tnum', canAfford ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-neg)]')}>{walletBalance.toLocaleString()}원</p>
              {!canAfford && estimatedCost > 0 && (
                <button
                  onClick={() => setIsChargeModalOpen(true)}
                  className="mt-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline flex items-center gap-1 ml-auto"
                >
                  <Wallet className="w-4 h-4" />
                  충전하기
                </button>
              )}
            </div>
          </div>

          {/* 예상 마케팅 효과 - 시각적으로 강조된 ROI 카드 */}
          {sendCount > 0 && (() => {
            const conversionRate = activeTab === 'kakao' ? 0.034 : 0.027;
            const estimatedVisitors = Math.round(sendCount * conversionRate);
            const avgOrderValue = kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000;
            const estimatedRevenue = estimatedVisitors * avgOrderValue;
            const roi = estimatedCost > 0 ? Math.round((estimatedRevenue / estimatedCost) * 100) : 0;

            return (
              <div className="mb-4 rounded-[14px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line)] p-5">
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  예상 마케팅 효과
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3">
                  <div className="px-3 py-1">
                    <p className="text-[12px] text-[color:var(--ad-muted)] mb-1">예상 방문율</p>
                    <p className="text-[18px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{(conversionRate * 100).toFixed(1)}%</p>
                  </div>
                  <div className="px-3 py-1 border-l border-[color:var(--ad-line)]">
                    <p className="text-[12px] text-[color:var(--ad-muted)] mb-1">예상 방문</p>
                    <p className="text-[18px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{estimatedVisitors.toLocaleString()}명</p>
                  </div>
                  <div className="px-3 py-1 sm:border-l border-[color:var(--ad-line)]">
                    <p className="text-[12px] text-[color:var(--ad-muted)] mb-1">예상 매출</p>
                    <p className="text-[18px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{estimatedRevenue.toLocaleString()}원</p>
                  </div>
                  <div className="px-3 py-1 sm:border-l border-[color:var(--ad-line)]">
                    <p className="text-[12px] text-[color:var(--ad-muted)] mb-1">예상 ROI</p>
                    <p className="text-[18px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{roi.toLocaleString()}%</p>
                  </div>
                </div>

                <p className="text-[11.5px] text-[color:var(--ad-faint)] mt-4">
                  * 업계 평균 방문율 {(conversionRate * 100).toFixed(1)}% 및 {activeTab === 'kakao' ? '매장 평균' : '기본'} 객단가 {avgOrderValue.toLocaleString()}원 기준
                </p>
              </div>
            );
          })()}

          {/* 테스트 발송 (SMS만) */}
          {activeTab === 'sms' && (
            <div className="mb-4 p-4 bg-[color:var(--ad-bg-alt)] rounded-[12px]">
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">테스트 발송 (선택)</label>
              <div className="flex gap-2">
                <input type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="010-1234-5678" className="flex-1 h-10 px-3 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none" />
                <button onClick={handleTestSend} disabled={isTestSending || !content.trim() || !testPhone} className="ad-press inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] h-10 disabled:opacity-50 disabled:cursor-not-allowed">{isTestSending ? '발송 중...' : '테스트 발송'}</button>
              </div>
            </div>
          )}

          <button onClick={handleSend} disabled={!canSend} className={cn('ad-press w-full h-12 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors', canSend ? 'bg-[color:var(--ad-ink)] text-white hover:bg-[#383c40]' : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)] cursor-not-allowed')}><Send className="w-4 h-4" />{(isSending || isCouponSending) ? '발송 중...' : '발송하기'}</button>
        </div>
      </div>

      {/* Right Panel - iPhone Preview */}
      <div className="hidden lg:block flex-none w-[360px] self-start">
        <div className="rounded-[24px] bg-[color:var(--ad-bg)] p-5 flex justify-center">
          {activeTab === 'kakao' ? (
            <IPhoneFrame screenClassName="bg-[#B2C7D9]" className="w-full max-w-[320px]">
                  <div className="flex items-center justify-between px-4 pt-1 pb-2"><ChevronLeft className="w-4 h-4 text-neutral-700" /><span className="font-medium text-xs text-neutral-800">카카오톡</span><Menu className="w-4 h-4 text-neutral-700" /></div>
                  <div className="flex justify-center mb-3"><span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                  <div className="flex-1 pl-2 pr-4 overflow-auto">
                    <div className="flex gap-1.5">
                      <div className="flex-shrink-0"><div className="w-7 h-7 rounded-full bg-neutral-300" /></div>
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-[10px] text-neutral-600 mb-0.5">태그히어</p>
                        <div className="relative">
                          <div className="absolute -top-1 -right-1 z-10"><span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">kakao</span></div>
                          {/* 알림톡 도착 배너 */}
                          <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                            <span className="text-xs font-medium text-neutral-800">알림톡 도착</span>
                          </div>
                          <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                            <img src="/images/coupon_kakao.png" alt="쿠폰 이미지" className="w-full h-auto" />
                            <div className="px-4 py-4">
                              <p className="text-xs font-semibold text-neutral-800 mb-4">태그히어 고객 대상 쿠폰</p>
                              <div className="space-y-1 text-xs text-neutral-700">
                                <p>
                                  <span className="text-[#6BA3FF]">{couponStoreName || '매장명'}</span>에서 쿠폰을 보냈어요!
                                </p>
                                <p className="text-neutral-500 mb-4">
                                  태그히어 이용 고객에게만 제공되는 쿠폰이에요.
                                </p>
                                <div className="space-y-1 mb-4">
                                  <p>📌 {couponContent || '쿠폰 내용을 입력해주세요'}</p>
                                  <p>📌 {couponExpiryDate || '유효기간을 입력해주세요'}</p>
                                </div>
                                <p className="text-neutral-500">
                                  결제 시 직원 확인을 통해 사용할 수 있어요.
                                </p>
                              </div>
                            </div>
                            <div className="px-4 pb-4 space-y-2">
                              <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">네이버 길찾기</button>
                              <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">직원 확인</button>
                            </div>
                          </div>
                        </div>
                        <p className="text-[8px] text-neutral-500 mt-0.5 text-right">오후 12:30</p>
                      </div>
                    </div>
                  </div>
                  <div className="h-6" />
            </IPhoneFrame>
          ) : (
            <IPhoneFrame screenClassName="bg-white" className="w-full max-w-[320px]">
              <div className="h-[60px] bg-white flex items-center justify-between px-4 border-b border-[#e5e7eb]">
                <ChevronLeft className="w-6 h-6 text-[#007aff]" />
                <div className="flex flex-col items-center"><div className="w-10 h-10 rounded-full bg-[#e5e7eb] flex items-center justify-center"><Users className="w-5 h-5 text-[#9ca3af]" /></div><span className="text-[13px] font-semibold text-[#1e293b] mt-1">태그히어 CRM</span></div>
                <div className="w-6" />
              </div>
              <div className="flex-1 bg-white px-4 py-3 flex flex-col overflow-y-auto">
                <div className="text-center text-[12px] text-[#8e8e93] font-medium mb-4">문자 메시지<br />오늘 오후 12:30</div>
                <div className="flex justify-start"><div className="py-3 px-4 rounded-[20px] rounded-bl-[6px] max-w-[85%] text-[15px] leading-[1.5] bg-[#e5e5ea] text-[#1e293b]">{content ? <span className="whitespace-pre-wrap break-words">{content}</span> : <span className="text-[#94a3b8]">메시지 미리보기</span>}</div></div>
              </div>
              <div className="py-3 px-4 bg-white border-t border-[#e5e7eb] flex items-center gap-3">
                <Camera className="w-6 h-6 text-[#007aff]" /><span className="text-[17px] font-bold text-[#007aff]">A</span>
                <div className="flex-1 h-9 bg-[#f1f5f9] rounded-full px-4 flex items-center"><span className="text-[#94a3b8] text-[15px]">iMessage</span></div>
                <div className="w-8 h-8 bg-[#007aff] rounded-full flex items-center justify-center"><ChevronUp className="w-5 h-5 text-white" /></div>
              </div>
              <div className="h-8 bg-white flex items-center justify-center"><div className="w-32 h-1 bg-[#1e293b] rounded-full" /></div>
            </IPhoneFrame>
          )}
        </div>
      </div>

      {/* 충전 모달 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onSuccess={(newBalance) => {
          setWalletBalance(newBalance);
          setIsChargeModalOpen(false);
        }}
        currentBalance={walletBalance}
        requiredAmount={estimatedCost}
        successRedirectPath="/local-customers"
      />
    </div>
  );
}
