'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Users,
  Send,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Wifi,
  Camera,
  BatteryFull,
  X,
  Search,
  Plus,
  Store,
  Clock,
  TrendingUp,
  ImagePlus,
  Link,
  Trash2,
  Menu,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 대한민국 17개 시/도 목록
const KOREA_SIDOS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];

// 연령대 옵션
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

// 성별 옵션
const GENDER_OPTIONS = [
  { value: 'all', label: '전체 성별' },
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
];

// 업종 카테고리 (플랫 리스트)
const CATEGORY_OPTIONS = [
  { value: 'KOREAN', label: '한식' },
  { value: 'CHINESE', label: '중식' },
  { value: 'JAPANESE', label: '일식' },
  { value: 'WESTERN', label: '양식' },
  { value: 'ASIAN', label: '아시안' },
  { value: 'MEAT', label: '고기/구이' },
  { value: 'SEAFOOD', label: '해산물' },
  { value: 'CAFE', label: '카페' },
  { value: 'BAKERY', label: '베이커리' },
  { value: 'DESSERT', label: '디저트' },
  { value: 'BEER', label: '호프/맥주' },
  { value: 'IZAKAYA', label: '이자카야' },
  { value: 'WINE_BAR', label: '와인바' },
  { value: 'POCHA', label: '포차' },
];

// 비용 상수
const SMS_COST_PER_MESSAGE = 150;
const KAKAO_TEXT_COST = 200;
const KAKAO_IMAGE_COST = 200;

// 인증 토큰 가져오기
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token') || '';
  }
  return '';
};

// 카카오톡 버튼 타입
interface KakaoButton {
  type: 'WL';
  name: string;
  linkMo: string;
  linkPc?: string;
}

// 예상 매출 타입
interface EstimatedRevenue {
  avgOrderValue: number;
  conversionRate: number;
}

export default function LocalCustomersPage() {
  // 탭 상태 (문자 우선 - 카카오톡 임시 비활성화)
  const [activeTab, setActiveTab] = useState<'kakao' | 'sms'>('sms');

  // 지역 상태 (시/도만 선택)
  const [selectedSidos, setSelectedSidos] = useState<string[]>([]);
  const [regionSearchQuery, setRegionSearchQuery] = useState('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);

  // 필터 상태
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [gender, setGender] = useState<string>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // 발송 대상 상태
  const [globalTotalCount, setGlobalTotalCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);
  const [sendCount, setSendCount] = useState(0);

  // 메시지 상태 (공통)
  const [content, setContent] = useState('');

  // 카카오톡 전용 상태
  const [kakaoMessageType, setKakaoMessageType] = useState<'TEXT' | 'IMAGE'>('TEXT');
  const [kakaoImageId, setKakaoImageId] = useState<string | null>(null);
  const [kakaoImageUrl, setKakaoImageUrl] = useState<string | null>(null);
  const [kakaoUploadedImage, setKakaoUploadedImage] = useState<{ imageId: string; imageUrl: string; filename: string } | null>(null);
  const [isKakaoUploading, setIsKakaoUploading] = useState(false);
  const [kakaoImageError, setKakaoImageError] = useState<string | null>(null);
  const [kakaoButtons, setKakaoButtons] = useState<KakaoButton[]>([{ type: 'WL', name: '', linkMo: '' }]);
  const [isSendableTime, setIsSendableTime] = useState(true);
  const [nextSendableTime, setNextSendableTime] = useState<Date | null>(null);
  const [kakaoEstimate, setKakaoEstimate] = useState<{
    costPerMessage: number;
    totalCost: number;
    walletBalance: number;
    canSend: boolean;
    estimatedRevenue?: EstimatedRevenue;
  } | null>(null);

  // 지갑 상태
  const [walletBalance, setWalletBalance] = useState(0);

  // UI 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 테스트 발송 상태
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);

  // 전체 고객 수 로드
  useEffect(() => {
    const fetchGlobalCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/local-customers/total-count`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });
        const data = await res.json();
        setGlobalTotalCount(data.totalCount || 0);
      } catch (err) {
        console.error('Failed to fetch global count:', err);
      }
    };
    fetchGlobalCount();
  }, []);


  // 카카오톡 발송 가능 시간 체크
  useEffect(() => {
    const checkSendableTime = async () => {
      if (activeTab !== 'kakao') return;
      try {
        const res = await fetch(`${API_BASE}/api/local-customers/kakao/send-available`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });
        const data = await res.json();
        setIsSendableTime(data.canSend);
        setNextSendableTime(data.nextAvailable ? new Date(data.nextAvailable) : null);
      } catch (err) {
        console.error('Failed to check sendable time:', err);
      }
    };
    checkSendableTime();
    const interval = setInterval(checkSendableTime, 60000);
    return () => clearInterval(interval);
  }, [activeTab]);

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

      // 시/도 목록을 콤마로 구분하여 전달
      params.set('regionSidos', selectedSidos.join(','));

      if (selectedAgeGroups.length > 0) {
        params.set('ageGroups', selectedAgeGroups.join(','));
      }
      if (gender !== 'all') {
        params.set('gender', gender);
      }
      if (selectedCategories.length > 0) {
        params.set('categories', selectedCategories.join(','));
      }

      const res = await fetch(`${API_BASE}/api/local-customers/count?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();

      setTotalCount(data.totalCount || 0);
      setAvailableCount(data.availableCount || 0);
      // 발송 인원수를 발송 가능 인원수로 자동 설정
      setSendCount(data.availableCount || 0);
    } catch (err) {
      console.error('Failed to fetch count:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSidos, selectedAgeGroups, gender, selectedCategories]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // SMS 비용 예상 조회
  const fetchSmsEstimate = useCallback(async () => {
    if (activeTab !== 'sms') return;
    try {
      const res = await fetch(`${API_BASE}/api/local-customers/estimate?sendCount=${sendCount}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();
      setWalletBalance(data.walletBalance || 0);
    } catch (err) {
      console.error('Failed to fetch estimate:', err);
    }
  }, [sendCount, activeTab]);

  // 카카오톡 비용 예상 조회
  const fetchKakaoEstimate = useCallback(async () => {
    if (activeTab !== 'kakao' || sendCount <= 0) {
      setKakaoEstimate(null);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/local-customers/kakao/estimate?sendCount=${sendCount}&messageType=${kakaoMessageType}`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      const data = await res.json();
      setKakaoEstimate(data);
      setWalletBalance(data.walletBalance || 0);
    } catch (err) {
      console.error('Failed to fetch kakao estimate:', err);
    }
  }, [sendCount, activeTab, kakaoMessageType]);

  useEffect(() => {
    if (activeTab === 'sms') {
      fetchSmsEstimate();
    } else {
      fetchKakaoEstimate();
    }
  }, [fetchSmsEstimate, fetchKakaoEstimate, activeTab]);

  // 시/도 추가
  const addSido = (sido: string) => {
    if (!selectedSidos.includes(sido)) {
      setSelectedSidos([...selectedSidos, sido]);
    }
    setRegionSearchQuery('');
    setIsRegionDropdownOpen(false);
  };

  // 시/도 제거
  const removeSido = (sido: string) => {
    setSelectedSidos(selectedSidos.filter((s) => s !== sido));
  };

  // 연령대 토글
  const toggleAgeGroup = (value: string) => {
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 업종 토글
  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 검색어로 필터링된 시/도 목록
  const filteredSidos = regionSearchQuery.trim()
    ? KOREA_SIDOS.filter((sido) => sido.toLowerCase().includes(regionSearchQuery.toLowerCase()))
    : KOREA_SIDOS;

  // 발송 수량 초과 확인
  const isOverLimit = sendCount > availableCount && availableCount > 0;

  // 예상 비용 계산
  const getCostPerMessage = () => {
    if (activeTab === 'kakao') {
      return kakaoMessageType === 'IMAGE' ? KAKAO_IMAGE_COST : KAKAO_TEXT_COST;
    }
    return SMS_COST_PER_MESSAGE;
  };

  const estimatedCost = sendCount * getCostPerMessage();
  const canAfford = walletBalance >= estimatedCost;

  // 발송 가능 여부
  const canSend =
    selectedSidos.length > 0 &&
    content.trim() &&
    sendCount > 0 &&
    sendCount <= availableCount &&
    canAfford &&
    !isSending;

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
      const res = await fetch(`${API_BASE}/api/local-customers/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          content,
          ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : null,
          gender: gender !== 'all' ? gender : null,
          regionSidos: selectedSidos,
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          sendCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '발송에 실패했습니다.');
      }

      setSuccessMessage(
        `${data.pendingCount.toLocaleString()}건 발송 요청 완료! 결과는 발송 내역에서 확인하세요.`
      );
      setContent('');
      fetchCount();
      fetchSmsEstimate();
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // 카카오톡 메시지 발송
  const handleKakaoSend = async () => {
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
      const res = await fetch(`${API_BASE}/api/local-customers/kakao/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          content,
          messageType: kakaoMessageType,
          ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : null,
          gender: gender !== 'all' ? gender : null,
          regionSidos: selectedSidos,
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          sendCount,
          imageId: kakaoImageId,
          buttons: kakaoButtons.length > 0 ? kakaoButtons : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '발송에 실패했습니다.');
      }

      setSuccessMessage(
        `${data.pendingCount.toLocaleString()}건 발송 요청 완료! 결과는 발송 내역에서 확인하세요.`
      );
      setContent('');
      setKakaoButtons([]);
      fetchCount();
      fetchKakaoEstimate();
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // 발송 핸들러
  const handleSend = () => {
    if (activeTab === 'sms') {
      handleSmsSend();
    } else {
      handleKakaoSend();
    }
  };

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ content, phone: testPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '테스트 발송에 실패했습니다.');
      }

      setSuccessMessage('테스트 메시지가 발송되었습니다.');
    } catch (err: any) {
      setError(err.message || '테스트 발송 중 오류가 발생했습니다.');
    } finally {
      setIsTestSending(false);
    }
  };

  // 바이트 길이 계산 (SMS용)
  const getByteLength = (str: string): number => {
    let byteLength = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode > 127) {
        byteLength += 2;
      } else {
        byteLength += 1;
      }
    }
    return byteLength;
  };

  const byteLength = getByteLength(content);
  const smsMessageType = byteLength > 90 ? 'LMS' : 'SMS';

  // 카카오톡 이미지 업로드
  const handleKakaoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKakaoImageError(null);

    // 파일 형식 검증
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['jpg', 'jpeg', 'png'].includes(ext || '')) {
      setKakaoImageError('JPG 또는 PNG 파일만 업로드 가능합니다.');
      return;
    }

    // 용량 검증 (500KB)
    if (file.size > 500 * 1024) {
      setKakaoImageError(`이미지 용량이 너무 큽니다. (최대 500KB, 현재 ${Math.round(file.size / 1024)}KB)`);
      return;
    }

    setIsKakaoUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_BASE}/api/brand-message/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setKakaoUploadedImage(data);
        setKakaoMessageType('IMAGE');
      } else {
        setKakaoImageError(data.error || '이미지 업로드에 실패했습니다.');
      }
    } catch (err) {
      setKakaoImageError('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsKakaoUploading(false);
    }
  };

  // 카카오톡 이미지 삭제
  const handleKakaoImageDelete = () => {
    setKakaoUploadedImage(null);
    setKakaoMessageType('TEXT');
  };

  // 카카오톡 버튼 추가
  const addKakaoButton = () => {
    if (kakaoButtons.length >= 5) return;
    setKakaoButtons([...kakaoButtons, { type: 'WL', name: '', linkMo: '' }]);
  };

  // 카카오톡 버튼 업데이트
  const updateKakaoButton = (index: number, field: keyof KakaoButton, value: string) => {
    const newButtons = [...kakaoButtons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    setKakaoButtons(newButtons);
  };

  // 카카오톡 버튼 삭제
  const removeKakaoButton = (index: number) => {
    setKakaoButtons(kakaoButtons.filter((_, i) => i !== index));
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 gap-6 max-w-[1200px] mx-auto w-full lg:justify-center lg:items-start">
      {/* Left Panel - Settings */}
      <div className="flex-1 lg:max-w-[720px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">신규 고객 유치</h1>
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              NEW
            </span>
          </div>
          <div className="flex bg-[#f1f5f9] rounded-lg p-1 self-start sm:self-auto">
            <button
              disabled
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all text-[#94a3b8] cursor-not-allowed"
              title="카카오톡 발송은 준비 중입니다"
            >
              카카오톡
            </button>
            <button
              onClick={() => setActiveTab('sms')}
              className={cn(
                'px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all',
                activeTab === 'sms'
                  ? 'bg-white shadow-sm text-[#1e293b]'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              )}
            >
              문자 (SMS/LMS)
            </button>
          </div>
        </div>

        {/* 안내 콜아웃 */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            문자를 받으시는 고객분들은 전국 태그히어 이용 고객 중 전국 태그히어 매장의 이벤트와 혜택을 주기적으로 받기 희망하신 분들입니다.
          </p>
        </div>

        {/* 에러/성공 메시지 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}

        {/* 발송 대상 선택 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 대상 선택</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <p className="text-sm text-neutral-600">전체 고객</p>
              <p className="text-2xl font-bold text-neutral-900">
                {globalTotalCount.toLocaleString()}명
              </p>
            </div>
            <div
              className={cn(
                'p-4 rounded-xl border-2 transition-all',
                selectedSidos.length > 0
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-neutral-200 bg-white'
              )}
            >
              <p className="text-sm text-neutral-600">선택 지역</p>
              <p className="text-2xl font-bold text-green-600">
                {isLoading ? '...' : availableCount.toLocaleString()}명
              </p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <p className="text-sm text-neutral-600">발송 예정</p>
              <p className="text-2xl font-bold text-brand-600">{sendCount.toLocaleString()}명</p>
            </div>
          </div>
        </div>

        {/* 지역 + 업종 선택 - 2열 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 좌측: 지역 선택 */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-neutral-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">지역 선택</p>
                <p className="text-xs text-neutral-500">여러 지역을 선택할 수 있습니다</p>
              </div>
            </div>

            {/* 선택된 지역 태그 */}
            {selectedSidos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedSidos.map((sido) => (
                  <span
                    key={sido}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-full text-sm font-medium"
                  >
                    {sido}
                    <button
                      onClick={() => removeSido(sido)}
                      className="hover:bg-brand-200 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 지역 검색/추가 */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={regionSearchQuery}
                  onChange={(e) => {
                    setRegionSearchQuery(e.target.value);
                    setIsRegionDropdownOpen(true);
                  }}
                  onFocus={() => setIsRegionDropdownOpen(true)}
                  placeholder="지역 검색 (예: 서울, 경기, 부산...)"
                  className="w-full pl-9 pr-4 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* 드롭다운 */}
              {isRegionDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                  {filteredSidos.length > 0 ? (
                    filteredSidos.map((sido) => {
                      const isSelected = selectedSidos.includes(sido);
                      return (
                        <button
                          key={sido}
                          onClick={() => !isSelected && addSido(sido)}
                          disabled={isSelected}
                          className={cn(
                            "w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors",
                            isSelected
                              ? "bg-brand-50 text-brand-600"
                              : "hover:bg-neutral-50 text-neutral-700"
                          )}
                        >
                          <span className="font-medium">{sido}</span>
                          {isSelected ? (
                            <span className="text-xs text-brand-500">선택됨</span>
                          ) : (
                            <Plus className="w-4 h-4 text-neutral-400" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 text-sm text-neutral-500">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 드롭다운 닫기 */}
            {isRegionDropdownOpen && (
              <div
                className="fixed inset-0 z-0"
                onClick={() => setIsRegionDropdownOpen(false)}
              />
            )}
          </div>

          {/* 우측: 고객 선호 업종 */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-semibold text-neutral-900">관심 업종 <span className="text-neutral-400 font-normal">(선택)</span></p>
            </div>

            {/* 업종 버튼 (플랫 리스트) */}
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => toggleCategory(cat.value)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                    selectedCategories.includes(cat.value)
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 상세 필터 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">상세 필터</h2>
          <div className="flex flex-wrap gap-2">
            {/* 성별 필터 */}
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setGender(option.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                  gender === option.value
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300'
                )}
              >
                {option.label}
              </button>
            ))}
            <div className="w-px h-8 bg-neutral-200 mx-1" />
            {/* 연령대 필터 */}
            {AGE_GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleAgeGroup(option.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                  selectedAgeGroups.includes(option.value)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedAgeGroups.length === 0 && (
            <p className="text-xs text-neutral-500 mt-2">연령대 미선택 시 전체 연령대로 발송됩니다</p>
          )}
        </div>

        {/* 발송 인원 수 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 인원 수</h2>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={availableCount || 10000}
              value={sendCount}
              onChange={(e) => setSendCount(Math.max(0, parseInt(e.target.value) || 0))}
              className={cn(
                'w-32 border rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-500',
                isOverLimit ? 'border-orange-400 bg-orange-50' : 'border-neutral-300'
              )}
            />
            <span className="text-neutral-600">명</span>
            {isOverLimit && (
              <span className="text-sm text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                발송 가능 인원 초과
              </span>
            )}
          </div>
          {availableCount > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              최대 발송 가능: {availableCount.toLocaleString()}명
            </p>
          )}
        </div>

        {/* 카카오톡 전용: 메시지 타입 선택 */}
        {activeTab === 'kakao' && (
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">메시지 타입</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setKakaoMessageType('TEXT');
                  setKakaoUploadedImage(null);
                }}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  kakaoMessageType === 'TEXT'
                    ? 'border-[#3b82f6] bg-[#eff6ff]'
                    : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                )}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#64748b]" />
                  <span className="text-sm text-[#1e293b]">텍스트형</span>
                </div>
                <p className="text-base font-medium text-[#1e293b] mt-2">200원/건</p>
              </button>
              <button
                onClick={() => setKakaoMessageType('IMAGE')}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  kakaoMessageType === 'IMAGE'
                    ? 'border-[#3b82f6] bg-[#eff6ff]'
                    : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                )}
              >
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-5 h-5 text-[#64748b]" />
                  <span className="text-sm text-[#1e293b]">이미지형</span>
                </div>
                <p className="text-base font-medium text-[#1e293b] mt-2">200원/건</p>
              </button>
            </div>
          </div>
        )}

        {/* 카카오톡 전용: 이미지 업로드 */}
        {activeTab === 'kakao' && kakaoMessageType === 'IMAGE' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-semibold text-neutral-900">이미지 첨부</h2>
            </div>

            {/* 이미지 규격 안내 */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-3">
              <p className="text-xs font-medium text-blue-700 mb-1.5">이미지 규격 안내</p>
              <ul className="text-xs text-blue-600 space-y-0.5">
                <li>• 가로 너비: 500px 이상</li>
                <li>• 세로 높이: 250px 이상</li>
                <li>• 가로:세로 비율: 2:1 ~ 3:4</li>
                <li>• 파일 형식: JPG, PNG</li>
                <li>• 파일 용량: 최대 500KB</li>
              </ul>
            </div>

            {!kakaoUploadedImage ? (
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleKakaoImageUpload}
                    disabled={isKakaoUploading}
                  />
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2.5 border border-dashed border-neutral-300 rounded-xl text-sm text-neutral-500 hover:border-brand-500 hover:text-brand-500 transition-colors",
                    isKakaoUploading && "opacity-50 cursor-not-allowed"
                  )}>
                    {isKakaoUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                    <span>{isKakaoUploading ? '업로드 중...' : '이미지 추가'}</span>
                  </div>
                </label>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <img
                  src={`${API_BASE}${kakaoUploadedImage.imageUrl}`}
                  alt="첨부 이미지"
                  className="w-16 h-16 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{kakaoUploadedImage.filename}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 bg-neutral-200 rounded text-xs text-neutral-600">이미지형 (200원/건)</span>
                </div>
                <button
                  onClick={handleKakaoImageDelete}
                  className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {kakaoImageError && (
              <div className="flex items-center gap-2 p-3 mt-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{kakaoImageError}</span>
              </div>
            )}
          </div>
        )}

        {/* 메시지 내용 입력 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              메시지 내용 입력{' '}
              {activeTab === 'sms' && (
                <span className="text-neutral-400 font-normal">(단문/장문 자동 전환)</span>
              )}
            </h2>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              activeTab === 'kakao'
                ? '안녕하세요!\n\n4월 봄맞이 이벤트 안내드립니다.\n\n[이벤트 혜택]\n- 첫 방문 고객 10% 할인\n- 2인 이상 방문 시 음료 무료\n\n기간: 4/1 ~ 4/30'
                : `[태그히어] 4월 봄맞이 이벤트 안내\n\n안녕하세요!\n따뜻한 봄을 맞아 태그히어 강남본점에서 특별한 혜택을 준비했습니다.\n\n[이벤트 혜택]\n- 첫 방문 고객 10% 할인\n- 2인 이상 방문 시 음료 무료\n\n기간: 4/1 ~ 4/30\n\n많은 관심 부탁드립니다!`
            }
            rows={8}
            className="w-full border border-neutral-300 rounded-lg px-4 py-3 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-2">
            {activeTab === 'sms' ? (
              <>
                <span>
                  {smsMessageType} ({byteLength}byte)
                </span>
                <span>{content.length}자</span>
              </>
            ) : (
              <>
                <span>카카오톡 브랜드 메시지</span>
                <span>{content.length}자</span>
              </>
            )}
          </div>
        </div>

        {/* 카카오톡 전용: 버튼 추가 */}
        {activeTab === 'kakao' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-900">
                버튼 추가 <span className="text-neutral-400 font-normal">(선택, 최대 5개)</span>
              </h2>
              {kakaoButtons.length < 5 && (
                <button
                  onClick={addKakaoButton}
                  className="flex items-center gap-1 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-sm text-neutral-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  버튼 추가
                </button>
              )}
            </div>
            {kakaoButtons.length > 0 && (
              <div className="space-y-3">
                {kakaoButtons.map((button, index) => (
                  <div
                    key={index}
                    className="p-3 bg-neutral-50 rounded-lg border border-neutral-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-neutral-500">버튼 {index + 1}</span>
                      <button
                        onClick={() => removeKakaoButton(index)}
                        className="p-1 hover:bg-neutral-200 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-neutral-400" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={button.name}
                        onChange={(e) => updateKakaoButton(index, 'name', e.target.value)}
                        placeholder="버튼 이름 (예: 예약하기)"
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-neutral-400" />
                        <input
                          type="url"
                          value={button.linkMo}
                          onChange={(e) => updateKakaoButton(index, 'linkMo', e.target.value)}
                          placeholder="연결 URL (https://...)"
                          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SMS 전용: 이미지 첨부 안내 */}
        {activeTab === 'sms' && (
          <div className="p-3 bg-neutral-50 rounded-lg">
            <div className="flex items-center gap-2 text-neutral-400">
              <Info className="w-4 h-4" />
              <span className="text-sm">
                외부 고객 SMS는 텍스트만 발송 가능합니다. (이미지 첨부 불가)
              </span>
            </div>
          </div>
        )}

        {/* 비용 요약 및 발송 버튼 */}
        <div className="border-t border-neutral-200 pt-4 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-neutral-600">예상 비용</p>
              <p className="text-xl font-bold text-neutral-900">
                {sendCount.toLocaleString()}명 × {getCostPerMessage()}원 ={' '}
                <span className="text-brand-600">{estimatedCost.toLocaleString()}원</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-neutral-600">현재 잔액</p>
              <p className={cn('text-xl font-bold', canAfford ? 'text-green-600' : 'text-red-600')}>
                {walletBalance.toLocaleString()}원
              </p>
            </div>
          </div>

          {/* 예상 마케팅 효과 (카카오톡) */}
          {activeTab === 'kakao' && sendCount > 0 && (
            <div className="mb-4 p-4 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-base font-semibold text-green-700">예상 마케팅 효과</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-[#64748b]">예상 방문율</p>
                  <p className="text-base font-bold text-green-700">3.4%</p>
                </div>
                <div>
                  <p className="text-sm text-[#64748b]">예상 방문</p>
                  <p className="text-base font-bold text-green-700">
                    {Math.round(sendCount * 0.034).toLocaleString()}명
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#64748b]">예상 매출</p>
                  <p className="text-base font-bold text-green-700">
                    {(Math.round(sendCount * 0.034) * (kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000)).toLocaleString()}원
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#94a3b8] mt-2">
                * 업계 평균 방문율 3.4% 및 매장 평균 객단가 {(kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000).toLocaleString()}원 기준
              </p>
            </div>
          )}

          {/* 예상 마케팅 효과 (SMS) */}
          {activeTab === 'sms' && sendCount > 0 && (
            <div className="mb-4 p-4 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-base font-semibold text-green-700">예상 마케팅 효과</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-[#64748b]">예상 방문율</p>
                  <p className="text-base font-bold text-green-700">2.7%</p>
                </div>
                <div>
                  <p className="text-sm text-[#64748b]">예상 방문</p>
                  <p className="text-base font-bold text-green-700">
                    {Math.round(sendCount * 0.027).toLocaleString()}명
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#64748b]">예상 매출</p>
                  <p className="text-base font-bold text-green-700">
                    {(Math.round(sendCount * 0.027) * 25000).toLocaleString()}원
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#94a3b8] mt-2">
                * 업계 평균 방문율 2.7% 및 기본 객단가 25,000원 기준
              </p>
            </div>
          )}

          {/* 테스트 발송 (SMS만) */}
          {activeTab === 'sms' && (
            <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                테스트 발송 (선택)
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={handleTestSend}
                  disabled={isTestSending || !content.trim() || !testPhone}
                  className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isTestSending ? '발송 중...' : '테스트 발송'}
                </button>
              </div>
            </div>
          )}

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors',
              canSend ? 'bg-brand-600 hover:bg-brand-700' : 'bg-neutral-300 cursor-not-allowed'
            )}
          >
            <Send className="w-5 h-5" />
            {isSending ? '발송 중...' : '발송하기'}
          </button>

          {/* 야간 발송 안내 */}
          {activeTab === 'kakao' && (
            <p className="text-xs text-neutral-500 text-center mt-2">
              * KST 기준 20:50 이후 발송 시, 다음날 08:00에 발송됩니다.
            </p>
          )}
        </div>
      </div>

      {/* Right Panel - iPhone Preview (Sticky) */}
      <div className="hidden lg:block flex-none w-[360px]">
        <div className="sticky top-6 bg-[#e2e8f0] rounded-3xl p-5">
          {activeTab === 'kakao' ? (
            /* 카카오톡 미리보기 - 네이버 리뷰 스타일 */
            <div className="relative w-full h-[680px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
              {/* Inner bezel */}
              <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
                {/* Screen */}
                <div className="w-full h-full bg-[#B2C7D9] rounded-[1.75rem] overflow-hidden flex flex-col relative">
                  {/* Dynamic Island / Notch */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />

                  {/* KakaoTalk header */}
                  <div className="flex items-center justify-between px-4 pt-10 pb-2">
                    <ChevronLeft className="w-4 h-4 text-neutral-700" />
                    <span className="font-medium text-xs text-neutral-800">카카오톡</span>
                    <Menu className="w-4 h-4 text-neutral-700" />
                  </div>

                  {/* Date badge */}
                  <div className="flex justify-center mb-3">
                    <span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">
                      {new Date().toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Message area */}
                  <div className="flex-1 pl-2 pr-4 overflow-auto">
                    <div className="flex gap-1.5">
                      {/* Profile icon */}
                      <div className="flex-shrink-0">
                        <div className="w-7 h-7 rounded-full bg-neutral-300" />
                      </div>

                      {/* Message content */}
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-[10px] text-neutral-600 mb-0.5">태그히어</p>

                        {/* Message bubble - KakaoTalk style */}
                        <div className="relative">
                          {/* Kakao badge */}
                          <div className="absolute -top-1 -right-1 z-10">
                            <span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">
                              kakao
                            </span>
                          </div>

                          <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                            <span className="text-xs font-medium text-neutral-800">브랜드 메시지</span>
                          </div>
                          <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                            {/* 이미지 */}
                            {kakaoMessageType === 'IMAGE' && kakaoUploadedImage && (
                              <img
                                src={`${API_BASE}${kakaoUploadedImage.imageUrl}`}
                                alt="첨부 이미지"
                                className="w-full h-auto"
                              />
                            )}
                            {/* Message body */}
                            <div className="p-3">
                              <p className="text-xs text-neutral-800 whitespace-pre-wrap break-words leading-relaxed">
                                {content || '메시지 미리보기'}
                              </p>

                              {/* Buttons */}
                              {kakaoButtons.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                  {kakaoButtons.map(
                                    (button, index) =>
                                      button.name && (
                                        <button
                                          key={index}
                                          className="w-full py-2 border border-neutral-300 rounded-md text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 transition-colors"
                                        >
                                          {button.name}
                                        </button>
                                      )
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Time */}
                        <p className="text-[8px] text-neutral-500 mt-0.5 text-right">
                          오후 12:30
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom safe area */}
                  <div className="h-6" />
                </div>
              </div>
            </div>
          ) : (
            /* SMS 미리보기 - 기존 스타일 유지 */
            <div className="w-full h-[680px] bg-white rounded-[44px] border-[10px] border-[#1e293b] overflow-hidden flex flex-col shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative">
              {/* Dynamic Island */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90px] h-[28px] bg-[#1e293b] rounded-full z-20" />

              {/* Status Bar */}
              <div className="h-12 bg-white flex items-end justify-between px-6 pb-1 text-xs font-semibold">
                <span>12:30</span>
                <div className="flex items-center gap-1">
                  <Wifi className="w-4 h-4" />
                  <BatteryFull className="w-5 h-5" />
                </div>
              </div>

              {/* iOS Header */}
              <div className="h-[60px] bg-white flex items-center justify-between px-4 border-b border-[#e5e7eb]">
                <ChevronLeft className="w-6 h-6 text-[#007aff]" />
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-[#e5e7eb] flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#9ca3af]" />
                  </div>
                  <span className="text-[13px] font-semibold text-[#1e293b] mt-1">태그히어 CRM</span>
                </div>
                <div className="w-6" />
              </div>

              {/* Message Body */}
              <div className="flex-1 bg-white px-4 py-3 flex flex-col overflow-y-auto">
                <div className="text-center text-[12px] text-[#8e8e93] font-medium mb-4">
                  문자 메시지
                  <br />
                  오늘 오후 12:30
                </div>
                <div className="flex justify-start">
                  <div className="py-3 px-4 rounded-[20px] rounded-bl-[6px] max-w-[85%] text-[15px] leading-[1.5] bg-[#e5e5ea] text-[#1e293b]">
                    {content ? (
                      <span className="whitespace-pre-wrap break-words">
                        {`(광고)\n${content}\n무료수신거부 080-500-4233`}
                      </span>
                    ) : (
                      <span className="text-[#94a3b8]">메시지 미리보기</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Input Bar */}
              <div className="py-3 px-4 bg-white border-t border-[#e5e7eb] flex items-center gap-3">
                <Camera className="w-6 h-6 text-[#007aff]" />
                <span className="text-[17px] font-bold text-[#007aff]">A</span>
                <div className="flex-1 h-9 bg-[#f1f5f9] rounded-full px-4 flex items-center">
                  <span className="text-[#94a3b8] text-[15px]">iMessage</span>
                </div>
                <div className="w-8 h-8 bg-[#007aff] rounded-full flex items-center justify-center">
                  <ChevronUp className="w-5 h-5 text-white" />
                </div>
              </div>

              {/* Home Indicator */}
              <div className="h-8 bg-white flex items-center justify-center">
                <div className="w-32 h-1 bg-[#1e293b] rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
