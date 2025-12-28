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
import { formatNumber } from '@/lib/utils';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TargetCounts {
  all: number;
  revisit: number;
  new: number;
}

interface Estimate {
  targetCount: number;
  byteLength: number;
  messageType: 'SMS' | 'LMS' | 'MMS';
  costPerMessage: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
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

interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  visitCount: number;
  totalPoints: number;
  gender: string | null;
  createdAt: string;
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, ToastComponent } = useToast();

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
  const [ageFilter, setAgeFilter] = useState<'all' | '20-30' | '40-50'>('all');

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

  // Fetch target counts (with filters)
  const fetchTargetCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (genderFilter !== 'all') {
        params.set('genderFilter', genderFilter);
      }
      if (ageFilter !== 'all') {
        params.set('ageFilter', ageFilter);
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
  }, [genderFilter, ageFilter]);

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
      if (ageFilter !== 'all') {
        params.set('ageFilter', ageFilter);
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
  }, [messageContent, selectedTarget, selectedCustomers, genderFilter, ageFilter, uploadedImage]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchTargetCounts();
      setIsLoading(false);
    };
    init();
  }, []);

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
  const fetchCustomers = useCallback(async (search?: string) => {
    setIsLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('limit', '100'); // 최대 100명

      const res = await fetch(`${API_BASE}/api/customers?${params}`, {
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
        ageFilter: ageFilter !== 'all' ? ageFilter : undefined,
        imageUrl: uploadedImage?.imageUrl || undefined,
        imageId: uploadedImage?.imageId || undefined, // SOLAPI 이미지 ID 전달
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
        const failedMsg = data.failedCount > 0 ? `, ${data.failedCount}건 실패` : '';
        showToast(`${data.sentCount}건 발송 완료${failedMsg} (비용: ${formatNumber(data.totalCost)}원)`, 'success');
        setMessageContent('');
        setUploadedImage(null);
        setImageError(null);
        setShowConfirmModal(false);
        setSelectedCustomers([]);
        setSelectedTarget('ALL');
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
    <div className="flex-1 flex p-6 gap-6 overflow-hidden max-w-[1200px] mx-auto w-full justify-center">
      {ToastComponent}

      {/* Left Panel - Settings */}
      <div className="flex-1 max-w-[720px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-[#e5e7eb]">
          <h1 className="text-xl font-bold text-[#1e293b]">캠페인 메시지 만들기</h1>
          <div className="flex bg-[#f1f5f9] rounded-lg p-1">
            <button className="px-4 py-2 text-sm font-semibold rounded-md bg-white shadow-sm text-[#1e293b]">
              문자 (SMS/LMS)
            </button>
            <button className="px-4 py-2 text-sm font-medium rounded-md text-[#94a3b8] cursor-not-allowed">
              카카오톡 (알림톡)
            </button>
          </div>
        </div>

        {/* Target Selection */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-[#1e293b]">발송 대상 선택</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => {
                setSelectedTarget('ALL');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all',
                selectedTarget === 'ALL'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">전체 고객</span>
              <div className="text-lg font-bold text-[#1e293b] mt-1">
                {formatNumber(targetCounts.all)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('REVISIT');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all',
                selectedTarget === 'REVISIT'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">재방문 고객 (2회 이상)</span>
              <div className="text-lg font-bold text-[#1e293b] mt-1">
                {formatNumber(targetCounts.revisit)}명
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTarget('NEW');
                setSelectedCustomers([]);
              }}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all',
                selectedTarget === 'NEW'
                  ? 'border-[#3b82f6] bg-[#eff6ff]'
                  : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
              )}
            >
              <span className="text-xs text-[#64748b]">신규 고객 (최근 30일)</span>
              <div className="text-lg font-bold text-[#1e293b] mt-1">
                {formatNumber(targetCounts.new)}명
              </div>
            </button>
          </div>

          {/* Custom selection button */}
          <button
            onClick={openCustomerModal}
            className={cn(
              'p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3',
              selectedTarget === 'CUSTOM' && selectedCustomers.length > 0
                ? 'border-[#3b82f6] bg-[#eff6ff]'
                : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-5 h-5 text-[#64748b]" />
            </div>
            <div className="flex-1">
              <span className="text-xs text-[#64748b]">고객 직접 선택</span>
              <div className="text-lg font-bold text-[#1e293b]">
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
                선택 해제
              </Button>
            )}
          </button>

          {/* Filters */}
          <div className="mt-4">
            <label className="text-sm font-semibold text-[#1e293b] mb-3 block">상세 필터</label>
            <div className="flex flex-wrap gap-2">
              {['all', 'FEMALE', 'MALE'].map((gender) => (
                <button
                  key={gender}
                  onClick={() => setGenderFilter(gender as any)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm border transition-all',
                    genderFilter === gender
                      ? 'bg-[#eff6ff] border-[#3b82f6] text-[#3b82f6] font-semibold'
                      : 'border-[#e5e7eb] bg-white text-[#1e293b] hover:border-[#d1d5db]'
                  )}
                >
                  {gender === 'all' ? '전체 성별' : gender === 'FEMALE' ? '여성' : '남성'}
                </button>
              ))}

              <div className="w-px bg-[#e5e7eb] mx-1" />

              {['all', '20-30', '40-50'].map((age) => (
                <button
                  key={age}
                  onClick={() => setAgeFilter(age as any)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm border transition-all',
                    ageFilter === age
                      ? 'bg-[#eff6ff] border-[#3b82f6] text-[#3b82f6] font-semibold'
                      : 'border-[#e5e7eb] bg-white text-[#1e293b] hover:border-[#d1d5db]'
                  )}
                >
                  {age === 'all' ? '전체 연령' : age === '20-30' ? '20~30대' : '40~50대'}
                </button>
              ))}
            </div>
          </div>
        </div>

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
        <div className="flex items-center justify-between p-5 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-[#64748b]">
              발송 대상 {formatNumber(estimate?.targetCount || getCurrentTargetCount())}명 × {formatNumber(estimate?.costPerMessage || (uploadedImage ? 110 : 50))}원 ({uploadedImage ? 'MMS' : '문자'})
            </span>
            <span className="text-xl font-bold text-[#1e293b]">
              총 {formatNumber(estimate?.totalCost || 0)}원
            </span>
          </div>
          <button
            disabled={
              !messageContent.trim() ||
              getCurrentTargetCount() === 0 ||
              (estimate && !estimate.canSend)
            }
            onClick={() => setShowConfirmModal(true)}
            className="px-6 py-3.5 bg-[#2a2d62] text-white rounded-xl text-base font-semibold hover:bg-[#1d1f45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            메시지 발송하기
          </button>
        </div>

        {estimate && !estimate.canSend && (
          <p className="text-sm text-red-600 text-center -mt-2">
            충전금이 부족합니다. 충전 후 발송해주세요.
          </p>
        )}
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-none w-[360px] bg-[#e2e8f0] rounded-3xl p-5 flex items-center justify-center">
        {/* Phone Mockup - Full height iPhone style */}
        <div className="w-full h-[680px] bg-white rounded-[44px] border-[10px] border-[#1e293b] overflow-hidden flex flex-col shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative">
          {/* Dynamic Island / Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90px] h-[28px] bg-[#1e293b] rounded-full z-20" />

          {/* Status Bar */}
          <div className="h-12 bg-white flex items-end justify-between px-6 pb-1 text-xs font-semibold flex-shrink-0">
            <span className="text-[#1e293b]">12:30</span>
            <div className="flex items-center gap-1">
              <Wifi className="w-4 h-4 text-[#1e293b]" />
              <Battery className="w-5 h-4 text-[#1e293b]" />
            </div>
          </div>

          {/* iOS Header */}
          <div className="h-[60px] bg-white flex items-center justify-between px-4 border-b border-[#e5e5ea] flex-shrink-0">
            <div className="flex items-center text-[#007aff]">
              <ChevronLeft className="w-7 h-7" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 bg-[#9ca3af] rounded-full flex items-center justify-center text-white">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-[#1e293b]">태그히어 CRM</span>
            </div>
            <div className="w-7" />
          </div>

          {/* Message Body */}
          <div className="flex-1 bg-white px-4 py-3 flex flex-col overflow-y-auto">
            <div className="text-center text-[12px] text-[#8e8e93] font-medium mb-4">
              {uploadedImage ? 'MMS' : '문자 메시지'}<br />오늘 오후 12:30
            </div>

            <div className="flex justify-start">
              <div className="bg-[#e5e5ea] text-[#1e293b] py-3 px-4 rounded-[20px] rounded-bl-[6px] max-w-[85%] text-[15px] leading-[1.5]">
                {/* 이미지 미리보기 */}
                {uploadedImage && (
                  <div className="mb-2 -mx-1 -mt-1">
                    <img
                      src={`${API_BASE}${uploadedImage.imageUrl}`}
                      alt="첨부 이미지"
                      className="w-full max-w-[200px] rounded-lg"
                    />
                  </div>
                )}
                {messageContent ? (
                  <span className="whitespace-pre-wrap break-words">
                    {messageContent.replace(/{고객명}/g, '{고객명}')}
                  </span>
                ) : (
                  <span className="text-[#94a3b8]">메시지 미리보기</span>
                )}
              </div>
            </div>
          </div>

          {/* Input Bar */}
          <div className="py-3 px-4 bg-white border-t border-[#e5e5ea] flex items-center gap-3 flex-shrink-0">
            <Camera className="w-7 h-7 text-[#c7c7cc]" />
            <span className="text-2xl font-bold text-[#c7c7cc]">A</span>
            <div className="flex-1 h-10 border border-[#c7c7cc] rounded-full px-4 flex items-center text-[15px] text-[#c7c7cc]">
              iMessage
            </div>
            <div className="w-8 h-8 bg-[#007aff] rounded-full flex items-center justify-center text-white">
              <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
            </div>
          </div>

          {/* Home Indicator */}
          <div className="h-8 bg-white flex items-center justify-center flex-shrink-0">
            <div className="w-32 h-1 bg-[#1e293b] rounded-full" />
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
                <span className="font-bold text-brand-700">{formatNumber(estimate?.totalCost || 0)}원</span>
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
                              {customer.name || '이름 없음'}
                            </span>
                            {customer.gender && (
                              <Badge variant="secondary" className="text-xs">
                                {customer.gender === 'MALE' ? '남' : '여'}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-[#64748b]">
                            {customer.phone?.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                          </div>
                        </div>
                        <div className="text-right text-sm flex-shrink-0">
                          <div className="text-[#64748b]">방문 {customer.visitCount}회</div>
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
    </div>
  );
}
