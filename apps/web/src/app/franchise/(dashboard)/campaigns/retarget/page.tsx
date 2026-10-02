'use client';

import { API_BASE } from '@/lib/api-config';
import { readRecipients } from '@/lib/selected-recipients';
import { AGE_GROUP_OPTIONS } from '@/lib/constants';
import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatNumber, formatPhone, maskNickname } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { SegmentPicker, type PickedSegment } from '@/features/segments/SegmentPicker';
import { PremiumKakaoComposer } from '@/features/premium-kakao/PremiumKakaoComposer';
import { AlimtalkSamples } from '@/features/premium-kakao/AlimtalkSamples';
import { MobilePreviewSheet } from '@/features/messages/MobilePreviewSheet';
import { ReservationsPanel } from '@/features/messages/ReservationsPanel';
import { SendTimePicker, SendTimeValue, defaultSendTime, formatSendTime, sendTimeError, sendTimeToIso } from '@/features/messages/SendTimePicker';
import { PremiumKakaoPreview } from '@/features/premium-kakao/PremiumKakaoPreview';
import { BubbleType, PkContent, emptyContent } from '@/features/premium-kakao/spec';
import { StaffVerifyField, StaffVerifyValue, emptyStaffVerify, smsCouponPreview, staffVerifyPayload } from '@/features/marketing-performance/StaffVerifyField';
import {
  Send,
  Users,
  Loader2,
  ChevronLeft,
  Camera,
  ArrowUp,
  Wifi,
  Battery,
  ImagePlus,
  X,
  AlertCircle,
  Search,
  Check,
  UserPlus,
  Plus,
  Trash2,
  Link,
  Clock,
  MessageSquare,
  TrendingUp,
  Store,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TargetCounts,
  EstimatedRevenue,
  Estimate,
  UploadedImage,
  SelectedCustomer,
  KakaoButton,
  KakaoEstimate,
  KakaoUploadedImage,
  CustomerListItem,
  IMAGE_MAX_SIZE,
  IMAGE_MAX_WIDTH,
  IMAGE_MAX_HEIGHT,
  SendConfirmModal,
  TestSendModal,
  KakaoConfirmModal,
  KakaoTestModal,
} from '@/features/messages';
import { CouponSmsBodyField, CouponSmsPreview } from '@/features/kakao-composer';
import { IPhoneFrame } from '@/components/ui/iphone-frame';


// 연령대 옵션 (local-customers와 동일)
// 카테고리 레이블 매핑
const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    KOREAN: '한식',
    CHINESE: '중식',
    JAPANESE: '일식',
    WESTERN: '양식',
    ASIAN: '아시안',
    BUNSIK: '분식',
    FAST_FOOD: '패스트푸드',
    MEAT: '고기구이',
    CHICKEN: '치킨',
    PIZZA: '피자',
    CAFE: '카페',
    DESSERT: '디저트',
    BAKERY: '베이커리',
    SOJU_BAR: '소주바',
    BEER_BAR: '맥주바',
    COCKTAIL_BAR: '칵테일바',
    POCHA: '포차',
    KOREAN_PUB: '한식주점',
    COOK_PUB: '요리주점',
    OTHER: '기타',
  };
  return labels[category] || category;
};

interface Campaign {
  id: string;
  title: string;
  content: string;
  targetType: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  totalCost: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  category?: string;
  address?: string;
  customerCount: number;
  createdAt: string;
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, ToastComponent } = useToast();

  // Tab state (문자 우선 - 카카오톡 임시 비활성화)
  const [activeTab, setActiveTab] = useState<'sms' | 'kakao'>('kakao');
  // 카카오톡 탭 형태: 템플릿 기본형(쿠폰 알림톡) / 브랜드 메시지(premiumType)
  // 진입 시 기본 형태는 이미지형
  const [kakaoMode, setKakaoMode] = useState<'ALIMTALK' | 'BMS'>('BMS');
  // 프리미엄 카카오톡 (브랜드 메시지 — 전 가맹점 고객, 프랜차이즈 지갑 과금)
  const [premiumType, setPremiumType] = useState<BubbleType>('IMAGE');
  const [premiumContents, setPremiumContents] = useState<Partial<Record<BubbleType, PkContent>>>({});
  const premiumContent = premiumContents[premiumType] ?? emptyContent(premiumType);
  const [premiumVerify, setPremiumVerify] = useState<StaffVerifyValue>(emptyStaffVerify);
  // 발송 매장 안내 미리보기 — 실제로는 손님마다 소속 가맹점 이름이 들어간다
  const [premiumFooterName, setPremiumFooterName] = useState('');
  // 발송 시간 (지금 / 예약) — 문자, 템플릿 기본형(쿠폰 알림톡)
  const [smsSendTime, setSmsSendTime] = useState<SendTimeValue>(defaultSendTime);
  // 새로 예약하면 “예약된 발송” 목록을 다시 불러온다
  const [reservationKey, setReservationKey] = useState(0);
  const bumpReservations = () => setReservationKey((k) => k + 1);
  const [couponSendTime, setCouponSendTime] = useState<SendTimeValue>(defaultSendTime);
  // 문자 직원 확인 쿠폰 (선택)
  const [smsVerify, setSmsVerify] = useState<StaffVerifyValue>(emptyStaffVerify);

  // Target counts
  const [targetCounts, setTargetCounts] = useState<TargetCounts>({ all: 0, revisit: 0, new: 0 });
  const [selectedTarget, setSelectedTarget] = useState<'ALL' | 'REVISIT' | 'NEW' | 'CUSTOM' | 'SEGMENT'>('ALL');
  // 고객 그룹으로 발송 — reachable 은 전 가맹점 수신 동의 + 전화번호 보유 고객 수
  const [selectedSegment, setSelectedSegment] = useState<PickedSegment | null>(null);

  // Custom selected customers (from customer list page)
  const [selectedCustomers, setSelectedCustomers] = useState<SelectedCustomer[]>([]);

  // Message content
  const [messageContent, setMessageContent] = useState('');

  // Estimate
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  // Filters
  const [genderFilter, setGenderFilter] = useState<'all' | 'MALE' | 'FEMALE'>('all');
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);

  // 연령대 토글
  const toggleAgeGroup = (value: string) => {
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Image upload states
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Customer selection modal states
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerList, setCustomerList] = useState<CustomerListItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [tempSelectedCustomers, setTempSelectedCustomers] = useState<SelectedCustomer[]>([]);
  const [customerTotalCount, setCustomerTotalCount] = useState(0);

  // Store selection modal states
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [storeList, setStoreList] = useState<StoreInfo[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(null);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');

  // Test send modal states
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);
  const [testCount, setTestCount] = useState({ count: 0, limit: 5, remaining: 5 });

  // 광고 메시지 여부
  const [isAdMessage, setIsAdMessage] = useState(true);

  // 카카오톡 브랜드 메시지 상태
  const [kakaoMessageType, setKakaoMessageType] = useState<'TEXT' | 'IMAGE'>('TEXT');
  const [kakaoContent, setKakaoContent] = useState('');
  const [kakaoButtons, setKakaoButtons] = useState<KakaoButton[]>([{ type: 'WL', name: '', linkMo: '' }]);
  const [kakaoUploadedImage, setKakaoUploadedImage] = useState<KakaoUploadedImage | null>(null);
  const [kakaoEstimate, setKakaoEstimate] = useState<KakaoEstimate | null>(null);
  const [isSendableTime, setIsSendableTime] = useState(true);
  const [isKakaoUploading, setIsKakaoUploading] = useState(false);
  const [kakaoImageError, setKakaoImageError] = useState<string | null>(null);
  const [showKakaoConfirmModal, setShowKakaoConfirmModal] = useState(false);
  const [isKakaoSending, setIsKakaoSending] = useState(false);
  const [showKakaoTestModal, setShowKakaoTestModal] = useState(false);
  const [kakaoTestPhone, setKakaoTestPhone] = useState('');
  const [isKakaoTestSending, setIsKakaoTestSending] = useState(false);

  // 카카오톡 쿠폰 알림톡 상태 (messages 페이지와 동일한 템플릿)
  const [couponContent, setCouponContent] = useState('');
  const [couponExpiryDate, setCouponExpiryDate] = useState('');
  // 쿠폰 문자 본문 — null 이면 기본 문구 (리타겟 쿠폰은 광고 문자로 나간다)
  const [couponSmsBody, setCouponSmsBody] = useState<string | null>(null);
  const [couponStoreName, setCouponStoreName] = useState('');
  const [couponEstimate, setCouponEstimate] = useState<{ totalCost: number; walletBalance: number; canSend: boolean } | null>(null);
  const [isCouponSending, setIsCouponSending] = useState(false);

  // (구) 브랜드 메시지 카카오 UI 비활성 플래그. boolean 타입으로 두어 죽은 분기의
  // 타입 내로잉(control-flow narrowing)이 유지되도록 한다. (literal false면 unreachable 처리되어 내로잉 소실)
  const SHOW_LEGACY_KAKAO_UI: boolean = false;

  // Get auth token
  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('franchiseToken') || 'dev-token';
  };

  // 고객 그룹 선택 → 현재 발송 가능 인원 조회
  const selectSegment = useCallback(async (segmentId: string) => {
    if (!segmentId) {
      setSelectedSegment(null);
      setSelectedTarget('ALL');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/franchise/segments/${segmentId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('franchiseToken') || ''}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelectedSegment({ id: data.segment.id, name: data.segment.name, reachable: data.reachable });
      setSelectedCustomers([]);
      setSelectedTarget('SEGMENT');
    } catch {
      showToast('고객 그룹을 불러오지 못했습니다.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 고객 리스트에서 고른 손님 (?selection=키 → sessionStorage, 이름·번호는 URL 에 싣지 않는다)
  useEffect(() => {
    const picked = readRecipients(searchParams.get('selection'));
    if (picked.length > 0) {
      setSelectedCustomers(picked);
      setSelectedTarget('CUSTOM');
    }
  }, [searchParams]);

  // Fetch target counts (with filters)
  const fetchTargetCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (genderFilter !== 'all') {
        params.set('genderFilter', genderFilter);
      }
      if (selectedAgeGroups.length > 0) {
        params.set('ageGroups', selectedAgeGroups.join(','));
      }

      const url = `${API_BASE}/api/franchise/sms/target-counts${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTargetCounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch target counts:', error);
    }
  }, [genderFilter, selectedAgeGroups]);

  // Fetch estimate (with filters)
  const fetchEstimate = useCallback(async () => {
    if (!messageContent.trim()) {
      setEstimate(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        targetType: selectedTarget,
        content: messageContent,
      });

      if (selectedTarget === 'CUSTOM' && selectedCustomers.length > 0) {
        params.set('customerIds', selectedCustomers.map(c => c.id).join(','));
      }
      if (selectedTarget === 'SEGMENT' && selectedSegment) {
        params.set('segmentId', selectedSegment.id);
      }

      // 필터 추가
      if (genderFilter !== 'all') {
        params.set('genderFilter', genderFilter);
      }
      if (selectedAgeGroups.length > 0) {
        params.set('ageGroups', selectedAgeGroups.join(','));
      }

      // 이미지 첨부 여부
      if (uploadedImage) {
        params.set('hasImage', 'true');
      }
      // 직원 확인 쿠폰 링크까지 포함한 길이로 비용 계산
      if (smsVerify.enabled) {
        params.set('staffVerify', 'true');
        params.set('couponContent', smsVerify.couponContent);
        params.set('expiryDate', smsVerify.expiryDate);
      }

      const res = await fetch(`${API_BASE}/api/franchise/sms/estimate?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setEstimate(data);
      }
    } catch (error) {
      console.error('Failed to fetch estimate:', error);
    }
  }, [messageContent, selectedTarget, selectedCustomers, selectedSegment, genderFilter, selectedAgeGroups, uploadedImage, smsVerify]);

  // Fetch test count
  const fetchTestCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/franchise/sms/test-count`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTestCount(data);
      }
    } catch (err) {
      console.error('Failed to fetch test count:', err);
    }
  }, []);

  // 카카오톡 발송 가능 시간 체크
  const checkSendableTime = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/brand-message/send-available`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsSendableTime(data.sendable);
      }
    } catch (error) {
      console.error('Failed to check sendable time:', error);
    }
  }, []);

  // 카카오톡 비용 예상 조회
  const fetchKakaoEstimate = useCallback(async () => {
    if (!kakaoContent.trim()) {
      setKakaoEstimate(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        targetType: selectedTarget,
        messageType: kakaoMessageType,
      });

      if (selectedTarget === 'CUSTOM' && selectedCustomers.length > 0) {
        params.set('customerIds', selectedCustomers.map(c => c.id).join(','));
      }

      if (genderFilter !== 'all') {
        params.set('genderFilter', genderFilter);
      }
      if (selectedAgeGroups.length > 0) {
        params.set('ageGroups', selectedAgeGroups.join(','));
      }

      const res = await fetch(`${API_BASE}/api/brand-message/estimate?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setKakaoEstimate(data);
      }
    } catch (error) {
      console.error('Failed to fetch kakao estimate:', error);
    }
  }, [kakaoContent, selectedTarget, selectedCustomers, genderFilter, selectedAgeGroups, kakaoMessageType]);

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
        showToast('이미지가 업로드되었습니다.', 'success');
      } else {
        setKakaoImageError(data.error || '이미지 업로드에 실패했습니다.');
      }
    } catch (error) {
      setKakaoImageError('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsKakaoUploading(false);
    }
  };

  // 카카오톡 이미지 삭제
  const handleKakaoImageDelete = () => {
    setKakaoUploadedImage(null);
    setKakaoMessageType('TEXT');
    setKakaoImageError(null);
  };

  // 카카오톡 버튼 추가
  const addKakaoButton = () => {
    if (kakaoButtons.length >= 5) {
      showToast('버튼은 최대 5개까지 추가할 수 있습니다.', 'error');
      return;
    }
    setKakaoButtons([...kakaoButtons, { type: 'WL', name: '', linkMo: '' }]);
  };

  // 카카오톡 버튼 삭제
  const removeKakaoButton = (index: number) => {
    setKakaoButtons(kakaoButtons.filter((_, i) => i !== index));
  };

  // 카카오톡 버튼 업데이트
  const updateKakaoButton = (index: number, field: keyof KakaoButton, value: string) => {
    const newButtons = [...kakaoButtons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    setKakaoButtons(newButtons);
  };

  // 카카오톡 테스트 발송
  const handleKakaoTestSend = async () => {
    if (!kakaoContent.trim()) {
      showToast('메시지 내용을 입력해주세요.', 'error');
      return;
    }

    if (!kakaoTestPhone.trim()) {
      showToast('전화번호를 입력해주세요.', 'error');
      return;
    }

    // 버튼 유효성 검사
    const validButtons = kakaoButtons.filter(b => b.name.trim() && b.linkMo.trim());

    setIsKakaoTestSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/brand-message/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          phone: kakaoTestPhone,
          content: kakaoContent,
          messageType: kakaoMessageType,
          imageId: kakaoUploadedImage?.imageId || undefined,
          buttons: validButtons.length > 0 ? validButtons : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast('테스트 발송이 요청되었습니다.', 'success');
        setShowKakaoTestModal(false);
        setKakaoTestPhone('');
      } else {
        showToast(data.error || '테스트 발송 실패', 'error');
      }
    } catch (error) {
      showToast('테스트 발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsKakaoTestSending(false);
    }
  };

  // 카카오톡 발송
  const handleKakaoSend = async () => {
    if (!kakaoContent.trim()) {
      showToast('메시지 내용을 입력해주세요.', 'error');
      return;
    }

    // 버튼 유효성 검사
    const validButtons = kakaoButtons.filter(b => b.name.trim() && b.linkMo.trim());

    setIsKakaoSending(true);
    try {
      const body: any = {
        content: kakaoContent,
        targetType: selectedTarget,
        messageType: kakaoMessageType,
        genderFilter: genderFilter !== 'all' ? genderFilter : undefined,
        ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : undefined,
        imageId: kakaoUploadedImage?.imageId || undefined,
        buttons: validButtons.length > 0 ? validButtons : undefined,
      };

      if (selectedTarget === 'CUSTOM') {
        body.customerIds = selectedCustomers.map(c => c.id);
      }

      // 발송 불가 시간이면 예약 발송
      const endpoint = isSendableTime
        ? `${API_BASE}/api/brand-message/send`
        : `${API_BASE}/api/brand-message/schedule`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        if (isSendableTime) {
          const pendingCount = data.pendingCount || 0;
          const failedMsg = data.failedCount > 0 ? `, ${data.failedCount}건 실패` : '';
          showToast(`${pendingCount}건 발송 요청 완료${failedMsg}`, 'success');
        } else {
          showToast(`${data.scheduledTime || '08:00'}에 예약 발송되었습니다.`, 'success');
        }
        setKakaoContent('');
        setKakaoUploadedImage(null);
        setKakaoButtons([]);
        setKakaoMessageType('TEXT');
        setShowKakaoConfirmModal(false);
        setSelectedCustomers([]);
        setSelectedTarget('ALL');
        fetchTargetCounts();
        router.replace('/franchise/campaigns/retarget');
      } else {
        showToast(data.error || '발송 실패', 'error');
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsKakaoSending(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchTestCount();
      await fetchTargetCounts();
      await checkSendableTime();
      setIsLoading(false);
    };
    init();
  }, []);

  // 카카오톡 탭일 때 발송 가능 시간 주기적 체크
  useEffect(() => {
    if (activeTab !== 'kakao') return;

    checkSendableTime();
    const interval = setInterval(checkSendableTime, 60000); // 1분마다 체크
    return () => clearInterval(interval);
  }, [activeTab, checkSendableTime]);

  // 카카오톡 비용 예상 업데이트
  useEffect(() => {
    if (activeTab !== 'kakao') return;

    const debounce = setTimeout(fetchKakaoEstimate, 300);
    return () => clearTimeout(debounce);
  }, [activeTab, fetchKakaoEstimate]);

  // 쿠폰 알림톡 비용 예상 + 미리보기 상호명 조회
  useEffect(() => {
    if (activeTab !== 'kakao') return;
    let cancelled = false;
    const run = async () => {
      try {
        const count =
          selectedTarget === 'CUSTOM' ? selectedCustomers.length
          : selectedTarget === 'SEGMENT' ? selectedSegment?.reachable ?? 0
          : selectedTarget === 'ALL' ? targetCounts.all
          : selectedTarget === 'REVISIT' ? targetCounts.revisit
          : targetCounts.new;
        const [estRes, setRes] = await Promise.all([
          fetch(`${API_BASE}/api/franchise/retarget-coupon/estimate?targetCount=${count}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          }),
          couponStoreName
            ? Promise.resolve(null)
            : fetch(`${API_BASE}/api/franchise/retarget-coupon/settings`, {
                headers: { Authorization: `Bearer ${getAuthToken()}` },
              }),
        ]);
        if (!cancelled && estRes.ok) setCouponEstimate(await estRes.json());
        if (!cancelled && setRes && setRes.ok) {
          const s = await setRes.json();
          setCouponStoreName(s.storeName || '');
        }
      } catch (e) {
        console.error('coupon estimate failed', e);
      }
    };
    const debounce = setTimeout(run, 300);
    return () => { cancelled = true; clearTimeout(debounce); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedTarget, selectedCustomers, selectedSegment, genderFilter, selectedAgeGroups, targetCounts]);

  // Update target counts when filters change
  useEffect(() => {
    fetchTargetCounts();
  }, [fetchTargetCounts]);

  // Update estimate when content, target, or filters change
  useEffect(() => {
    const debounce = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(debounce);
  }, [fetchEstimate]);

  // Calculate byte length for display
  const getByteLength = (str: string): number => {
    let byteLength = 0;
    for (let i = 0; i < str.length; i++) {
      byteLength += str.charCodeAt(i) > 127 ? 2 : 1;
    }
    return byteLength;
  };

  const byteLength = getByteLength(messageContent + smsCouponPreview(smsVerify));
  const isLongMessage = byteLength > 90;

  // Get current target count
  const getCurrentTargetCount = () => {
    if (selectedTarget === 'CUSTOM') return selectedCustomers.length;
    if (selectedTarget === 'SEGMENT') return selectedSegment?.reachable ?? 0;
    if (selectedTarget === 'ALL') return targetCounts.all;
    if (selectedTarget === 'REVISIT') return targetCounts.revisit;
    return targetCounts.new;
  };

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError(null);

    // 클라이언트 측 검증
    // 1. 확장자 검증
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'jpg' && ext !== 'jpeg') {
      setImageError('JPG 파일만 업로드 가능합니다.');
      return;
    }

    // 2. 용량 검증
    if (file.size > IMAGE_MAX_SIZE) {
      setImageError(`이미지 용량이 너무 큽니다. (최대 200KB, 현재 ${Math.round(file.size / 1024)}KB)`);
      return;
    }

    // 3. 이미지 크기 검증 (가로/세로)
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      if (img.width > IMAGE_MAX_WIDTH) {
        setImageError(`이미지 가로 크기가 너무 큽니다. (최대 ${IMAGE_MAX_WIDTH}px, 현재 ${img.width}px)`);
        return;
      }

      if (img.height > IMAGE_MAX_HEIGHT) {
        setImageError(`이미지 세로 크기가 너무 큽니다. (최대 ${IMAGE_MAX_HEIGHT}px, 현재 ${img.height}px)`);
        return;
      }

      // 서버에 업로드
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('image', file);

        const res = await fetch(`${API_BASE}/api/franchise/sms/upload-image`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: formData,
        });

        const data = await res.json();

        if (res.ok) {
          setUploadedImage(data);
          showToast('이미지가 업로드되었습니다.', 'success');
        } else {
          setImageError(data.error || '이미지 업로드에 실패했습니다.');
        }
      } catch (error) {
        setImageError('이미지 업로드 중 오류가 발생했습니다.');
      } finally {
        setIsUploading(false);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImageError('이미지 파일을 읽을 수 없습니다.');
    };

    img.src = objectUrl;
  };

  // Fetch stores for selection modal
  const fetchStores = useCallback(async (search?: string) => {
    setIsLoadingStores(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }

      const res = await fetch(`${API_BASE}/api/franchise/stores?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStoreList(data.stores || []);
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    } finally {
      setIsLoadingStores(false);
    }
  }, []);

  // Fetch customers for modal (특정 가맹점의 고객만)
  const fetchCustomers = useCallback(async (storeId: string, search?: string) => {
    setIsLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      params.set('storeId', storeId); // 추가: 특정 가맹점만 조회
      if (search) {
        params.set('search', search);
      }
      params.set('limit', '100'); // 최대 100명

      const res = await fetch(`${API_BASE}/api/franchise/sms/customers/selectable?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        // 전화번호 있는 고객만 필터링
        const customersWithPhone = (data || []).filter((c: CustomerListItem) => c.phone);
        setCustomerList(customersWithPhone);
        setCustomerTotalCount(customersWithPhone.length);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, []);

  // Open store selection modal
  const openStoreModal = () => {
    setStoreSearch('');
    setShowStoreModal(true);
    fetchStores();
  };

  // Select store and proceed to customer selection
  const selectStoreAndOpenCustomerModal = (store: StoreInfo) => {
    setSelectedStore(store);
    setShowStoreModal(false);

    // 고객 선택 모달 오픈
    setTempSelectedCustomers([...selectedCustomers]);
    setCustomerSearch('');
    setShowCustomerModal(true);
    fetchCustomers(store.id); // 선택한 가맹점의 고객만 조회
  };

  // Reset store selection
  const resetStoreSelection = () => {
    setSelectedStore(null);
    setSelectedCustomers([]);
    setSelectedTarget('ALL');
    router.replace('/franchise/campaigns/retarget');
  };

  // Open customer modal - NOW opens store selection first
  const openCustomerModal = () => {
    openStoreModal(); // 가맹점 선택 모달 먼저 오픈
  };

  // Toggle customer selection in modal
  const toggleCustomerSelection = (customer: CustomerListItem) => {
    const isSelected = tempSelectedCustomers.some(c => c.id === customer.id);
    if (isSelected) {
      setTempSelectedCustomers(tempSelectedCustomers.filter(c => c.id !== customer.id));
    } else {
      setTempSelectedCustomers([...tempSelectedCustomers, {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
      }]);
    }
  };

  // Fetch all customer IDs for the selected store (for "Select All")
  // 가맹점 내 상세 필터(성별·연령대)를 함께 보낸다 — 전체 가맹점 필터와 동일 기준(API buildFilterConditions)
  const fetchAllCustomerIds = useCallback(async (storeId: string) => {
    try {
      const params = new URLSearchParams({ storeId });
      if (genderFilter !== 'all') params.set('genderFilter', genderFilter);
      if (selectedAgeGroups.length > 0) params.set('ageGroups', selectedAgeGroups.join(','));
      const res = await fetch(`${API_BASE}/api/franchise/sms/customers/all-ids?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        return data.customers || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch all customer IDs:', error);
      return [];
    }
  }, [genderFilter, selectedAgeGroups]);

  // Select all customers (fetch all from store, not just displayed 100)
  const selectAllCustomers = async () => {
    // selectedStore가 있으면 해당 가맹점의 모든 고객 조회
    if (selectedStore) {
      setIsLoadingCustomers(true);
      try {
        const allCustomers = await fetchAllCustomerIds(selectedStore.id);
        setTempSelectedCustomers(allCustomers);
      } finally {
        setIsLoadingCustomers(false);
      }
      return;
    }

    // selectedStore가 없으면 현재 표시된 목록만 선택 (fallback)
    const allCustomers = customerList.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    }));
    setTempSelectedCustomers(allCustomers);
  };

  // Deselect all customers
  const deselectAllCustomers = () => {
    setTempSelectedCustomers([]);
  };

  // Confirm customer selection
  const confirmCustomerSelection = () => {
    if (tempSelectedCustomers.length > 0) {
      setSelectedCustomers(tempSelectedCustomers);
      setSelectedTarget('CUSTOM');
    }
    setShowCustomerModal(false);
  };

  // 가맹점 선택 상태에서 상세 필터(성별·연령)를 바꾸면 해당 가맹점 고객을 필터 기준으로 다시 뽑는다.
  // (이전엔 필터가 '전체 가맹점' 카운트에만 적용되고, 선택된 가맹점 명단은 그대로였음)
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    if (!selectedStore) return;
    let alive = true;
    (async () => {
      const filtered = await fetchAllCustomerIds(selectedStore.id);
      if (!alive) return;
      setSelectedCustomers(filtered);
      setSelectedTarget(filtered.length > 0 ? 'CUSTOM' : 'ALL');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, selectedAgeGroups]);

  // Search stores with debounce
  useEffect(() => {
    if (!showStoreModal) return;

    const debounce = setTimeout(() => {
      fetchStores(storeSearch);
    }, 300);

    return () => clearTimeout(debounce);
  }, [storeSearch, showStoreModal, fetchStores]);

  // Search customers with debounce
  useEffect(() => {
    if (!showCustomerModal || !selectedStore) return;

    const debounce = setTimeout(() => {
      fetchCustomers(selectedStore.id, customerSearch);
    }, 300);

    return () => clearTimeout(debounce);
  }, [customerSearch, showCustomerModal, selectedStore, fetchCustomers]);

  // Image delete handler
  const handleImageDelete = async () => {
    if (!uploadedImage) return;

    try {
      await fetch(`${API_BASE}/api/franchise/sms/delete-image`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ filename: uploadedImage.filename }),
      });

      setUploadedImage(null);
      setImageError(null);
      showToast('이미지가 삭제되었습니다.', 'success');
    } catch (error) {
      showToast('이미지 삭제에 실패했습니다.', 'error');
    }
  };

  // Test send message
  const handleTestSend = async () => {
    if (!messageContent.trim()) {
      showToast('메시지 내용을 입력해주세요.', 'error');
      return;
    }

    if (!testPhone.trim()) {
      showToast('전화번호를 입력해주세요.', 'error');
      return;
    }

    setIsTestSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/franchise/sms/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          phone: testPhone,
          content: messageContent,
          imageId: uploadedImage?.imageId || undefined,
          isAdMessage,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`테스트 발송 완료 (${data.messageType})`, 'success');
        setShowTestModal(false);
        setTestPhone('');
        fetchTestCount(); // 테스트 횟수 갱신
      } else {
        showToast(data.error || '테스트 발송 실패', 'error');
      }
    } catch (error) {
      showToast('테스트 발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsTestSending(false);
    }
  };

  // Send messages
  const handleSend = async () => {
    if (!messageContent.trim()) {
      showToast('메시지 내용을 입력해주세요.', 'error');
      return;
    }

    setIsSending(true);
    try {
      const body: any = {
        content: messageContent,
        targetType: selectedTarget,
        genderFilter: genderFilter !== 'all' ? genderFilter : undefined,
        ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : undefined,
        imageUrl: uploadedImage?.imageUrl || undefined,
        imageId: uploadedImage?.imageId || undefined, // SOLAPI 이미지 ID 전달
        isAdMessage,
        staffVerify: staffVerifyPayload(smsVerify),
        scheduledAt: sendTimeToIso(smsSendTime),
      };
      if (smsVerify.enabled && !smsVerify.couponContent.trim()) {
        showToast('직원 확인 쿠폰 내용을 입력해주세요.', 'error');
        setIsSending(false);
        return;
      }

      if (selectedTarget === 'CUSTOM') {
        body.customerIds = selectedCustomers.map(c => c.id);
      }
      if (selectedTarget === 'SEGMENT') {
        if (!selectedSegment) {
          showToast('고객 그룹을 선택해주세요.', 'error');
          setIsSending(false);
          return;
        }
        body.segmentId = selectedSegment.id;
      }

      const res = await fetch(`${API_BASE}/api/franchise/sms/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        const sentOrPending = data.sentCount || data.pendingCount || 0;
        const failedMsg = data.failedCount > 0 ? `, ${data.failedCount}건 실패` : '';
        const costMsg = data.totalCost ? ` (비용: ${formatNumber(data.totalCost)}원)` : '';
        showToast(data.message || `${sentOrPending}건 발송 요청 완료${failedMsg}${costMsg}`, 'success');
        bumpReservations();
        setMessageContent('');
        setUploadedImage(null);
        setImageError(null);
        setShowConfirmModal(false);
        setSelectedCustomers([]);
        setSelectedTarget('ALL');
        fetchTargetCounts();
        router.replace('/franchise/campaigns/retarget');
      } else {
        showToast(data.error || '발송 실패', 'error');
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // 쿠폰 알림톡 발송 (프랜차이즈 전 매장 대상, 각 고객 매장 정보로 발송)
  const handleCouponSend = async () => {
    if (!couponContent.trim() || !couponExpiryDate.trim()) {
      showToast('쿠폰 내용과 유효기간을 입력해주세요.', 'error');
      return;
    }
    if (getCurrentTargetCount() === 0) {
      showToast('발송 대상을 선택해주세요.', 'error');
      return;
    }
    if (getCurrentTargetCount() > 50000) {
      showToast('1회 발송 최대 50,000명입니다. 필터를 좁히거나 나눠 발송해 주세요.', 'error');
      return;
    }

    setIsCouponSending(true);
    try {
      const body: any = {
        couponContent: couponContent.trim(),
        expiryDate: couponExpiryDate.trim(),
        smsBody: couponSmsBody,
        scheduledAt: sendTimeToIso(couponSendTime),
        targetType: selectedTarget,
        genderFilter: genderFilter !== 'all' ? genderFilter : undefined,
        ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : undefined,
      };
      if (selectedTarget === 'CUSTOM') {
        body.customerIds = selectedCustomers.map((c) => c.id);
        if (body.customerIds.length === 0) {
          showToast('발송할 고객이 없습니다.', 'error');
          setIsCouponSending(false);
          return;
        }
      }
      if (selectedTarget === 'SEGMENT' && selectedSegment) {
        body.segmentId = selectedSegment.id;
      }

      const res = await fetch(`${API_BASE}/api/franchise/retarget-coupon/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        showToast(data.message || '쿠폰 문자가 발송되었습니다.', 'success');
        bumpReservations();
        setCouponContent('');
        setCouponExpiryDate('');
        fetchTargetCounts();
      } else {
        showToast(data.error || '발송에 실패했습니다.', 'error');
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsCouponSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[color:var(--ad-faint)]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:items-start gap-6 mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8 lg:justify-center">
      {ToastComponent}

      {/* Left Panel - Settings */}
      <div className="adm-card flex-1 lg:max-w-[720px] p-5 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-5 border-b border-[color:var(--ad-line)]">
          <h1 className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">캠페인 메시지 만들기</h1>
          <div className="flex max-w-full overflow-x-auto rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
            {([
              ['kakao', '카카오톡'],
              ['sms', '문자 (SMS/LMS)'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'h-8 whitespace-nowrap px-3 sm:px-4 text-[13px] font-medium rounded-[8px] transition-all',
                  activeTab === key
                    ? 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-[color:var(--ad-ink)]'
                    : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 예약된 발송 — 발송 2분 전까지 취소·환불 */}
        <ReservationsPanel apiUrl="/api/franchise/marketing-performance" tokenKey="franchiseToken" refreshKey={reservationKey} showToast={showToast} />

        {/* Target Selection */}
        <div className="flex flex-col gap-3">
          <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">발송 대상 선택</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => {
                setSelectedTarget('ALL');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-[12px] border text-left transition-all',
                selectedTarget === 'ALL'
                  ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                  : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              <span className="text-[12px] text-[color:var(--ad-muted)]">전체 고객</span>
              <div className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                {formatNumber(targetCounts.all)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('REVISIT');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-[12px] border text-left transition-all',
                selectedTarget === 'REVISIT'
                  ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                  : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              <span className="text-[12px] text-[color:var(--ad-muted)]">재방문 고객 (2회 이상)</span>
              <div className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                {formatNumber(targetCounts.revisit)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('NEW');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-[12px] border text-left transition-all',
                selectedTarget === 'NEW'
                  ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                  : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              <span className="text-[12px] text-[color:var(--ad-muted)]">신규 고객 (최근 30일)</span>
              <div className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                {formatNumber(targetCounts.new)}명
              </div>
            </button>
          </div>

          {/* Custom selection button */}
          <button
            onClick={openCustomerModal}
            className={cn(
              'p-3 rounded-[12px] border text-left transition-all flex items-center gap-2',
              selectedStore && selectedCustomers.length > 0
                ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[color:var(--ad-bg)] flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4 text-[color:var(--ad-muted)]" />
            </div>
            <div className="flex-1">
              <span className="text-[12px] text-[color:var(--ad-muted)]">가맹점별 고객 선택</span>
              <div className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                {selectedStore && selectedCustomers.length > 0
                  ? `${selectedStore.name} · ${formatNumber(selectedCustomers.length)}명`
                  : '가맹점 선택하기'}
              </div>
            </div>
            {selectedStore && selectedCustomers.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  resetStoreSelection();
                }}
              >
                선택 해제
              </Button>
            )}
          </button>

          {/* 고객 그룹으로 보내기 (전 가맹점 고객 기준) */}
          <SegmentPicker
            active={selectedTarget === 'SEGMENT'}
            selected={selectedSegment}
            onSelect={selectSegment}
            apiPath="/api/franchise/segments"
            tokenKey="franchiseToken"
            scopeLabel="전 가맹점 고객 기준"
          />

          {/* Filters — 고객 그룹 발송 시에는 그룹 조건이 대신 적용된다 */}
          {selectedTarget !== 'SEGMENT' && (
          <div className="mt-2">
            <label className="text-[12px] font-medium text-[color:var(--ad-muted)] mb-2 block">상세 필터</label>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <div className="flex flex-wrap gap-1.5">
                {['all', 'FEMALE', 'MALE'].map((gender) => (
                  <button
                    key={gender}
                    onClick={() => setGenderFilter(gender as any)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12px] border transition-all',
                      genderFilter === gender
                        ? 'bg-[color:var(--ad-ink)] border-[color:var(--ad-ink)] text-white font-medium'
                        : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                    )}
                  >
                    {gender === 'all' ? '전체 성별' : gender === 'FEMALE' ? '여성' : '남성'}
                  </button>
                ))}
              </div>

              <div className="hidden sm:block w-px bg-[color:var(--ad-line)] mx-1" />

              <div className="flex flex-wrap gap-1.5">
                {AGE_GROUP_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleAgeGroup(option.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12px] border transition-all',
                      selectedAgeGroups.includes(option.value)
                        ? 'bg-[color:var(--ad-ink)] border-[color:var(--ad-ink)] text-white font-medium'
                        : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {selectedAgeGroups.length === 0 && (
              <p className="text-[12px] text-[color:var(--ad-faint)] mt-1.5">연령대 미선택 시 전체 연령대로 발송됩니다</p>
            )}
          </div>
          )}
        </div>

        {/* SMS 탭 콘텐츠 */}
        {activeTab === 'sms' && (
          <>
            {/* Message Content */}
            <div className="flex flex-col gap-3 flex-1">
              <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                메시지 내용 입력
                <span className="font-normal text-[color:var(--ad-muted)] text-[12px] ml-1">(단문/장문 자동 전환)</span>
              </label>
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder={`[태그히어] 4월 봄맞이 이벤트 안내

안녕하세요 {고객명}님,
따뜻한 봄을 맞아 태그히어 강남본점에서 특별한 혜택을 준비했습니다.

[이벤트 혜택]
기간 내 방문 시 모든 메뉴 10% 할인

- 기간: 4/1 ~ 4/30
- 문의: 02-555-1234`}
                className="w-full h-[160px] px-3 py-2.5 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] resize-none focus:outline-none focus:border-[color:var(--ad-navy)] text-[13.5px] leading-relaxed placeholder:text-[color:var(--ad-faint)]"
              />

              {/* Image Upload */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">이미지 첨부</label>
                  <span className="text-[12px] text-[color:var(--ad-muted)]">(JPG, 최대 200KB, 1500×1440px 이하)</span>
                </div>

                {!uploadedImage ? (
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".jpg,.jpeg"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploading}
                      />
                      <div className={cn(
                        "flex items-center gap-2 h-9 px-3.5 border border-dashed border-[color:var(--ad-line-strong)] rounded-[10px] text-[13px] text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-ink)] hover:text-[color:var(--ad-ink)] transition-colors",
                        isUploading && "opacity-50 cursor-not-allowed"
                      )}>
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ImagePlus className="w-4 h-4" />
                        )}
                        <span>{isUploading ? '업로드 중...' : '이미지 추가'}</span>
                      </div>
                    </label>
                    <span className="text-[12px] text-[color:var(--ad-faint)]">이미지 첨부 시 MMS로 발송 (건당 120원)</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-[color:var(--ad-bg-alt)] rounded-[12px] border border-[color:var(--ad-line)]">
                    <img
                      src={`${API_BASE}${uploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-16 h-16 object-cover rounded-[8px]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[color:var(--ad-ink)] truncate">{uploadedImage.filename}</p>
                      <p className="text-[12px] text-[color:var(--ad-muted)] mt-1">
                        {uploadedImage.width} × {uploadedImage.height}px · {Math.round(uploadedImage.size / 1024)}KB
                      </p>
                      <span className="mt-1.5 inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">MMS (120원/건)</span>
                    </div>
                    <button
                      onClick={handleImageDelete}
                      className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] hover:bg-[#fff2f5] rounded-[8px] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {imageError && (
                  <div className="flex items-center gap-2 rounded-[12px] bg-[#fff2f5] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}
              </div>

              {/* 직원 확인 쿠폰 (마케팅 성과 추적) */}
              <StaffVerifyField value={smsVerify} onChange={setSmsVerify} />
            </div>

            {/* Cost Summary */}
            <div className="p-5 bg-[color:var(--ad-bg-alt)] rounded-[16px] border border-[color:var(--ad-line)]">
              {/* 예상 비용 + 현재 잔액 */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">예상 비용</p>
                  <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                    {formatNumber(estimate?.targetCount || getCurrentTargetCount())}명 × {formatNumber(estimate?.costPerMessage || (uploadedImage ? 110 : 50))}원 ={' '}
                    <span className="text-[color:var(--ad-ink)]">{formatNumber(estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))}원</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">현재 잔액</p>
                  <p className={`mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum ${estimate?.canSend !== false ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-neg)]'}`}>
                    {formatNumber(estimate?.walletBalance || 0)}원
                  </p>
                </div>
              </div>
              <div className="mb-3">
                <SendTimePicker value={smsSendTime} onChange={setSmsSendTime} adWindow={isAdMessage} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    disabled={!messageContent.trim()}
                    onClick={() => setShowTestModal(true)}
                    className="adm-press inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-[12px] bg-white px-4 text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    테스트 발송
                  </button>
                  <button
                    disabled={
                      !messageContent.trim() ||
                      getCurrentTargetCount() === 0 ||
                      (estimate !== null && !estimate.canSend) ||
                      !!sendTimeError(smsSendTime, isAdMessage)
                    }
                    onClick={() => setShowConfirmModal(true)}
                    className="adm-press inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {smsSendTime.mode === 'schedule' ? `${formatSendTime(smsSendTime)} 예약하기` : '메시지 발송하기'}
                  </button>
              </div>

              {/* 광고 메시지 여부 체크박스 */}
              <div className="mt-4 pt-4 border-t border-[color:var(--ad-line)]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdMessage}
                    onChange={(e) => setIsAdMessage(e.target.checked)}
                    className="w-4 h-4 rounded border-[color:var(--ad-line-strong)] text-[color:var(--ad-ink)] accent-[color:var(--ad-ink)] focus:ring-[color:var(--ad-ink)]"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">
                    광고 메시지로 발송 (체크 시 (광고) 표기 및 무료수신거부 자동 추가)
                  </span>
                </label>
                {!isAdMessage && (
                  <div className="mt-3 rounded-[12px] bg-[color:var(--ad-bg)] px-4 py-3">
                    <div className="flex items-start gap-2 text-[color:var(--ad-muted)]">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                      <p className="text-[12.5px] leading-relaxed">
                        광고 문자임에도 광고 표기 가이드라인을 지키지 않은 경우, 이용 약관에 의거해 예고 없이 계정이 차단될 수 있으며, 환불 또한 불가능합니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 예상 마케팅 효과 */}
              {(estimate?.targetCount || getCurrentTargetCount()) > 0 && (
                <div className="mt-4 pt-4 border-t border-[color:var(--ad-line)]">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[14px] font-semibold text-[color:var(--ad-ink)]">예상 마케팅 효과</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 방문율</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">3.2%</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 방문</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">
                        {Math.round((estimate?.targetCount || getCurrentTargetCount()) * 0.032).toLocaleString()}명
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 매출</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">
                        {(Math.round((estimate?.targetCount || getCurrentTargetCount()) * 0.032) * (estimate?.estimatedRevenue?.avgOrderValue || 25000)).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <p className="text-[12px] text-[color:var(--ad-faint)] mt-2">
                    * 업계 평균 방문율 3.2% 및 매장 평균 객단가 {(estimate?.estimatedRevenue?.avgOrderValue || 25000).toLocaleString()}원 기준
                  </p>
                </div>
              )}
            </div>

            {estimate && !estimate.canSend && (
              <p className="text-[13px] text-[color:var(--ad-neg)] text-center -mt-2">
                충전금이 부족합니다. 충전 후 발송해주세요.
              </p>
            )}
          </>
        )}

        {/* 카카오톡 탭 콘텐츠 (쿠폰 알림톡 — messages 페이지와 동일) */}
        {/* 카카오톡 — 형태 선택: 템플릿 기본형(쿠폰 알림톡) + 브랜드 메시지 8종 (전 가맹점 고객) */}
        {activeTab === 'kakao' && (
          <PremiumKakaoComposer
            leadingType={{
              name: '템플릿 기본형',
              tip: '쿠폰 문자로 발송',
              priceLabel: '건당 50원',
              selected: kakaoMode === 'ALIMTALK',
              onSelect: () => setKakaoMode('ALIMTALK'),
              content: (
                <>
            {/* Step 2: 쿠폰 정보 입력 */}
            <div className="flex flex-col gap-4">
              <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">3. 어떤 쿠폰을 보낼까요?</label>

              <AlimtalkSamples
                onPick={(content, expiry) => {
                  setCouponContent(content);
                  setCouponExpiryDate(expiry);
                }}
              />

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">쿠폰 내용</label>
                <input
                  type="text"
                  value={couponContent}
                  onChange={(e) => setCouponContent(e.target.value)}
                  placeholder="예: 아메리카노 1잔 무료"
                  className="w-full h-10 px-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">유효기간</label>
                <input
                  type="text"
                  value={couponExpiryDate}
                  onChange={(e) => setCouponExpiryDate(e.target.value)}
                  placeholder="예: 2025년 2월 28일까지"
                  className="w-full h-10 px-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
                />
              </div>

              {/* 문자 내용 — 기본 문구 / 직접 쓰기 ({매장명}은 고객마다 소속 매장명) */}
              <CouponSmsBodyField value={couponSmsBody} onChange={setCouponSmsBody} />

              <p className="text-[12px] text-[color:var(--ad-faint)]">
                * 길찾기 링크는 각 매장에 등록된 네이버 플레이스 URL로 자동 연결됩니다.
              </p>
            </div>

            {/* Step 3: Expected Effect & CTA */}
            <div className="p-5 bg-[color:var(--ad-bg-alt)] rounded-[16px] border border-[color:var(--ad-line)]">
              <div className="mb-4">
                <span className="text-[14px] font-semibold text-[color:var(--ad-ink)]">4. 쿠폰을 보내면 이런 효과가 예상돼요</span>
              </div>

              <div className="adm-card grid grid-cols-3 divide-x divide-[color:var(--ad-line)] mb-4 overflow-hidden">
                <div className="p-3 text-center">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">발송 비용</p>
                  <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                    {formatNumber(couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50))}원
                  </p>
                  <p className="text-[11px] text-[color:var(--ad-faint)]">
                    {formatNumber(getCurrentTargetCount())}명 × 50원
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">예상 사용</p>
                  <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                    {Math.max(1, Math.round(getCurrentTargetCount() * 0.05))}명
                  </p>
                  <p className="text-[11px] text-[color:var(--ad-faint)]">사용율 5%</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">예상 매출</p>
                  <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                    {formatNumber(Math.max(1, Math.round(getCurrentTargetCount() * 0.05)) * 25000)}원
                  </p>
                  <p className="text-[11px] text-[color:var(--ad-faint)]">객단가 2.5만원</p>
                </div>
              </div>

              <div className="mb-4 rounded-[12px] bg-[color:var(--ad-bg)] px-4 py-3 text-center">
                <p className="text-[13px] text-[color:var(--ad-ink)]">
                  <span className="font-semibold">1명만 사용해도</span> 투자 대비{' '}
                  <span className="font-semibold text-[color:var(--ad-ink)]">
                    {Math.round(25000 / Math.max(1, couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50)))}배
                  </span>{' '}
                  효과!
                </p>
              </div>

              <div className="flex items-center justify-between mb-4 text-[13px]">
                <span className="text-[color:var(--ad-muted)]">현재 잔액</span>
                <span className={`font-semibold adm-tnum ${(couponEstimate?.walletBalance ?? 0) >= (couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50)) ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-neg)]'}`}>
                  {formatNumber(couponEstimate?.walletBalance ?? 0)}원
                </span>
              </div>

              <div className="mb-4 text-[12px] text-[color:var(--ad-muted)] text-center px-2">
                1회 발송 최대 <span className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">50,000명</span>까지 가능합니다.
                {getCurrentTargetCount() > 50000 && (
                  <div className="mt-1 text-[color:var(--ad-neg)]">
                    현재 {formatNumber(getCurrentTargetCount())}명 → 필터를 좁히거나 나눠 발송해 주세요.
                  </div>
                )}
              </div>

              <div className="mb-3">
                <SendTimePicker value={couponSendTime} onChange={setCouponSendTime} />
              </div>
              <button
                disabled={
                  !couponContent.trim() ||
                  !couponExpiryDate.trim() ||
                  getCurrentTargetCount() === 0 ||
                  getCurrentTargetCount() > 50000 ||
                  isCouponSending ||
                  !!sendTimeError(couponSendTime, true)
                }
                onClick={handleCouponSend}
                className="adm-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCouponSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {couponSendTime.mode === 'schedule' ? `${formatSendTime(couponSendTime)} 예약하기` : '쿠폰 문자 발송하기'} ({formatNumber(couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50))}원)
                  </>
                )}
              </button>
            </div>
                </>
              ),
            }}
            type={premiumType}
            onTypeChange={(t) => {
              setPremiumType(t);
              setKakaoMode('BMS');
            }}
            content={premiumContent}
            onContentChange={(c) => setPremiumContents((prev) => ({ ...prev, [premiumType]: c }))}
            target={{
              targetType: selectedTarget,
              customerIds: selectedTarget === 'CUSTOM' ? selectedCustomers.map((c) => c.id) : undefined,
              segmentId: selectedTarget === 'SEGMENT' ? selectedSegment?.id : undefined,
              genderFilter: selectedTarget !== 'SEGMENT' && genderFilter !== 'all' ? genderFilter : undefined,
              ageGroups: selectedTarget !== 'SEGMENT' && selectedAgeGroups.length > 0 ? selectedAgeGroups : undefined,
            }}
            targetReady={(selectedTarget !== 'CUSTOM' || selectedCustomers.length > 0) && (selectedTarget !== 'SEGMENT' || !!selectedSegment)}
            showToast={showToast}
            onNeedCharge={() => router.push('/franchise/billing')}
            onSent={() => {
              setPremiumContents((prev) => ({ ...prev, [premiumType]: emptyContent(premiumType) }));
              bumpReservations();
            }}
            staffVerify={premiumVerify}
            onStaffVerifyChange={setPremiumVerify}
            onFooterName={setPremiumFooterName}
            apiBase="/api/franchise/premium-kakao"
            tokenKey="franchiseToken"
          />
        )}

        {/* (구) 브랜드 메시지 카카오 콘텐츠 — 비활성 (messages 페이지와 동일하게 쿠폰 알림톡 사용) */}
        {SHOW_LEGACY_KAKAO_UI && activeTab === 'kakao' && (
          <>
            {/* 메시지 타입 선택 */}
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">메시지 타입</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setKakaoMessageType('TEXT');
                    setKakaoUploadedImage(null);
                  }}
                  className={cn(
                    'p-4 rounded-[12px] border text-left transition-all',
                    kakaoMessageType === 'TEXT'
                      ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                      : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[13px] text-[color:var(--ad-ink)]">텍스트형</span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium adm-tnum text-[color:var(--ad-ink)]">200원/건</p>
                </button>
                <button
                  onClick={() => setKakaoMessageType('IMAGE')}
                  className={cn(
                    'p-4 rounded-[12px] border text-left transition-all',
                    kakaoMessageType === 'IMAGE'
                      ? 'border-[color:var(--ad-ink)] bg-white shadow-[0_0_0_1px_var(--ad-ink)]'
                      : 'border-[color:var(--ad-line)] bg-white hover:border-[color:var(--ad-line-strong)]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[13px] text-[color:var(--ad-ink)]">이미지형</span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium adm-tnum text-[color:var(--ad-ink)]">230원/건</p>
                </button>
              </div>
            </div>

            {/* 이미지 업로드 (이미지형 선택 시) */}
            {kakaoMessageType === 'IMAGE' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">이미지 첨부</label>
                </div>

                {/* 이미지 규격 안내 */}
                <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                  <p className="text-[12px] font-medium text-[color:var(--ad-ink-2)] mb-1.5">이미지 규격 안내</p>
                  <ul className="text-[12px] text-[color:var(--ad-muted)] space-y-0.5">
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
                        "flex items-center gap-2 h-9 px-3.5 border border-dashed border-[color:var(--ad-line-strong)] rounded-[10px] text-[13px] text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-ink)] hover:text-[color:var(--ad-ink)] transition-colors",
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
                  <div className="flex items-start gap-3 p-3 bg-[color:var(--ad-bg-alt)] rounded-[12px] border border-[color:var(--ad-line)]">
                    <img
                      src={`${API_BASE}${kakaoUploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-16 h-16 object-cover rounded-[8px]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[color:var(--ad-ink)] truncate">{kakaoUploadedImage.filename}</p>
                      <span className="mt-1.5 inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">이미지형 (230원/건)</span>
                    </div>
                    <button
                      onClick={handleKakaoImageDelete}
                      className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] hover:bg-[#fff2f5] rounded-[8px] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {kakaoImageError && (
                  <div className="flex items-center gap-2 rounded-[12px] bg-[#fff2f5] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{kakaoImageError}</span>
                  </div>
                )}
              </div>
            )}

            {/* 메시지 내용 */}
            <div className="flex flex-col gap-3 flex-1">
              <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                메시지 내용 입력
                <span className="font-normal text-[color:var(--ad-muted)] text-[12px] ml-1">({'{고객명}'} 사용 시 자동 치환)</span>
              </label>
              <textarea
                value={kakaoContent}
                onChange={(e) => setKakaoContent(e.target.value)}
                placeholder={`안녕하세요 {고객명}님!

따뜻한 봄을 맞아 특별한 혜택을 준비했습니다.

[이벤트 혜택]
기간 내 방문 시 모든 메뉴 10% 할인

- 기간: 4/1 ~ 4/30
- 문의: 02-555-1234`}
                className="w-full h-[140px] px-3 py-2.5 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] resize-none focus:outline-none focus:border-[color:var(--ad-navy)] text-[13.5px] leading-relaxed placeholder:text-[color:var(--ad-faint)]"
              />

              {/* 템플릿 선택 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setKakaoContent(`[매장명]에서 선물을 보냈어요.

🎁 단골 고객 혜택
- 음료 또는 디저트 서비스
- 적립 포인트 2배

언제든 편하게 들러주세요.
맛있는 음식으로 보답하겠습니다!`);
                  setKakaoButtons([
                    { type: 'WL', name: '네이버 길찾기', linkMo: '' },
                    { type: 'WL', name: '예약하기', linkMo: '' },
                  ]);
                }}
                className="adm-press inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                <MessageSquare className="w-4 h-4" />
                단골 고객 혜택 템플릿 사용하기
              </button>
            </div>

            {/* 버튼 추가 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                  버튼 추가
                  <span className="font-normal text-[color:var(--ad-muted)] text-[12px] ml-1">(최대 5개, 웹링크만)</span>
                </label>
                <button
                  onClick={addKakaoButton}
                  disabled={kakaoButtons.length >= 5}
                  className="flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  버튼 추가
                </button>
              </div>

              {kakaoButtons.length > 0 && (
                <div className="space-y-3">
                  {kakaoButtons.map((button, index) => (
                    <div key={index} className="p-4 bg-[color:var(--ad-bg-alt)] rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-medium text-[color:var(--ad-muted)]">버튼 {index + 1}</span>
                        <button
                          onClick={() => removeKakaoButton(index)}
                          className="p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] hover:bg-[#fff2f5] rounded-[6px] transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={button.name}
                          onChange={(e) => updateKakaoButton(index, 'name', e.target.value)}
                          placeholder="버튼명 (최대 14자)"
                          maxLength={14}
                          className="w-full h-10 px-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
                        />
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-[color:var(--ad-faint)] flex-shrink-0" />
                          <input
                            type="url"
                            value={button.linkMo}
                            onChange={(e) => updateKakaoButton(index, 'linkMo', e.target.value)}
                            placeholder="https://example.com"
                            className="flex-1 h-10 px-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost Summary */}
            <div className="p-5 bg-[color:var(--ad-bg-alt)] rounded-[16px] border border-[color:var(--ad-line)]">
              {/* 예상 비용 + 현재 잔액 */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">예상 비용</p>
                  <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum text-[color:var(--ad-ink)]">
                    {formatNumber(kakaoEstimate?.targetCount || getCurrentTargetCount())}명 × {kakaoMessageType === 'IMAGE' ? '230' : '200'}원 ={' '}
                    <span className="text-[color:var(--ad-ink)]">{formatNumber(kakaoEstimate?.totalCost || (getCurrentTargetCount() * (kakaoMessageType === 'IMAGE' ? 230 : 200)))}원</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">현재 잔액</p>
                  <p className={`mt-0.5 text-[20px] font-medium tracking-[-0.03em] adm-tnum ${kakaoEstimate?.canSend !== false ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-neg)]'}`}>
                    {formatNumber(kakaoEstimate?.walletBalance || 0)}원
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    disabled={!kakaoContent.trim()}
                    onClick={() => setShowKakaoTestModal(true)}
                    className="adm-press inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-[12px] bg-white px-4 text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    테스트 발송
                  </button>
                  <button
                    disabled={
                      !kakaoContent.trim() ||
                      getCurrentTargetCount() === 0 ||
                      (kakaoMessageType === 'IMAGE' && !kakaoUploadedImage) ||
                      (kakaoEstimate !== null && !kakaoEstimate.canSend)
                    }
                    onClick={() => setShowKakaoConfirmModal(true)}
                    className="adm-press inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    메시지 발송하기
                  </button>
              </div>

              {/* 야간 발송 안내 */}
              <p className="text-[12px] text-[color:var(--ad-faint)] text-center mt-2">
                * KST 기준 20:50 이후 발송 시, 다음날 08:00에 발송됩니다.
              </p>

              {/* 예상 마케팅 효과 */}
              {(kakaoEstimate?.targetCount || getCurrentTargetCount()) > 0 && (
                <div className="mt-4 pt-4 border-t border-[color:var(--ad-line)]">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[14px] font-semibold text-[color:var(--ad-ink)]">예상 마케팅 효과</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 방문율</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">4.6%</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 방문</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">
                        {Math.round((kakaoEstimate?.targetCount || getCurrentTargetCount()) * 0.046).toLocaleString()}명
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">예상 매출</p>
                      <p className="mt-0.5 text-[16px] font-medium tracking-[-0.02em] adm-tnum text-[color:var(--ad-ink)]">
                        {(Math.round((kakaoEstimate?.targetCount || getCurrentTargetCount()) * 0.046) * (kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000)).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <p className="text-[12px] text-[color:var(--ad-faint)] mt-2">
                    * 업계 평균 방문율 4.6% 및 매장 평균 객단가 {(kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000).toLocaleString()}원 기준
                  </p>
                </div>
              )}
            </div>

            {kakaoEstimate && !kakaoEstimate.canSend && (
              <p className="text-[13px] text-[color:var(--ad-neg)] text-center -mt-2">
                충전금이 부족합니다. 충전 후 발송해주세요.
              </p>
            )}
          </>
        )}
      </div>

      {/* Right Panel - Preview (데스크톱: 오른쪽 패널 / 모바일: 아래 “미리보기” 버튼 → 시트) */}
      {(['aside', 'sheet'] as const).map((mode) => {
        const inline = mode === 'sheet';
        const preview =
          activeTab === 'kakao' && kakaoMode === 'BMS' ? (
            <PremiumKakaoPreview type={premiumType} content={premiumContent} verifyButton={premiumVerify.enabled} footerName={premiumFooterName} inline={inline} />
          ) : (
            <div className={inline ? 'mx-auto w-full max-w-[360px]' : 'hidden flex-none w-[360px] self-start lg:block'}>
            <div className="rounded-[20px] bg-[color:var(--ad-bg)] p-5">
              <p className="text-center text-[13px] font-medium text-[color:var(--ad-muted)] mb-4">발송 메시지 미리보기</p>
              <div className="flex justify-center">
                {/* Phone Frame */}
                <IPhoneFrame screenClassName={activeTab === 'sms' ? 'bg-white' : 'bg-[#B2C7D9]'}>

                      {/* SMS Preview */}
                      {activeTab === 'sms' && (
                        <>
                          {/* iOS Header */}
                          <div className="flex items-center justify-between px-4 pt-1 pb-2 border-b border-[#e5e5ea]">
                            <ChevronLeft className="w-5 h-5 text-[#007aff]" />
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-8 h-8 bg-[#9ca3af] rounded-full flex items-center justify-center text-white">
                                <Users className="w-4 h-4" />
                              </div>
                              <span className="text-[11px] font-medium text-[#1e293b]">태그히어 CRM</span>
                            </div>
                            <div className="w-5" />
                          </div>

                          {/* Date badge */}
                          <div className="flex justify-center my-3">
                            <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">
                              오늘 오후 12:30
                            </span>
                          </div>

                          {/* Message Body */}
                          <div className="flex-1 px-3 overflow-y-auto">
                            <div className="flex justify-start">
                              <div className="bg-[#e5e5ea] text-[#1e293b] py-2.5 px-3 rounded-2xl rounded-bl-sm max-w-[85%] text-[12px] leading-[1.5]">
                                {/* 이미지 미리보기 */}
                                {uploadedImage && (
                                  <div className="mb-2 -mx-1 -mt-1">
                                    <img
                                      src={`${API_BASE}${uploadedImage.imageUrl}`}
                                      alt="첨부 이미지"
                                      className="w-full max-w-[180px] rounded-lg"
                                    />
                                  </div>
                                )}
                                {messageContent ? (
                                  <span className="whitespace-pre-wrap break-words">
                                    {messageContent.replace(/{고객명}/g, '{고객명}') + smsCouponPreview(smsVerify)}
                                  </span>
                                ) : (
                                  <span className="text-[#94a3b8]">메시지 미리보기</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Input Bar */}
                          <div className="py-2 px-3 bg-white border-t border-[#e5e5ea] flex items-center gap-2">
                            <Camera className="w-5 h-5 text-[#c7c7cc]" />
                            <div className="flex-1 h-8 border border-[#c7c7cc] rounded-full px-3 flex items-center text-[12px] text-[#c7c7cc]">
                              iMessage
                            </div>
                            <div className="w-6 h-6 bg-[#007aff] rounded-full flex items-center justify-center text-white">
                              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Kakao Preview - 쿠폰 알림톡 (messages 페이지와 동일) */}
                      {activeTab === 'kakao' && (
                        <CouponSmsPreview
                          couponStoreName={couponStoreName}
                          couponContent={couponContent}
                          couponExpiryDate={couponExpiryDate}
                          customBody={couponSmsBody}
                        />
                      )}

                      {/* (구) 브랜드 메시지 미리보기 — 비활성 */}
                      {SHOW_LEGACY_KAKAO_UI && activeTab === 'kakao' && (
                        <>
                          {/* KakaoTalk header */}
                          <div className="flex items-center justify-between px-4 pt-1 pb-2">
                            <ChevronLeft className="w-4 h-4 text-neutral-700" />
                            <span className="font-medium text-xs text-neutral-800">태그히어</span>
                            <div className="w-4" />
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
                                    <span className="text-[10px] font-medium text-neutral-800">브랜드 메시지</span>
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
                                      {kakaoContent ? (
                                        <p className="text-[11px] text-neutral-800 whitespace-pre-wrap break-words leading-[1.5]">
                                          {kakaoContent.replace(/{고객명}/g, '{고객명}')}
                                        </p>
                                      ) : (
                                        <p className="text-[11px] text-[#94a3b8]">메시지 미리보기</p>
                                      )}
                                    </div>

                                    {/* 버튼 */}
                                    {kakaoButtons.filter(b => b.name.trim()).length > 0 && (
                                      <div className="border-t border-neutral-200">
                                        {kakaoButtons.filter(b => b.name.trim()).map((button, index) => (
                                          <button
                                            key={index}
                                            className="w-full py-2 text-center text-[10px] font-medium text-neutral-800 bg-white hover:bg-neutral-50 transition-colors border-b border-neutral-200 last:border-b-0"
                                          >
                                            {button.name || '버튼'}
                                          </button>
                                        ))}
                                      </div>
                                    )}
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
                        </>
                      )}
                </IPhoneFrame>
              </div>
            </div>
            </div>
          );
        return inline ? <MobilePreviewSheet key={mode}>{preview}</MobilePreviewSheet> : <Fragment key={mode}>{preview}</Fragment>;
      })}

      {/* Confirm Modal */}
      <SendConfirmModal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        targetCount={estimate?.targetCount || getCurrentTargetCount()}
        messageTypeLabel={uploadedImage ? '멀티미디어 (MMS)' : isLongMessage ? '장문 (LMS)' : '단문 (SMS)'}
        totalCost={estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50))}
        isSending={isSending}
        onSend={handleSend}
      />

      {/* Store Selection Modal */}
      <Modal open={showStoreModal} onOpenChange={setShowStoreModal}>
        <ModalContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <ModalHeader>
            <ModalTitle>가맹점 선택</ModalTitle>
            <p className="text-[13px] text-[color:var(--ad-muted)] mt-1">
              SMS를 발송할 가맹점을 선택해주세요
            </p>
          </ModalHeader>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
              <input
                type="text"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="가맹점명으로 검색..."
                className="w-full h-10 pl-10 pr-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
              />
            </div>

            {/* Store list */}
            <div className="flex-1 overflow-y-auto border border-[color:var(--ad-line)] rounded-[12px] min-h-[300px]">
              {isLoadingStores ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[color:var(--ad-faint)]" />
                </div>
              ) : storeList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[13px] text-[color:var(--ad-faint)]">
                  <Store className="w-10 h-10 mb-2" strokeWidth={1.5} />
                  <p>가맹점이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--ad-line)]">
                  {storeList.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => selectStoreAndOpenCustomerModal(store)}
                      className="w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                    >
                      <div className="w-9 h-9 rounded-[10px] bg-[color:var(--ad-bg)] flex items-center justify-center flex-shrink-0">
                        <Store className="w-4 h-4 text-[color:var(--ad-muted)]" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">
                            {store.name}
                          </span>
                          {store.category && (
                            <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                              {getCategoryLabel(store.category)}
                            </span>
                          )}
                        </div>
                        {store.address && (
                          <div className="text-[12.5px] text-[color:var(--ad-muted)]">
                            {store.address}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[12px] text-[color:var(--ad-muted)]">고객 수</div>
                        <div className="text-[15px] font-medium adm-tnum text-[color:var(--ad-ink)]">
                          {formatNumber(store.customerCount)}명
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[color:var(--ad-faint)]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setShowStoreModal(false)}>
              취소
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Customer Selection Modal */}
      <Modal open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <ModalContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <ModalHeader>
            <ModalTitle>고객 선택</ModalTitle>
            {selectedStore && (
              <p className="text-[13px] text-[color:var(--ad-muted)] mt-1">
                {selectedStore.name} · 총 {selectedStore.customerCount}명
              </p>
            )}
          </ModalHeader>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="이름 또는 전화번호로 검색..."
                className="w-full h-10 pl-10 pr-3 border border-[color:var(--ad-line-strong)] bg-white rounded-[10px] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:outline-none focus:border-[color:var(--ad-navy)]"
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllCustomers}
                  disabled={customerList.length === 0 || isLoadingCustomers}
                >
                  {isLoadingCustomers && tempSelectedCustomers.length === 0 ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      로딩 중...
                    </>
                  ) : (
                    '전체 선택'
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAllCustomers}
                  disabled={tempSelectedCustomers.length === 0}
                >
                  전체 해제
                </Button>
              </div>
              <span className="text-[13px] text-[color:var(--ad-muted)]">
                {tempSelectedCustomers.length}명 선택됨
                {selectedStore && tempSelectedCustomers.length > 0 && (
                  <> / 총 {selectedStore.customerCount}명</>
                )}
              </span>
            </div>

            {/* Customer list */}
            <div className="flex-1 overflow-y-auto border border-[color:var(--ad-line)] rounded-[12px] min-h-[300px]">
              {isLoadingCustomers ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[color:var(--ad-faint)]" />
                </div>
              ) : customerList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[13px] text-[color:var(--ad-faint)]">
                  <Users className="w-10 h-10 mb-2" strokeWidth={1.5} />
                  <p>검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--ad-line)]">
                  {customerList.map((customer) => {
                    const isSelected = tempSelectedCustomers.some(c => c.id === customer.id);
                    return (
                      <button
                        key={customer.id}
                        onClick={() => toggleCustomerSelection(customer)}
                        className={cn(
                          'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                          isSelected ? 'bg-[color:var(--ad-bg)]' : 'hover:bg-[color:var(--ad-bg-alt)]'
                        )}
                      >
                        <div className={cn(
                          'w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'bg-[color:var(--ad-ink)] border-[color:var(--ad-ink)]'
                            : 'border-[color:var(--ad-line-strong)] bg-white'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                              {maskNickname(customer.name)}
                            </span>
                            {customer.gender && (
                              <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                                {customer.gender === 'MALE' ? '남' : '여'}
                              </span>
                            )}
                          </div>
                          <div className="text-[12.5px] text-[color:var(--ad-muted)] adm-tnum">
                            {customer.phone ? formatPhone(customer.phone) : ''}
                          </div>
                        </div>
                        <div className="text-right text-[12.5px] flex-shrink-0">
                          <div className="text-[color:var(--ad-muted)]">
                            방문 {customer.visitCount}회
                            {(customer.messageCount || 0) > 0 && (
                              <span className="ml-1 text-[color:var(--ad-faint)]">· 수신 {customer.messageCount}회</span>
                            )}
                          </div>
                          <div className="font-medium adm-tnum text-[color:var(--ad-ink)]">{formatNumber(customer.totalPoints)}P</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCustomerModal(false)}>
              취소
            </Button>
            <Button
              onClick={confirmCustomerSelection}
              disabled={tempSelectedCustomers.length === 0}
            >
              <Users className="w-4 h-4 mr-2" />
              {tempSelectedCustomers.length}명 선택 완료
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Test Send Modal */}
      <TestSendModal
        open={showTestModal}
        onOpenChange={setShowTestModal}
        testCount={testCount}
        testPhone={testPhone}
        onPhoneChange={setTestPhone}
        messageTypeLabel={uploadedImage ? 'MMS (이미지 포함)' : getByteLength(messageContent) > 90 ? 'LMS (장문)' : 'SMS (단문)'}
        byteLength={getByteLength(messageContent)}
        isTestSending={isTestSending}
        sendDisabled={isTestSending || !testPhone.trim() || !messageContent.trim() || testCount.remaining <= 0}
        onSend={handleTestSend}
      />

      {/* Kakao Confirm Modal */}
      <KakaoConfirmModal
        open={showKakaoConfirmModal}
        onOpenChange={setShowKakaoConfirmModal}
        targetCount={kakaoEstimate?.targetCount || getCurrentTargetCount()}
        messageTypeLabel={kakaoMessageType === 'IMAGE' ? '이미지형 (230원)' : '텍스트형 (200원)'}
        isSendableTime={isSendableTime}
        totalCost={kakaoEstimate?.totalCost || (getCurrentTargetCount() * (kakaoMessageType === 'IMAGE' ? 230 : 200))}
        isKakaoSending={isKakaoSending}
        onSend={handleKakaoSend}
      />

      {/* Kakao Test Send Modal */}
      <KakaoTestModal
        open={showKakaoTestModal}
        onOpenChange={setShowKakaoTestModal}
        testPhone={kakaoTestPhone}
        onPhoneChange={setKakaoTestPhone}
        messageTypeLabel={kakaoMessageType === 'IMAGE' ? '이미지형' : '텍스트형'}
        buttonCount={kakaoButtons.filter(b => b.name.trim()).length}
        isKakaoTestSending={isKakaoTestSending}
        sendDisabled={isKakaoTestSending || !kakaoTestPhone.trim() || !kakaoContent.trim()}
        onSend={handleKakaoTestSend}
      />
    </div>
  );
}
