'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatNumber, formatPhone, maskNickname } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 연령대 옵션 (local-customers와 동일)
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

interface TargetCounts {
  all: number;
  revisit: number;
  new: number;
}

interface EstimatedRevenue {
  avgOrderValue: number;
  conversionRate: number;
  expectedVisits: number;
  expectedRevenue: number;
}

interface Estimate {
  targetCount: number;
  byteLength: number;
  messageType: 'SMS' | 'LMS' | 'MMS';
  costPerMessage: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
  estimatedRevenue?: EstimatedRevenue;
}

interface UploadedImage {
  imageUrl: string;
  filename: string;
  imageId: string; // SOLAPI에서 받은 이미지 ID
  width: number;
  height: number;
  size: number;
}

// 이미지 제약 조건 상수
const IMAGE_MAX_SIZE = 200 * 1024; // 200KB
const IMAGE_MAX_WIDTH = 1500;
const IMAGE_MAX_HEIGHT = 1440;

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

interface SelectedCustomer {
  id: string;
  name: string | null;
  phone: string | null;
}

// 카카오톡 브랜드 메시지 관련 인터페이스
interface KakaoButton {
  type: 'WL';
  name: string;
  linkMo: string;
  linkPc?: string;
}

interface KakaoEstimate {
  targetCount: number;
  messageType: 'TEXT' | 'IMAGE';
  costPerMessage: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
  estimatedRevenue?: EstimatedRevenue;
}

interface KakaoUploadedImage {
  imageUrl: string;
  imageId: string;
  filename: string;
}

interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  visitCount: number;
  totalPoints: number;
  gender: string | null;
  createdAt: string;
  messageCount?: number;
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, ToastComponent } = useToast();

  // Tab state (문자 우선 - 카카오톡 임시 비활성화)
  const [activeTab, setActiveTab] = useState<'sms' | 'kakao'>('sms');

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

  // Get auth token
  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('franchiseToken') || 'dev-token';
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
  }, [messageContent, selectedTarget, selectedCustomers, genderFilter, selectedAgeGroups, uploadedImage]);

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

  // Fetch customers for modal
  const fetchCustomers = useCallback(async (search?: string) => {
    setIsLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
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
        const customersWithPhone = (data.customers || []).filter((c: CustomerListItem) => c.phone);
        setCustomerList(customersWithPhone);
        setCustomerTotalCount(data.total || 0);
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
    setShowCustomerModal(true);
    fetchCustomers();
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

  // Select all customers
  const selectAllCustomers = () => {
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

  // Search customers with debounce
  useEffect(() => {
    if (!showCustomerModal) return;

    const debounce = setTimeout(() => {
      fetchCustomers(customerSearch);
    }, 300);

    return () => clearTimeout(debounce);
  }, [customerSearch, showCustomerModal, fetchCustomers]);

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
      };

      if (selectedTarget === 'CUSTOM') {
        body.customerIds = selectedCustomers.map(c => c.id);
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
        showToast(`${sentOrPending}건 발송 요청 완료${failedMsg}${costMsg}`, 'success');
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#e5e7eb]">
          <h1 className="text-lg sm:text-xl font-bold text-[#1e293b]">캠페인 메시지 만들기</h1>
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

        {/* Target Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[#64748b]">발송 대상 선택</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                setSelectedTarget('ALL');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                selectedTarget === 'ALL'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">전체 고객</span>
              <div className="text-base font-bold text-[#1e293b] mt-0.5">
                {formatNumber(targetCounts.all)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('REVISIT');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                selectedTarget === 'REVISIT'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">재방문 고객 (2회 이상)</span>
              <div className="text-base font-bold text-[#1e293b] mt-0.5">
                {formatNumber(targetCounts.revisit)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('NEW');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                selectedTarget === 'NEW'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">신규 고객 (최근 30일)</span>
              <div className="text-base font-bold text-[#1e293b] mt-0.5">
                {formatNumber(targetCounts.new)}명
              </div>
            </button>
          </div>

          {/* Custom selection button */}
          <button
            onClick={openCustomerModal}
            className={cn(
              'p-3 rounded-lg border text-left transition-all flex items-center gap-2',
              selectedTarget === 'CUSTOM' && selectedCustomers.length > 0
                ? 'border-[#3b82f6] bg-[#eff6ff]'
                : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4 text-[#64748b]" />
            </div>
            <div className="flex-1">
              <span className="text-xs text-[#64748b]">고객 직접 선택</span>
              <div className="text-base font-bold text-[#1e293b]">
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
                  router.replace('/franchise/campaigns/retarget');
                }}
              >
                선택 해제
              </Button>
            )}
          </button>

          {/* Filters */}
          <div className="mt-2">
            <label className="text-xs font-medium text-[#64748b] mb-2 block">상세 필터</label>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
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
                    {gender === 'all' ? '전체 성별' : gender === 'FEMALE' ? '여성' : '남성'}
                  </button>
                ))}
              </div>

              <div className="hidden sm:block w-px bg-[#e5e7eb] mx-1" />

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
            {selectedAgeGroups.length === 0 && (
              <p className="text-xs text-[#64748b] mt-1.5">연령대 미선택 시 전체 연령대로 발송됩니다</p>
            )}
          </div>
        </div>

        {/* SMS 탭 콘텐츠 */}
        {activeTab === 'sms' && (
          <>
            {/* Message Content */}
            <div className="flex flex-col gap-3 flex-1">
              <label className="text-sm font-semibold text-[#1e293b]">
                메시지 내용 입력
                <span className="font-normal text-[#64748b] text-xs ml-1">(단문/장문 자동 전환)</span>
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
                className="w-full h-[160px] p-4 border border-[#e5e7eb] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent text-sm leading-relaxed"
              />

              {/* Image Upload */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#1e293b]">이미지 첨부</label>
                  <span className="text-xs text-[#64748b]">(JPG, 최대 200KB, 1500×1440px 이하)</span>
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
                    <span className="text-xs text-[#94a3b8]">이미지 첨부 시 MMS로 발송 (건당 120원)</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
                    <img
                      src={`${API_BASE}${uploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1e293b] truncate">{uploadedImage.filename}</p>
                      <p className="text-xs text-[#64748b] mt-1">
                        {uploadedImage.width} × {uploadedImage.height}px · {Math.round(uploadedImage.size / 1024)}KB
                      </p>
                      <Badge variant="secondary" className="mt-1.5">MMS (120원/건)</Badge>
                    </div>
                    <button
                      onClick={handleImageDelete}
                      className="p-1.5 text-[#94a3b8] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {imageError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cost Summary */}
            <div className="p-4 sm:p-5 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
              {/* 예상 비용 + 현재 잔액 */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs sm:text-sm text-[#64748b]">예상 비용</p>
                  <p className="text-lg sm:text-xl font-bold text-[#1e293b]">
                    {formatNumber(estimate?.targetCount || getCurrentTargetCount())}명 × {formatNumber(estimate?.costPerMessage || (uploadedImage ? 110 : 50))}원 ={' '}
                    <span className="text-[#3b82f6]">{formatNumber(estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))}원</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm text-[#64748b]">현재 잔액</p>
                  <p className={`text-lg sm:text-xl font-bold ${estimate?.canSend !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {formatNumber(estimate?.walletBalance || 0)}원
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    disabled={!messageContent.trim()}
                    onClick={() => setShowTestModal(true)}
                    className="w-full sm:w-auto px-4 py-3 sm:py-3.5 border border-[#3b82f6] text-[#3b82f6] bg-white rounded-xl text-sm sm:text-base font-semibold hover:bg-[#eff6ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    테스트 발송
                  </button>
                  <button
                    disabled={
                      !messageContent.trim() ||
                      getCurrentTargetCount() === 0 ||
                      (estimate !== null && !estimate.canSend)
                    }
                    onClick={() => setShowConfirmModal(true)}
                    className="w-full sm:w-auto px-6 py-3 sm:py-3.5 bg-[#2a2d62] text-white rounded-xl text-sm sm:text-base font-semibold hover:bg-[#1d1f45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    메시지 발송하기
                  </button>
              </div>

              {/* 광고 메시지 여부 체크박스 */}
              <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdMessage}
                    onChange={(e) => setIsAdMessage(e.target.checked)}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#3b82f6] focus:ring-[#3b82f6]"
                  />
                  <span className="text-sm text-[#64748b]">
                    광고 메시지로 발송 (체크 시 (광고) 표기 및 무료수신거부 자동 추가)
                  </span>
                </label>
                {!isAdMessage && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2 text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p className="text-xs">
                        광고 문자임에도 광고 표기 가이드라인을 지키지 않은 경우, 이용 약관에 의거해 예고 없이 계정이 차단될 수 있으며, 환불 또한 불가능합니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 예상 마케팅 효과 */}
              {(estimate?.targetCount || getCurrentTargetCount()) > 0 && (
                <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-base font-semibold text-green-700">예상 마케팅 효과</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-[#64748b]">예상 방문율</p>
                      <p className="text-base font-bold text-green-700">3.2%</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b]">예상 방문</p>
                      <p className="text-base font-bold text-green-700">
                        {Math.round((estimate?.targetCount || getCurrentTargetCount()) * 0.032).toLocaleString()}명
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b]">예상 매출</p>
                      <p className="text-base font-bold text-green-700">
                        {(Math.round((estimate?.targetCount || getCurrentTargetCount()) * 0.032) * (estimate?.estimatedRevenue?.avgOrderValue || 25000)).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[#94a3b8] mt-2">
                    * 업계 평균 방문율 3.2% 및 매장 평균 객단가 {(estimate?.estimatedRevenue?.avgOrderValue || 25000).toLocaleString()}원 기준
                  </p>
                </div>
              )}
            </div>

            {estimate && !estimate.canSend && (
              <p className="text-sm text-red-600 text-center -mt-2">
                충전금이 부족합니다. 충전 후 발송해주세요.
              </p>
            )}
          </>
        )}

        {/* 카카오톡 탭 콘텐츠 */}
        {activeTab === 'kakao' && (
          <>
            {/* 메시지 타입 선택 */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-semibold text-[#1e293b]">메시지 타입</label>
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
                  <p className="text-base font-medium text-[#1e293b] mt-2">230원/건</p>
                </button>
              </div>
            </div>

            {/* 이미지 업로드 (이미지형 선택 시) */}
            {kakaoMessageType === 'IMAGE' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-[#1e293b]">이미지 첨부</label>
                </div>

                {/* 이미지 규격 안내 */}
                <div className="p-3 bg-[#f0f9ff] rounded-lg border border-[#bae6fd]">
                  <p className="text-xs font-medium text-[#0369a1] mb-1.5">이미지 규격 안내</p>
                  <ul className="text-xs text-[#0c4a6e] space-y-0.5">
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
                        "flex items-center gap-2 px-4 py-2.5 border border-dashed border-[#d1d5db] rounded-xl text-sm text-[#64748b] hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors",
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
                  <div className="flex items-start gap-3 p-3 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
                    <img
                      src={`${API_BASE}${kakaoUploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1e293b] truncate">{kakaoUploadedImage.filename}</p>
                      <Badge variant="secondary" className="mt-1.5">이미지형 (230원/건)</Badge>
                    </div>
                    <button
                      onClick={handleKakaoImageDelete}
                      className="p-1.5 text-[#94a3b8] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {kakaoImageError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{kakaoImageError}</span>
                  </div>
                )}
              </div>
            )}

            {/* 메시지 내용 */}
            <div className="flex flex-col gap-3 flex-1">
              <label className="text-sm font-semibold text-[#1e293b]">
                메시지 내용 입력
                <span className="font-normal text-[#64748b] text-xs ml-1">({'{고객명}'} 사용 시 자동 치환)</span>
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
                className="w-full h-[140px] p-4 border border-[#e5e7eb] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent text-sm leading-relaxed"
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
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#fee500] to-[#ffd000] text-[#3c1e1e] rounded-xl text-sm font-medium hover:shadow-md transition-all self-start"
              >
                <MessageSquare className="w-4 h-4" />
                단골 고객 혜택 템플릿 사용하기
              </button>
            </div>

            {/* 버튼 추가 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#1e293b]">
                  버튼 추가
                  <span className="font-normal text-[#64748b] text-xs ml-1">(최대 5개, 웹링크만)</span>
                </label>
                <button
                  onClick={addKakaoButton}
                  disabled={kakaoButtons.length >= 5}
                  className="flex items-center gap-1 text-sm text-[#3b82f6] hover:text-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  버튼 추가
                </button>
              </div>

              {kakaoButtons.length > 0 && (
                <div className="space-y-3">
                  {kakaoButtons.map((button, index) => (
                    <div key={index} className="p-4 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-[#64748b]">버튼 {index + 1}</span>
                        <button
                          onClick={() => removeKakaoButton(index)}
                          className="p-1 text-[#94a3b8] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
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
                          className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                        />
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-[#64748b] flex-shrink-0" />
                          <input
                            type="url"
                            value={button.linkMo}
                            onChange={(e) => updateKakaoButton(index, 'linkMo', e.target.value)}
                            placeholder="https://example.com"
                            className="flex-1 px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost Summary */}
            <div className="p-4 sm:p-5 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
              {/* 예상 비용 + 현재 잔액 */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs sm:text-sm text-[#64748b]">예상 비용</p>
                  <p className="text-lg sm:text-xl font-bold text-[#1e293b]">
                    {formatNumber(kakaoEstimate?.targetCount || getCurrentTargetCount())}명 × {kakaoMessageType === 'IMAGE' ? '230' : '200'}원 ={' '}
                    <span className="text-[#3b82f6]">{formatNumber(kakaoEstimate?.totalCost || (getCurrentTargetCount() * (kakaoMessageType === 'IMAGE' ? 230 : 200)))}원</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm text-[#64748b]">현재 잔액</p>
                  <p className={`text-lg sm:text-xl font-bold ${kakaoEstimate?.canSend !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {formatNumber(kakaoEstimate?.walletBalance || 0)}원
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    disabled={!kakaoContent.trim()}
                    onClick={() => setShowKakaoTestModal(true)}
                    className="w-full sm:w-auto px-4 py-3 sm:py-3.5 border border-[#3b82f6] text-[#3b82f6] bg-white rounded-xl text-sm sm:text-base font-semibold hover:bg-[#eff6ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full sm:w-auto px-6 py-3 sm:py-3.5 bg-[#2a2d62] text-white rounded-xl text-sm sm:text-base font-semibold hover:bg-[#1d1f45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    메시지 발송하기
                  </button>
              </div>

              {/* 야간 발송 안내 */}
              <p className="text-xs text-neutral-500 text-center mt-2">
                * KST 기준 20:50 이후 발송 시, 다음날 08:00에 발송됩니다.
              </p>

              {/* 예상 마케팅 효과 */}
              {(kakaoEstimate?.targetCount || getCurrentTargetCount()) > 0 && (
                <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-base font-semibold text-green-700">예상 마케팅 효과</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-[#64748b]">예상 방문율</p>
                      <p className="text-base font-bold text-green-700">4.6%</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b]">예상 방문</p>
                      <p className="text-base font-bold text-green-700">
                        {Math.round((kakaoEstimate?.targetCount || getCurrentTargetCount()) * 0.046).toLocaleString()}명
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b]">예상 매출</p>
                      <p className="text-base font-bold text-green-700">
                        {(Math.round((kakaoEstimate?.targetCount || getCurrentTargetCount()) * 0.046) * (kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000)).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[#94a3b8] mt-2">
                    * 업계 평균 방문율 4.6% 및 매장 평균 객단가 {(kakaoEstimate?.estimatedRevenue?.avgOrderValue || 25000).toLocaleString()}원 기준
                  </p>
                </div>
              )}
            </div>

            {kakaoEstimate && !kakaoEstimate.canSend && (
              <p className="text-sm text-red-600 text-center -mt-2">
                충전금이 부족합니다. 충전 후 발송해주세요.
              </p>
            )}
          </>
        )}
      </div>

      {/* Right Panel - Preview (hidden on mobile) */}
      <div className="hidden lg:block flex-none w-[360px] self-start">
        <div className="bg-[#e2e8f0] rounded-3xl p-5">
          <p className="text-center text-[#64748b] mb-4">발송 메시지 미리보기</p>
          <div className="flex justify-center">
            {/* Phone Frame */}
            <div className="relative w-72 h-[580px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
              {/* Inner bezel */}
              <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
                {/* Screen */}
                <div className={cn(
                  "w-full h-full rounded-[1.75rem] overflow-hidden flex flex-col relative",
                  activeTab === 'sms' ? 'bg-white' : 'bg-[#B2C7D9]'
                )}>
                  {/* Dynamic Island / Notch */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />

                  {/* SMS Preview */}
                  {activeTab === 'sms' && (
                    <>
                      {/* iOS Header */}
                      <div className="flex items-center justify-between px-4 pt-10 pb-2 border-b border-[#e5e5ea]">
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
                                {isAdMessage
                                  ? `(광고)\n${messageContent.replace(/{고객명}/g, '{고객명}')}\n무료수신거부 080-500-4233`
                                  : messageContent.replace(/{고객명}/g, '{고객명}')}
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

                  {/* Kakao Preview */}
                  {activeTab === 'kakao' && (
                    <>
                      {/* KakaoTalk header */}
                      <div className="flex items-center justify-between px-4 pt-10 pb-2">
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      <Modal open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>메시지 발송 확인</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-neutral-50 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-neutral-600">발송 대상</span>
                <span className="font-semibold">{formatNumber(estimate?.targetCount || getCurrentTargetCount())}명</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">메시지 유형</span>
                <span className="font-semibold">
                  {uploadedImage ? '멀티미디어 (MMS)' : isLongMessage ? '장문 (LMS)' : '단문 (SMS)'}
                </span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-neutral-900 font-medium">총 비용</span>
                <span className="font-bold text-brand-700">{formatNumber(estimate?.totalCost || (getCurrentTargetCount() * (uploadedImage ? 110 : 50)))}원</span>
              </div>
            </div>

            <div className="p-4 bg-brand-50 rounded-xl">
              <p className="text-sm text-brand-800">
                발송 후에는 취소할 수 없으며, 비용이 충전금에서 차감됩니다.
              </p>
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              취소
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  발송하기
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Customer Selection Modal */}
      <Modal open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <ModalContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <ModalHeader>
            <ModalTitle>고객 선택</ModalTitle>
          </ModalHeader>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="이름 또는 전화번호로 검색..."
                className="w-full pl-10 pr-4 py-2.5 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllCustomers}
                  disabled={customerList.length === 0}
                >
                  전체 선택
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
              <span className="text-sm text-[#64748b]">
                {tempSelectedCustomers.length}명 선택됨
              </span>
            </div>

            {/* Customer list */}
            <div className="flex-1 overflow-y-auto border border-[#e5e7eb] rounded-xl min-h-[300px]">
              {isLoadingCustomers ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[#3b82f6]" />
                </div>
              ) : customerList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#94a3b8]">
                  <Users className="w-12 h-12 mb-2" />
                  <p>검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#e5e7eb]">
                  {customerList.map((customer) => {
                    const isSelected = tempSelectedCustomers.some(c => c.id === customer.id);
                    return (
                      <button
                        key={customer.id}
                        onClick={() => toggleCustomerSelection(customer)}
                        className={cn(
                          'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                          isSelected ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]'
                        )}
                      >
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'bg-[#3b82f6] border-[#3b82f6]'
                            : 'border-[#d1d5db]'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#1e293b]">
                              {maskNickname(customer.name)}
                            </span>
                            {customer.gender && (
                              <Badge variant="secondary" className="text-xs">
                                {customer.gender === 'MALE' ? '남' : '여'}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-[#64748b]">
                            {customer.phone ? formatPhone(customer.phone) : ''}
                          </div>
                        </div>
                        <div className="text-right text-sm flex-shrink-0">
                          <div className="text-[#64748b]">
                            방문 {customer.visitCount}회
                            {(customer.messageCount || 0) > 0 && (
                              <span className="ml-1 text-green-600">· 수신 {customer.messageCount}회</span>
                            )}
                          </div>
                          <div className="text-[#3b82f6] font-medium">{formatNumber(customer.totalPoints)}P</div>
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
      <Modal open={showTestModal} onOpenChange={setShowTestModal}>
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>테스트 발송</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-[#64748b]">
              테스트용 전화번호를 입력해주세요.
            </p>
            <p className="text-sm text-[#3b82f6]">
              테스트 발송은 금액이 차감되지 않아요.
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                오늘 테스트 발송: {testCount.count}/{testCount.limit}회 (남은 횟수: {testCount.remaining}회)
              </p>
            </div>

            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="01012345678"
              className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
            />

            <div className="p-4 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
              <p className="text-sm text-[#64748b]">
                메시지 유형: <span className="font-medium text-[#1e293b]">{uploadedImage ? 'MMS (이미지 포함)' : getByteLength(messageContent) > 90 ? 'LMS (장문)' : 'SMS (단문)'}</span>
              </p>
              <p className="text-sm text-[#64748b] mt-1">
                바이트: <span className="font-medium text-[#1e293b]">{getByteLength(messageContent)} bytes</span>
              </p>
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowTestModal(false)}
              disabled={isTestSending}
            >
              취소
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={isTestSending || !testPhone.trim() || !messageContent.trim() || testCount.remaining <= 0}
            >
              {isTestSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  테스트 발송
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Kakao Confirm Modal */}
      <Modal open={showKakaoConfirmModal} onOpenChange={setShowKakaoConfirmModal}>
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>카카오톡 발송 확인</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-neutral-50 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-neutral-600">발송 대상</span>
                <span className="font-semibold">{formatNumber(kakaoEstimate?.targetCount || getCurrentTargetCount())}명</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">메시지 유형</span>
                <span className="font-semibold">
                  {kakaoMessageType === 'IMAGE' ? '이미지형 (230원)' : '텍스트형 (200원)'}
                </span>
              </div>
              {!isSendableTime && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">발송 예정</span>
                  <span className="font-semibold text-amber-600">다음 날 08:00 예약</span>
                </div>
              )}
              <div className="flex justify-between text-lg pt-2 border-t border-neutral-200">
                <span className="text-neutral-900 font-medium">총 비용</span>
                <span className="font-bold text-brand-700">{formatNumber(kakaoEstimate?.totalCost || (getCurrentTargetCount() * (kakaoMessageType === 'IMAGE' ? 230 : 200)))}원</span>
              </div>
            </div>

            <div className="p-4 bg-brand-50 rounded-xl">
              <p className="text-sm text-brand-800">
                {isSendableTime
                  ? '발송 후에는 취소할 수 없으며, 발송 성공 시에만 비용이 차감됩니다.'
                  : '08:00에 자동 발송되며, 발송 성공 시에만 비용이 차감됩니다.'}
              </p>
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg text-xs text-neutral-600">
              <p>카카오톡 미설치 또는 미가입 고객에게는 발송되지 않으며, SMS 대체 발송이 불가능합니다.</p>
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setShowKakaoConfirmModal(false)}>
              취소
            </Button>
            <Button
              onClick={handleKakaoSend}
              disabled={isKakaoSending}
            >
              {isKakaoSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {isSendableTime ? '발송하기' : '예약 발송'}
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Kakao Test Send Modal */}
      <Modal open={showKakaoTestModal} onOpenChange={setShowKakaoTestModal}>
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>카카오톡 테스트 발송</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-[#64748b]">
              테스트용 전화번호를 입력해주세요.
            </p>
            <p className="text-sm text-[#3b82f6]">
              테스트 발송은 금액이 차감되지 않아요.
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                카카오톡이 설치되어 있고 해당 번호로 가입된 계정이어야 수신 가능합니다.
              </p>
            </div>

            <input
              type="tel"
              value={kakaoTestPhone}
              onChange={(e) => setKakaoTestPhone(e.target.value)}
              placeholder="01012345678"
              className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
            />

            <div className="p-4 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
              <p className="text-sm text-[#64748b]">
                메시지 유형: <span className="font-medium text-[#1e293b]">{kakaoMessageType === 'IMAGE' ? '이미지형' : '텍스트형'}</span>
              </p>
              {kakaoButtons.filter(b => b.name.trim()).length > 0 && (
                <p className="text-sm text-[#64748b] mt-1">
                  버튼: <span className="font-medium text-[#1e293b]">{kakaoButtons.filter(b => b.name.trim()).length}개</span>
                </p>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowKakaoTestModal(false)}
              disabled={isKakaoTestSending}
            >
              취소
            </Button>
            <Button
              onClick={handleKakaoTestSend}
              disabled={isKakaoTestSending || !kakaoTestPhone.trim() || !kakaoContent.trim()}
            >
              {isKakaoTestSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  테스트 발송
                </>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
