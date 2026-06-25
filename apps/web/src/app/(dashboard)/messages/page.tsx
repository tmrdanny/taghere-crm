'use client';

import { API_BASE } from '@/lib/api-config';
import { AGE_GROUP_OPTIONS } from '@/lib/constants';
import { useState, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { formatNumber, maskNickname } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wifi,
  Battery,
  ImagePlus,
  X,
  AlertCircle,
  UserPlus,
  Trash2,
  Link,
  Clock,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChargeModal } from '@/components/ChargeModal';


import {
  TargetCounts,
  EstimatedRevenue,
  FreeCredits,
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
} from './types';
import { SendConfirmModal } from './SendConfirmModal';
import { MessagePreview } from './MessagePreview';
import { MessageHeader } from './MessageHeader';
import { TestSendModal } from './TestSendModal';
import { KakaoConfirmModal } from './KakaoConfirmModal';
import { KakaoTestModal } from './KakaoTestModal';
import { CustomerSelectModal } from './CustomerSelectModal';

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, ToastComponent } = useToast();

  // Tab state (카카오톡 우선)
  const [activeTab, setActiveTab] = useState<'sms' | 'kakao'>('kakao');

  // 리타겟 쿠폰 상태
  const [couponContent, setCouponContent] = useState('');
  const [couponExpiryDate, setCouponExpiryDate] = useState('');
  const [couponNaverPlaceUrl, setCouponNaverPlaceUrl] = useState('');
  const [couponStoreName, setCouponStoreName] = useState('');
  const [isCouponSending, setIsCouponSending] = useState(false);
  const [couponEstimate, setCouponEstimate] = useState<{
    targetCount: number;
    totalCost: number;
    walletBalance: number;
    canSend: boolean;
    freeCredits: { remaining: number; freeCount: number; paidCount: number };
  } | null>(null);

  // Target counts
  const [targetCounts, setTargetCounts] = useState<TargetCounts>({ all: 0, revisit: 0, new: 0 });
  const [selectedTarget, setSelectedTarget] = useState<'ALL' | 'REVISIT' | 'NEW' | 'CUSTOM'>('ALL');

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
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotalPages, setCustomerTotalPages] = useState(1);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

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

  // 충전 모달 상태
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);

  // 고급 설정 토글 상태
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Get auth token
  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('token') || 'dev-token';
  };

  // Parse selected customers from URL params
  useEffect(() => {
    const customersParam = searchParams.get('customers');
    if (customersParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(customersParam));
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedCustomers(parsed);
          setSelectedTarget('CUSTOM');
        }
      } catch (e) {
        console.error('Failed to parse customers param:', e);
      }
    }
  }, [searchParams]);

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
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId,
              amount: parseInt(amountParam),
            }),
          });

          if (res.ok) {
            showToast('충전이 완료되었습니다!', 'success');
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
        } finally {
          // URL 파라미터 제거
          router.replace('/messages');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router, showToast]);

  // Draft 저장/복원을 위한 localStorage 키
  const DRAFT_KEY = 'taghere-message-draft';

  // Draft 복원 (페이지 로드 시)
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.messageContent) setMessageContent(draft.messageContent);
        if (draft.kakaoContent) setKakaoContent(draft.kakaoContent);
        if (draft.activeTab) setActiveTab(draft.activeTab);
        if (draft.selectedTarget && !searchParams.get('customers')) {
          setSelectedTarget(draft.selectedTarget);
        }
        if (draft.genderFilter) setGenderFilter(draft.genderFilter);
        if (draft.selectedAgeGroups) setSelectedAgeGroups(draft.selectedAgeGroups);
        if (draft.isAdMessage !== undefined) setIsAdMessage(draft.isAdMessage);
        if (draft.kakaoMessageType) setKakaoMessageType(draft.kakaoMessageType);
        if (draft.kakaoButtons) setKakaoButtons(draft.kakaoButtons);
      } catch (e) {
        console.error('Failed to restore draft:', e);
      }
    }
  }, []);

  // Draft 자동 저장 (debounce 500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = {
        messageContent,
        kakaoContent,
        activeTab,
        selectedTarget,
        genderFilter,
        selectedAgeGroups,
        isAdMessage,
        kakaoMessageType,
        kakaoButtons,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 500);
    return () => clearTimeout(timer);
  }, [messageContent, kakaoContent, activeTab, selectedTarget, genderFilter, selectedAgeGroups, isAdMessage, kakaoMessageType, kakaoButtons]);

  // Draft 삭제 함수
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  // 쿠폰 설정 불러오기 (매장명, 네이버 플레이스 URL)
  useEffect(() => {
    const fetchCouponSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/retarget-coupon/settings`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCouponStoreName(data.storeName || '');
          setCouponNaverPlaceUrl(data.naverPlaceUrl || '');
        }
      } catch (error) {
        console.error('Failed to fetch coupon settings:', error);
      }
    };
    fetchCouponSettings();
  }, []);

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

      const url = `${API_BASE}/api/sms/target-counts${params.toString() ? '?' + params.toString() : ''}`;
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

      const res = await fetch(`${API_BASE}/api/sms/estimate?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setEstimate(data);
      }
    } catch (error) {
      console.error('Failed to fetch estimate:', error);
    }
  }, [messageContent, selectedTarget, selectedCustomers, genderFilter, selectedAgeGroups, uploadedImage]);

  // Fetch test count
  const fetchTestCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sms/test-count`, {
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

  // 쿠폰 알림톡 비용 예상 조회
  const fetchCouponEstimate = useCallback(async () => {
    const targetCount = getCurrentTargetCount();
    if (targetCount === 0) {
      setCouponEstimate(null);
      return;
    }

    try {
      const params = new URLSearchParams({ targetCount: String(targetCount) });

      const res = await fetch(`${API_BASE}/api/retarget-coupon/estimate?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCouponEstimate(data);
      }
    } catch (error) {
      console.error('Failed to fetch coupon estimate:', error);
    }
  }, [selectedTarget, selectedCustomers, targetCounts, genderFilter, selectedAgeGroups]);

  // 쿠폰 탭에서 타겟 변경 시 estimate 조회
  useEffect(() => {
    if (activeTab === 'kakao') {
      fetchCouponEstimate();
    }
  }, [activeTab, fetchCouponEstimate]);

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
        trackEvent('owner_message_test_send', { channel: 'kakao' });
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
        trackEvent('owner_message_send', { channel: 'kakao', target_type: selectedTarget, target_count: data.pendingCount || 0, has_image: !!kakaoUploadedImage });
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
        clearDraft();
        setSelectedTarget('ALL');
        fetchTargetCounts();
        router.replace('/messages');
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
      await Promise.all([fetchTestCount(), fetchTargetCounts(), checkSendableTime()]);
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

  const byteLength = getByteLength(messageContent);
  const isLongMessage = byteLength > 90;

  // Get current target count
  const getCurrentTargetCount = () => {
    if (selectedTarget === 'CUSTOM') return selectedCustomers.length;
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

        const res = await fetch(`${API_BASE}/api/sms/upload-image`, {
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

  // Fetch customers for modal
  const fetchCustomers = useCallback(async (search?: string, page = 1) => {
    setIsLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('page', String(page));
      params.set('limit', '100');

      const res = await fetch(`${API_BASE}/api/customers?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        // 전화번호 있는 고객만 필터링
        const customersWithPhone = (data.customers || []).filter((c: CustomerListItem) => c.phone);
        setCustomerList(customersWithPhone);
        setCustomerTotalCount(data.pagination?.total || data.total || 0);
        setCustomerTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, []);

  // Open customer modal
  const openCustomerModal = () => {
    setTempSelectedCustomers([...selectedCustomers]);
    setCustomerSearch('');
    setCustomerPage(1);
    setShowCustomerModal(true);
    fetchCustomers('', 1);
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

  // Select all customers (all pages)
  const selectAllCustomers = async () => {
    if (customerTotalPages <= 1) {
      // 1페이지뿐이면 현재 리스트에서 바로 선택
      const allCustomers = customerList.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      }));
      setTempSelectedCustomers(allCustomers);
      return;
    }

    // 여러 페이지면 전체 고객 조회
    setIsSelectingAll(true);
    try {
      const params = new URLSearchParams();
      if (customerSearch) {
        params.set('search', customerSearch);
      }
      params.set('limit', '10000');

      const res = await fetch(`${API_BASE}/api/customers?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        const allWithPhone = (data.customers || [])
          .filter((c: CustomerListItem) => c.phone)
          .map((c: CustomerListItem) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
          }));
        setTempSelectedCustomers(allWithPhone);
      }
    } catch (error) {
      console.error('Failed to fetch all customers:', error);
    } finally {
      setIsSelectingAll(false);
    }
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

  // Search customers with debounce
  useEffect(() => {
    if (!showCustomerModal) return;

    const debounce = setTimeout(() => {
      fetchCustomers(customerSearch, customerPage);
    }, 300);

    return () => clearTimeout(debounce);
  }, [customerSearch, customerPage, showCustomerModal, fetchCustomers]);

  // Image delete handler
  const handleImageDelete = async () => {
    if (!uploadedImage) return;

    try {
      await fetch(`${API_BASE}/api/sms/delete-image`, {
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
      const res = await fetch(`${API_BASE}/api/sms/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          phone: testPhone,
          content: messageContent,
          imageId: uploadedImage?.imageId || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        trackEvent('owner_message_test_send', { channel: 'sms' });
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
      };

      if (selectedTarget === 'CUSTOM') {
        body.customerIds = selectedCustomers.map(c => c.id);
      }

      const res = await fetch(`${API_BASE}/api/sms/send`, {
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
        trackEvent('owner_message_send', { channel: 'sms', target_type: selectedTarget, target_count: sentOrPending, has_image: !!uploadedImage });
        const failedMsg = data.failedCount > 0 ? `, ${data.failedCount}건 실패` : '';
        const costMsg = data.totalCost ? ` (비용: ${formatNumber(data.totalCost)}원)` : '';
        showToast(`${sentOrPending}건 발송 요청 완료${failedMsg}${costMsg}`, 'success');
        setMessageContent('');
        setUploadedImage(null);
        setImageError(null);
        setShowConfirmModal(false);
        setSelectedCustomers([]);
        setSelectedTarget('ALL');
        clearDraft();
        fetchTargetCounts();
        router.replace('/messages');
      } else {
        showToast(data.error || '발송 실패', 'error');
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:items-start p-4 md:p-6 gap-6 max-w-[1200px] mx-auto w-full lg:justify-center">
      {ToastComponent}

      {/* Left Panel - Settings */}
      <div className="flex-1 lg:max-w-[720px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 md:p-6 flex flex-col gap-6">
        {/* Header */}
        <MessageHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          targetCount={getCurrentTargetCount()}
          freeCreditsRemaining={estimate?.freeCredits?.remaining}
        />

        {/* Step 1: Target Selection */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-[#1e293b]">1. 누구에게 보낼까요?</label>
            <button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#3b82f6] transition-colors"
            >
              고급 설정
              {showAdvancedSettings ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => {
                setSelectedTarget('ALL');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                selectedTarget === 'ALL'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <div className="text-2xl font-bold text-[#1e293b]">
                {formatNumber(targetCounts.all)}
              </div>
              <span className="text-xs text-[#64748b]">전체</span>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('REVISIT');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                selectedTarget === 'REVISIT'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <div className="text-2xl font-bold text-[#1e293b]">
                {formatNumber(targetCounts.revisit)}
              </div>
              <span className="text-xs text-[#64748b]">재방문</span>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('NEW');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                selectedTarget === 'NEW'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <div className="text-2xl font-bold text-[#1e293b]">
                {formatNumber(targetCounts.new)}
              </div>
              <span className="text-xs text-[#64748b]">신규</span>
            </button>
          </div>

          {/* Advanced Settings (collapsed by default) */}
          {showAdvancedSettings && (
            <div className="mt-3 p-4 bg-[#f8fafc] rounded-xl border border-[#e5e7eb] space-y-4">
              {/* Custom selection button */}
              <div>
                <label className="text-xs font-medium text-[#64748b] mb-2 block">고객 직접 선택</label>
                <button
                  onClick={openCustomerModal}
                  className={cn(
                    'w-full p-3 rounded-lg border text-left transition-all flex items-center gap-2',
                    selectedTarget === 'CUSTOM' && selectedCustomers.length > 0
                      ? 'border-[#3b82f6] bg-[#eff6ff]'
                      : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-4 h-4 text-[#64748b]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#1e293b]">
                      {selectedTarget === 'CUSTOM' && selectedCustomers.length > 0
                        ? `${formatNumber(selectedCustomers.length)}명 선택됨`
                        : '고객 선택하기'}
                    </div>
                  </div>
                  {selectedTarget === 'CUSTOM' && selectedCustomers.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomers([]);
                        setSelectedTarget('ALL');
                        router.replace('/messages');
                      }}
                    >
                      해제
                    </Button>
                  )}
                </button>
              </div>

              {/* Filters */}
              <div>
                <label className="text-xs font-medium text-[#64748b] mb-2 block">성별/연령대 필터</label>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {['all', 'FEMALE', 'MALE'].map((gender) => (
                      <button
                        key={gender}
                        onClick={() => setGenderFilter(gender as any)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-all',
                          genderFilter === gender
                            ? 'bg-[#eff6ff] border-[#3b82f6] text-[#3b82f6] font-semibold'
                            : 'border-[#e5e7eb] bg-white text-[#1e293b] hover:border-[#d1d5db]'
                        )}
                      >
                        {gender === 'all' ? '전체' : gender === 'FEMALE' ? '여성' : '남성'}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AGE_GROUP_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => toggleAgeGroup(option.value)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-all',
                          selectedAgeGroups.includes(option.value)
                            ? 'bg-[#eff6ff] border-[#3b82f6] text-[#3b82f6] font-semibold'
                            : 'border-[#e5e7eb] bg-white text-[#1e293b] hover:border-[#d1d5db]'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SMS 탭 콘텐츠 */}
        {activeTab === 'sms' && (
          <>
            {/* Step 2: Message Content */}
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-[#1e293b]">2. 어떤 메시지를 보낼까요?</label>

              {/* Template Selection - More Prominent */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMessageContent(`#{매장명}입니다.
지난번 방문해주셔서 감사해요! 이번 주에만 재방문 혜택 드릴게요.
• 혜택: #{재방문혜택}
• 기간: #{이벤트기간}
• 사용: 결제 전에 이 문자 보여주세요

길찾기: #{길찾기링크}`)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-center transition-all hover:border-[#3b82f6] hover:bg-[#eff6ff]',
                    messageContent.includes('재방문 혜택')
                      ? 'border-[#3b82f6] bg-[#eff6ff]'
                      : 'border-[#e5e7eb] bg-white'
                  )}
                >
                  <div className="text-sm font-semibold text-[#1e293b]">재방문</div>
                  <div className="text-xs text-[#64748b]">이벤트</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMessageContent(`#{매장명}입니다.
신메뉴 #{신메뉴명} 나왔어요! 솔직한 평가 부탁드려요.
• 신메뉴: #{신메뉴명}
• 혜택: #{신메뉴이벤트혜택}
• 기간: #{이벤트기간}

길찾기: #{길찾기링크}`)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-center transition-all hover:border-[#3b82f6] hover:bg-[#eff6ff]',
                    messageContent.includes('신메뉴')
                      ? 'border-[#3b82f6] bg-[#eff6ff]'
                      : 'border-[#e5e7eb] bg-white'
                  )}
                >
                  <div className="text-sm font-semibold text-[#1e293b]">신메뉴</div>
                  <div className="text-xs text-[#64748b]">안내</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMessageContent(`#{손님이름}님, #{매장명}입니다.
#{지역}에 새 매장 오픈했어요!
• 오픈일: #{오픈일}
• 주소: #{신규매장주소}
• 혜택: #{오픈혜택}

길찾기: #{길찾기링크}`)}
                  className={cn(
                    'p-4 rounded-xl border-2 text-center transition-all hover:border-[#3b82f6] hover:bg-[#eff6ff]',
                    messageContent.includes('새 매장 오픈')
                      ? 'border-[#3b82f6] bg-[#eff6ff]'
                      : 'border-[#e5e7eb] bg-white'
                  )}
                >
                  <div className="text-sm font-semibold text-[#1e293b]">오픈</div>
                  <div className="text-xs text-[#64748b]">알림</div>
                </button>
              </div>

              {/* Direct Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#64748b]">또는 직접 작성</span>
                  <span className="text-xs text-[#94a3b8]">
                    {messageContent.length > 0 && (uploadedImage ? 'MMS' : messageContent.length > 90 ? 'LMS' : 'SMS')}
                  </span>
                </div>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  className="w-full h-[120px] p-4 border border-[#e5e7eb] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent text-sm leading-relaxed"
                />
              </div>

              {/* Image Upload - Simplified */}
              <div className="flex items-center gap-3">
                {!uploadedImage ? (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".jpg,.jpeg"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-2.5 border border-dashed border-[#d1d5db] rounded-xl text-sm text-[#64748b] hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors",
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
                ) : (
                  <div className="flex items-center gap-3 p-2 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
                    <img
                      src={`${API_BASE}${uploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-10 h-10 object-cover rounded-lg"
                    />
                    <span className="text-sm text-[#1e293b]">이미지 첨부됨</span>
                    <button
                      onClick={handleImageDelete}
                      className="p-1 text-[#94a3b8] hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {uploadedImage && (
                  <span className="text-xs text-[#64748b]">MMS로 발송됩니다</span>
                )}
              </div>

              {imageError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{imageError}</span>
                </div>
              )}
            </div>

            {/* Step 3: Expected Effect & CTA */}
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-blue-50 rounded-2xl border border-emerald-100">
              {/* ROI 강조 메시지 */}
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span className="text-base font-bold text-emerald-800">3. 발송하면 이런 효과가 예상돼요</span>
              </div>

              {/* 효과 예측 카드 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/80 rounded-xl p-3 text-center">
                  <p className="text-xs text-[#64748b]">발송 비용</p>
                  <p className="text-lg font-bold text-[#1e293b]">
                    {formatNumber(estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))}원
                  </p>
                  {estimate?.freeCredits && estimate.freeCredits.freeCount > 0 ? (
                    <p className="text-[10px] text-emerald-600 font-medium">
                      무료 {estimate.freeCredits.freeCount}건 + 유료 {estimate.freeCredits.paidCount}건
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#94a3b8]">
                      {formatNumber(getCurrentTargetCount())}명 × {uploadedImage ? 110 : 50}원
                    </p>
                  )}
                </div>
                <div className="bg-white/80 rounded-xl p-3 text-center">
                  <p className="text-xs text-[#64748b]">예상 방문</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {Math.max(1, Math.round(getCurrentTargetCount() * 0.032))}명
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">방문율 3.2%</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 text-center">
                  <p className="text-xs text-[#64748b]">예상 매출</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatNumber(Math.max(1, Math.round(getCurrentTargetCount() * 0.032)) * 25000)}원
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">객단가 2.5만원</p>
                </div>
              </div>

              {/* ROI 강조 */}
              <div className="bg-emerald-100/50 rounded-lg px-4 py-2 mb-4 text-center">
                <p className="text-sm text-emerald-800">
                  <span className="font-bold">1명만 방문해도</span> 투자 대비{' '}
                  <span className="font-bold text-emerald-700">
                    {Math.round(25000 / Math.max(1, (estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))))}배
                  </span>{' '}
                  효과!
                </p>
              </div>

              {/* 잔액 + 충전 */}
              <div className="flex items-center justify-between mb-4 text-sm">
                <span className="text-[#64748b]">현재 잔액</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${(estimate?.walletBalance || 0) >= (estimate?.totalCost || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatNumber(estimate?.walletBalance || 0)}원
                  </span>
                  {(estimate?.walletBalance || 0) < (estimate?.totalCost || (getCurrentTargetCount() * 50)) && (
                    <button
                      onClick={() => setIsChargeModalOpen(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      충전하기
                    </button>
                  )}
                </div>
              </div>

              {/* CTA 버튼 */}
              <button
                disabled={
                  !messageContent.trim() ||
                  getCurrentTargetCount() === 0 ||
                  (estimate !== null && !estimate.canSend)
                }
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-4 bg-[#2a2d62] text-white rounded-xl text-lg font-bold hover:bg-[#1d1f45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                메시지 발송하기 ({formatNumber(estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))}원)
              </button>

              {/* 테스트 발송 링크 */}
              <button
                disabled={!messageContent.trim()}
                onClick={() => setShowTestModal(true)}
                className="w-full mt-2 py-2 text-sm text-[#64748b] hover:text-[#3b82f6] transition-colors disabled:opacity-50"
              >
                내 번호로 테스트 발송해보기
              </button>

              {/* 광고 메시지 체크박스 - 간소화 */}
              <div className="mt-4 pt-4 border-t border-emerald-200/50">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[#64748b]">
                  <input
                    type="checkbox"
                    checked={isAdMessage}
                    onChange={(e) => setIsAdMessage(e.target.checked)}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#3b82f6] focus:ring-[#3b82f6]"
                  />
                  광고 메시지로 발송 (자동 표기 추가)
                </label>
              </div>
            </div>
          </>
        )}

        {/* 카카오톡 탭 콘텐츠 - 쿠폰 알림톡 */}
        {activeTab === 'kakao' && (
          <>
            {/* Step 2: 쿠폰 정보 입력 */}
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-[#1e293b]">2. 어떤 쿠폰을 보낼까요?</label>

              {/* 쿠폰 내용 */}
              <div>
                <label className="text-xs text-[#64748b] mb-1.5 block">쿠폰 내용</label>
                <input
                  type="text"
                  value={couponContent}
                  onChange={(e) => setCouponContent(e.target.value)}
                  placeholder="예: 아메리카노 1잔 무료"
                  className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                />
              </div>

              {/* 유효기간 */}
              <div>
                <label className="text-xs text-[#64748b] mb-1.5 block">유효기간</label>
                <input
                  type="text"
                  value={couponExpiryDate}
                  onChange={(e) => setCouponExpiryDate(e.target.value)}
                  placeholder="예: 2025년 2월 28일까지"
                  className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                />
              </div>

              {/* 네이버 플레이스 URL - 선택사항 표시 */}
              {showAdvancedSettings && (
                <div>
                  <label className="text-xs text-[#64748b] mb-1.5 block">
                    네이버 플레이스 URL (선택)
                  </label>
                  <input
                    type="url"
                    value={couponNaverPlaceUrl}
                    onChange={(e) => setCouponNaverPlaceUrl(e.target.value)}
                    placeholder="https://naver.me/..."
                    className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                  />
                  <p className="text-xs text-[#94a3b8] mt-1">
                    설정 페이지에서 등록한 URL이 자동으로 사용됩니다
                  </p>
                </div>
              )}
            </div>

            {/* Step 3: Expected Effect & CTA */}
            <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200">
              {/* ROI 강조 메시지 */}
              <div className="mb-4">
                <span className="text-base font-semibold text-neutral-800">3. 쿠폰을 보내면 이런 효과가 예상돼요</span>
              </div>

              {/* 효과 예측 카드 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-xl p-3 text-center border border-neutral-100">
                  <p className="text-xs text-[#64748b]">발송 비용</p>
                  <p className="text-lg font-bold text-[#1e293b]">
                    {formatNumber(couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50))}원
                  </p>
                  {couponEstimate?.freeCredits && couponEstimate.freeCredits.freeCount > 0 ? (
                    <p className="text-[10px] text-emerald-600 font-medium">
                      무료 {couponEstimate.freeCredits.freeCount}건 + 유료 {couponEstimate.freeCredits.paidCount}건
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#94a3b8]">
                      {formatNumber(getCurrentTargetCount())}명 × 50원
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl p-3 text-center border border-neutral-100">
                  <p className="text-xs text-[#64748b]">예상 사용</p>
                  <p className="text-lg font-bold text-brand-600">
                    {Math.max(1, Math.round(getCurrentTargetCount() * 0.05))}명
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">사용율 5%</p>
                </div>
                <div className="bg-white rounded-xl p-3 text-center border border-neutral-100">
                  <p className="text-xs text-[#64748b]">예상 매출</p>
                  <p className="text-lg font-bold text-brand-600">
                    {formatNumber(Math.max(1, Math.round(getCurrentTargetCount() * 0.05)) * 25000)}원
                  </p>
                  <p className="text-[10px] text-[#94a3b8]">객단가 2.5만원</p>
                </div>
              </div>

              {/* ROI 강조 */}
              <div className="bg-brand-50 rounded-lg px-4 py-2 mb-4 text-center">
                <p className="text-sm text-brand-700">
                  <span className="font-bold">1명만 사용해도</span> 투자 대비{' '}
                  <span className="font-bold text-brand-600">
                    {Math.round(25000 / Math.max(1, couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50)))}배
                  </span>{' '}
                  효과!
                </p>
              </div>

              {/* 잔액 + 충전 */}
              <div className="flex items-center justify-between mb-4 text-sm">
                <span className="text-[#64748b]">현재 잔액</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${(couponEstimate?.walletBalance ?? estimate?.walletBalance ?? 0) >= (couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50)) ? 'text-brand-600' : 'text-red-600'}`}>
                    {formatNumber(couponEstimate?.walletBalance ?? estimate?.walletBalance ?? 0)}원
                  </span>
                  {(couponEstimate?.walletBalance ?? estimate?.walletBalance ?? 0) < (couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50)) && (
                    <button
                      onClick={() => setIsChargeModalOpen(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      충전하기
                    </button>
                  )}
                </div>
              </div>

              {/* 1회 발송 한도 안내 */}
              <div className="text-xs text-[#64748b] text-center px-2">
                1회 발송 최대 <span className="font-semibold text-[#1e293b]">3,000명</span>까지 가능합니다.
                {getCurrentTargetCount() > 3000 && (
                  <div className="mt-1 text-[#ef4444]">
                    현재 {formatNumber(getCurrentTargetCount())}명 → 필터를 좁히거나 나눠 발송해 주세요.
                  </div>
                )}
              </div>

              {/* CTA 버튼 */}
              <button
                disabled={
                  !couponContent.trim() ||
                  !couponExpiryDate.trim() ||
                  getCurrentTargetCount() === 0 ||
                  getCurrentTargetCount() > 3000 ||
                  isCouponSending
                }
                onClick={async () => {
                  if (!couponContent.trim() || !couponExpiryDate.trim()) {
                    showToast('쿠폰 내용과 유효기간을 입력해주세요.', 'error');
                    return;
                  }
                  if (getCurrentTargetCount() === 0) {
                    showToast('발송 대상을 선택해주세요.', 'error');
                    return;
                  }
                  // 1회 발송 최대 인원 안내 (서버 캡과 동일)
                  if (getCurrentTargetCount() > 3000) {
                    showToast('1회 발송 최대 3,000명입니다. 필터를 좁히거나 나눠 발송해 주세요.', 'error');
                    return;
                  }

                  setIsCouponSending(true);
                  try {
                    const token = localStorage.getItem('token');

                    // 발송 본문 구성: 서버에서 targetType + 필터로 대상 고객을 직접 해소
                    // (예전엔 프론트가 /api/customers 로 ID를 미리 끌어왔는데 limit 미지정으로 50명에서 잘리는 버그가 있었음)
                    const body: any = {
                      couponContent: couponContent.trim(),
                      expiryDate: couponExpiryDate.trim(),
                      naverPlaceUrl: couponNaverPlaceUrl.trim() || null,
                      targetType: selectedTarget,
                      genderFilter: genderFilter !== 'all' ? genderFilter : undefined,
                      ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : undefined,
                    };
                    if (selectedTarget === 'CUSTOM') {
                      body.customerIds = selectedCustomers.map(c => c.id);
                      if (body.customerIds.length === 0) {
                        showToast('발송할 고객이 없습니다.', 'error');
                        return;
                      }
                    }

                    const sendRes = await fetch(`${API_BASE}/api/retarget-coupon/send`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify(body),
                    });

                    const result = await sendRes.json();
                    if (sendRes.ok) {
                      showToast(result.message || '쿠폰 알림톡이 발송되었습니다.', 'success');
                      setCouponContent('');
                      setCouponExpiryDate('');
                    } else {
                      showToast(result.error || '발송에 실패했습니다.', 'error');
                    }
                  } catch (error) {
                    console.error('Failed to send coupon:', error);
                    showToast('발송 중 오류가 발생했습니다.', 'error');
                  } finally {
                    setIsCouponSending(false);
                  }
                }}
                className="w-full py-4 bg-[#2a2d62] text-white rounded-xl text-lg font-bold hover:bg-[#1d1f45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCouponSending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    쿠폰 알림톡 발송하기 ({formatNumber(couponEstimate?.totalCost ?? (getCurrentTargetCount() * 50))}원)
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Preview (hidden on mobile) */}
      <MessagePreview
        activeTab={activeTab}
        uploadedImage={uploadedImage}
        messageContent={messageContent}
        isAdMessage={isAdMessage}
        couponStoreName={couponStoreName}
        couponContent={couponContent}
        couponExpiryDate={couponExpiryDate}
      />

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

      {/* Customer Selection Modal */}
      <CustomerSelectModal
        open={showCustomerModal}
        onOpenChange={setShowCustomerModal}
        customerSearch={customerSearch}
        onSearchChange={(value) => { setCustomerSearch(value); setCustomerPage(1); }}
        customerList={customerList}
        tempSelectedCustomers={tempSelectedCustomers}
        isLoadingCustomers={isLoadingCustomers}
        isSelectingAll={isSelectingAll}
        onSelectAll={selectAllCustomers}
        onDeselectAll={deselectAllCustomers}
        onToggle={toggleCustomerSelection}
        customerPage={customerPage}
        customerTotalPages={customerTotalPages}
        onPageChange={setCustomerPage}
        onConfirm={confirmCustomerSelection}
      />

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

      {/* 충전 모달 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onSuccess={() => {
          setIsChargeModalOpen(false);
        }}
        currentBalance={activeTab === 'kakao' ? (kakaoEstimate?.walletBalance || 0) : (estimate?.walletBalance || 0)}
        requiredAmount={activeTab === 'kakao' ? (kakaoEstimate?.totalCost || 0) : (estimate?.totalCost || 0)}
        successRedirectPath="/messages"
      />
    </div>
  );
}
