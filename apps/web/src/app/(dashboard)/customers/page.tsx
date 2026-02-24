'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatPhone, formatNumber, formatDate, getRelativeTime, maskNickname, formatBirthdayMonth, getAgeGroup } from '@/lib/utils';
import { Search, ChevronLeft, ChevronRight, Edit2, ChevronDown, Check, UserPlus, Star, MessageSquare, History, Send, ShoppingBag, Megaphone, X, Calendar, Upload, Settings2, Download, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';

interface Customer {
  id: string;
  name: string;
  phone: string;
  totalPoints: number;
  totalStamps: number;
  gender: string;
  birthday: string | null;   // MM-DD 형식
  birthYear: number | null;  // YYYY 형식
  memo: string | null;
  feedbackRating: number | null;
  feedbackText: string | null;
  feedbackAt: string | null;
  visitCount: number;
  lastVisitAt: string;
  isVip: boolean;
  isNew: boolean;
  visitSource: string | null;  // 방문 경로
  lastTableLabel: string | null;  // 마지막 방문 좌석
  surveyAnswers: Array<{
    questionId: string;
    label: string;
    type: string;
    valueDate: string | null;
    valueText: string | null;
  }>;
}

interface PointLedgerEntry {
  id: string;
  delta: number;
  balance: number;
  type: 'EARN' | 'USE' | 'EXPIRE' | 'ADJUST';
  reason: string | null;
  tableLabel: string | null;
  createdAt: string;
}

interface CustomerFeedbackEntry {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
}

interface OrderItem {
  label?: string;  // TagHere API uses 'label' for menu name
  name?: string;
  menuName?: string;
  productName?: string;
  title?: string;
  quantity?: number;
  count?: number;
  qty?: number;
  price?: number;
  amount?: number;
  totalPrice?: number;
  option?: string;  // 옵션 정보 (예: "온도: HOT")
  cancelled?: boolean;
  cancelledAt?: string;
  cancelledQuantity?: number;  // 부분 취소된 수량
}

interface VisitOrOrderEntry {
  id: string;
  orderId: string | null;
  visitedAt: string;
  items: OrderItem[] | null;
  totalAmount: number | null;
  tableNumber: string | null;
}

// 주문 아이템 배열을 안전하게 가져오는 헬퍼 함수
function getOrderItems(items: unknown): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  // items가 객체이고 내부에 items 배열이 있는 경우 (예: { items: [], tableNumber: '' })
  if (typeof items === 'object' && 'items' in items && Array.isArray((items as any).items)) {
    return (items as any).items;
  }
  return [];
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: number;
  createdAt: string;
}

interface MessageHistoryEntry {
  id: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  cost: number;
  failReason: string | null;
  sentAt: string | null;
  createdAt: string;
  campaignTitle: string | null;
}

// 컬럼 정의 상수
const COLUMN_DEFINITIONS = [
  { id: 'nickname', label: '닉네임', required: true, defaultVisible: true },
  { id: 'phone', label: '전화번호', required: false, defaultVisible: true },
  { id: 'points', label: '적립 포인트', required: false, defaultVisible: true },
  { id: 'stamps', label: '스탬프', required: false, defaultVisible: true },
  { id: 'birthday', label: '생일/연령대', required: false, defaultVisible: true },
  { id: 'memo', label: '메모', required: false, defaultVisible: true },
  { id: 'visitSource', label: '방문 경로', required: false, defaultVisible: true },
  { id: 'tableLabel', label: '좌석', required: false, defaultVisible: true },
  { id: 'visitCount', label: '방문 횟수', required: false, defaultVisible: true },
  { id: 'actions', label: '액션', required: true, defaultVisible: true },
] as const;

const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFINITIONS.filter(c => c.defaultVisible).map(c => c.id);
const COLUMN_STORAGE_KEY = 'taghere-customer-list-columns';

// 별점 컴포넌트
function StarRating({ rating, onRatingChange, readonly = false }: { rating: number; onRatingChange?: (rating: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onRatingChange?.(star)}
          className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
        >
          <Star
            className={`w-6 h-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-neutral-300'}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, ToastComponent } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [usePointsModal, setUsePointsModal] = useState(false);
  const [useConfirmModal, setUseConfirmModal] = useState(false);
  const [useAmount, setUseAmount] = useState('');
  const [useReason, setUseReason] = useState('');
  const [earnPointsModal, setEarnPointsModal] = useState(false);
  const [earnAmount, setEarnAmount] = useState('');
  const [earnReason, setEarnReason] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
  });
  const [genderFilter, setGenderFilter] = useState<'all' | 'MALE' | 'FEMALE'>('all');
  const [visitFilter, setVisitFilter] = useState<'all' | '1' | '2' | '5' | '10' | '20'>('all');
  const [lastVisitFilter, setLastVisitFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [submittingUse, setSubmittingUse] = useState(false);
  const [submittingEarn, setSubmittingEarn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Edit customer modal states
  const [editModal, setEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [editBirthday, setEditBirthday] = useState('');  // MM-DD 형식
  const [editBirthYear, setEditBirthYear] = useState('');  // YYYY 형식
  const [editMemo, setEditMemo] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Dropdown states
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [visitDropdownOpen, setVisitDropdownOpen] = useState(false);
  const [lastVisitDropdownOpen, setLastVisitDropdownOpen] = useState(false);
  const [dateRangeDropdownOpen, setDateRangeDropdownOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS as unknown as string[]);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  // Date range filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateFilterType, setDateFilterType] = useState<'created' | 'lastVisit'>('lastVisit');

  // Add customer modal states
  const [addModal, setAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addGender, setAddGender] = useState<'MALE' | 'FEMALE' | ''>('');
  const [addBirthday, setAddBirthday] = useState('');  // MM-DD 형식
  const [addBirthYear, setAddBirthYear] = useState('');  // YYYY 형식
  const [addMemo, setAddMemo] = useState('');
  const [addInitialPoints, setAddInitialPoints] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Bulk upload modal states
  interface BulkRow {
    phone: string;
    name?: string;
    gender?: string;
    birthYear?: string | number;
    birthday?: string;
    memo?: string;
  }
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkParsedData, setBulkParsedData] = useState<BulkRow[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: Array<{ row: number; phone: string; reason: string }> } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Edit modal tab and feedback states
  const [editModalTab, setEditModalTab] = useState<'feedback' | 'history' | 'orders' | 'messages'>('orders');
  const [editFeedbackRating, setEditFeedbackRating] = useState(0);
  const [editFeedbackText, setEditFeedbackText] = useState('');
  const [pointHistory, setPointHistory] = useState<PointLedgerEntry[]>([]);
  const [feedbackHistory, setFeedbackHistory] = useState<CustomerFeedbackEntry[]>([]);
  const [orderHistory, setOrderHistory] = useState<VisitOrOrderEntry[]>([]);
  const [messageHistory, setMessageHistory] = useState<MessageHistoryEntry[]>([]);
  const [messageSummary, setMessageSummary] = useState<{ total: number; sent: number; failed: number }>({ total: 0, sent: 0, failed: 0 });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Order date filter states
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');
  const [cancellingItem, setCancellingItem] = useState<{ orderId: string; itemIndex: number } | null>(null);
  const [cancelConfirmModal, setCancelConfirmModal] = useState(false);
  const [cancellingItemInfo, setCancellingItemInfo] = useState<{
    name: string;
    price: number;
    totalQty: number;
    remainingQty: number;
    unitPrice: number;
  } | null>(null);
  const [cancelQuantity, setCancelQuantity] = useState(1);

  // Tablet-friendly UI states
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);

  // 고객 주문 총액 계산
  const customerTotalOrderAmount = orderHistory.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // 스탬프 보상 티어 목록 (매장 설정 기반)
  const [stampRewardTiers, setStampRewardTiers] = useState<number[]>([5, 10, 15, 20, 25, 30]);

  // 방문 경로 라벨 맵
  const [visitSourceLabelMap, setVisitSourceLabelMap] = useState<Record<string, string>>({});

  // 설문 질문 목록 (컬럼 헤더용)
  const [surveyQuestionLabels, setSurveyQuestionLabels] = useState<Array<{ id: string; label: string }>>([]);

  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', []);
  const userRole = 'OWNER';

  // Get auth token from localStorage (fallback to dev-token for MVP)
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || 'dev-token';
    }
    return 'dev-token';
  };

  useEffect(() => {
    const id = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Fetch announcements
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${apiUrl}/api/dashboard/announcements`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setAnnouncements(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [apiUrl]);

  // Fetch stamp reward tiers from stamp settings
  useEffect(() => {
    const fetchStampRewardTiers = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${apiUrl}/api/stamp-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.rewards && Array.isArray(data.rewards) && data.rewards.length > 0) {
            const tiers = data.rewards.map((r: any) => r.tier).sort((a: number, b: number) => a - b);
            setStampRewardTiers(tiers);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stamp reward tiers:', error);
      }
    };
    fetchStampRewardTiers();
  }, [apiUrl]);

  // Fetch visit source settings for label mapping
  useEffect(() => {
    const fetchVisitSourceSettings = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${apiUrl}/api/visit-source-settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const options = data.options as Array<{ id: string; label: string }>;
          const labelMap: Record<string, string> = {};
          options.forEach(opt => {
            labelMap[opt.id] = opt.label;
          });
          setVisitSourceLabelMap(labelMap);
        }
      } catch (error) {
        console.error('Failed to fetch visit source settings:', error);
      }
    };

    fetchVisitSourceSettings();

    // 설문 질문 목록 조회 (컬럼 헤더용)
    const fetchSurveyQuestions = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(`${apiUrl}/api/survey-questions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSurveyQuestionLabels(data.map((q: { id: string; label: string }) => ({ id: q.id, label: q.label })));
        }
      } catch (error) {
        console.error('Failed to fetch survey questions:', error);
      }
    };
    fetchSurveyQuestions();
  }, [apiUrl]);

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refs for dropdown containers (to detect outside clicks)
  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);

  // Load column visibility from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleColumns(parsed);
        }
      } catch (e) {
        // 파싱 실패 시 기본값 사용
      }
    }
  }, []);

  // Handle column settings dropdown outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setColumnSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Column visibility helpers
  const isColumnVisible = (columnId: string) => visibleColumns.includes(columnId);
  const visibleColumnCount = visibleColumns.length + 1; // +1 for checkbox

  const toggleColumn = (columnId: string) => {
    const column = COLUMN_DEFINITIONS.find(c => c.id === columnId);
    if (column?.required) return;

    const newColumns = visibleColumns.includes(columnId)
      ? visibleColumns.filter(id => id !== columnId)
      : [...visibleColumns, columnId];

    setVisibleColumns(newColumns);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newColumns));
  };

  const resetColumnsToDefault = () => {
    const defaultColumns = DEFAULT_VISIBLE_COLUMNS as unknown as string[];
    setVisibleColumns(defaultColumns);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(defaultColumns));
  };

  // Fetch customers function (extracted for reuse)
  const fetchCustomers = useCallback(async (showLoading = true) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      if (searchQuery) params.set('search', searchQuery);
      if (genderFilter !== 'all') params.set('gender', genderFilter);
      if (visitFilter !== 'all') {
        // 1회, 2회는 정확히 해당 횟수만 필터
        if (visitFilter === '1' || visitFilter === '2') {
          params.set('visitCountExact', visitFilter);
        } else {
          // 5회 이상, 10회 이상, 20회 이상
          params.set('visitCountMin', visitFilter);
        }
      }
      if (lastVisitFilter !== 'all') params.set('lastVisitDays', lastVisitFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (startDate || endDate) params.set('dateType', dateFilterType);

      const res = await fetch(`${apiUrl}/api/customers?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error('고객 목록 조회 중 오류가 발생했습니다.');
      }

      const data = await res.json();
      if (isMountedRef.current) {
        setCustomers(Array.isArray(data.customers) ? data.customers : []);
        setPagination({
          total: data.pagination?.total || 0,
          totalPages: data.pagination?.totalPages || 1,
        });
        setSelectedCustomers([]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (isMountedRef.current) {
        setError(err.message || '조회 중 오류가 발생했습니다.');
        setCustomers([]);
      }
    } finally {
      if (isMountedRef.current && showLoading) {
        setIsLoading(false);
      }
    }
  }, [apiUrl, searchQuery, genderFilter, visitFilter, lastVisitFilter, startDate, endDate, dateFilterType, page, pageSize]);

  // Initial fetch and when filters change
  useEffect(() => {
    fetchCustomers(true);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCustomers, refreshKey]);

  // Auto-refresh polling (every 30 seconds when page is visible)
  useEffect(() => {
    isMountedRef.current = true;

    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      // Poll every 30 seconds for new data (silent refresh without loading indicator)
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchCustomers(false); // false = don't show loading indicator
        }
      }, 30000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when tab becomes visible
        fetchCustomers(false);
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchCustomers]);

  const handleUsePoints = async () => {
    if (!selectedCustomer || !useAmount) return;
    setSubmittingUse(true);
    try {
      const res = await fetch(`${apiUrl}/api/points/use`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          points: parseInt(useAmount, 10),
          reason: useReason,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '포인트 사용 중 오류가 발생했습니다.');
      }

      // refresh list to reflect new balance
      setUsePointsModal(false);
      setUseAmount('');
      setUseReason('');
      setSelectedCustomer(null);
      setPage(1);
      setRefreshKey((key) => key + 1);
    } catch (err: any) {
      showToast(err.message || '포인트 사용 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingUse(false);
    }
  };

  const handleEarnPoints = async () => {
    if (!selectedCustomer || !earnAmount) return;
    setSubmittingEarn(true);
    try {
      const res = await fetch(`${apiUrl}/api/points/earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          points: parseInt(earnAmount, 10),
          reason: earnReason || '포인트 적립',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '포인트 적립 중 오류가 발생했습니다.');
      }

      setEarnPointsModal(false);
      setEarnAmount('');
      setEarnReason('');
      setSelectedCustomer(null);
      setPage(1);
      setRefreshKey((key) => key + 1);
      showToast('포인트가 적립되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '포인트 적립 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingEarn(false);
    }
  };

  const openUsePointsModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setUsePointsModal(true);
  };

  const openEditModal = async (customer: Customer) => {
    setEditingCustomer(customer);
    setEditName(customer.name || '');
    setEditGender(customer.gender === 'FEMALE' ? 'FEMALE' : 'MALE');
    setEditBirthday(customer.birthday || '');  // MM-DD 형식
    setEditBirthYear(customer.birthYear ? customer.birthYear.toString() : '');
    setEditMemo(customer.memo || '');
    setEditFeedbackRating(customer.feedbackRating || 0);
    setEditFeedbackText(customer.feedbackText || '');
    setEditModalTab('orders');
    setPointHistory([]);
    setFeedbackHistory([]);
    setOrderHistory([]);
    setMessageHistory([]);
    setMessageSummary({ total: 0, sent: 0, failed: 0 });
    setOrderStartDate('');
    setOrderEndDate('');
    setEditModal(true);

    // Fetch customer details including point history, feedback history, and order history
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers/${customer.id}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPointHistory(Array.isArray(data.pointLedger) ? data.pointLedger : []);
        setFeedbackHistory(Array.isArray(data.feedbacks) ? data.feedbacks : []);
        setOrderHistory(Array.isArray(data.visitsOrOrders) ? data.visitsOrOrders : []);
      }
    } catch (err) {
      console.error('Failed to fetch customer details:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch customer message history
  const fetchCustomerMessages = async (customerId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers/${customerId}/messages?limit=50`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setMessageHistory(Array.isArray(data.messages) ? data.messages : []);
        setMessageSummary(data.summary || { total: 0, sent: 0, failed: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch customer messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Fetch orders with date filtering
  const fetchFilteredOrders = async (customerId: string, startDate?: string, endDate?: string) => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', '50');

      const res = await fetch(`${apiUrl}/api/customers/${customerId}/orders?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setOrderHistory(Array.isArray(data.orders) ? data.orders : []);
      }
    } catch (err) {
      console.error('Failed to fetch filtered orders:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle cancel order item
  const handleCancelOrderItem = async () => {
    if (!editingCustomer || !cancellingItem || !cancellingItemInfo) return;

    try {
      const res = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}/cancel-order-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          visitOrOrderId: cancellingItem.orderId,
          itemIndex: cancellingItem.itemIndex,
          cancelQuantity: cancelQuantity,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '주문 취소 중 오류가 발생했습니다.');
      }

      const result = await res.json();

      // Refresh order history
      if (orderStartDate || orderEndDate) {
        await fetchFilteredOrders(editingCustomer.id, orderStartDate, orderEndDate);
      } else {
        // Fetch fresh customer data
        const customerRes = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });
        if (customerRes.ok) {
          const data = await customerRes.json();
          setPointHistory(Array.isArray(data.pointLedger) ? data.pointLedger : []);
          setOrderHistory(Array.isArray(data.visitsOrOrders) ? data.visitsOrOrders : []);
          // Update editing customer's total points
          setEditingCustomer(prev => prev ? { ...prev, totalPoints: data.totalPoints } : null);
        }
      }

      // Refresh customer list to reflect updated points
      setRefreshKey((key) => key + 1);

      const deductMsg = result.pointsDeducted > 0
        ? ` (${formatNumber(result.pointsDeducted)}P 차감)`
        : '';
      showToast(`${result.message}${deductMsg}`, 'success');
    } catch (err: any) {
      showToast(err.message || '주문 취소 중 오류가 발생했습니다.', 'error');
    } finally {
      setCancelConfirmModal(false);
      setCancellingItem(null);
      setCancellingItemInfo(null);
      setCancelQuantity(1);
    }
  };

  const openCancelConfirm = (
    orderId: string,
    itemIndex: number,
    itemName: string,
    unitPrice: number,
    totalQty: number,
    cancelledQty: number
  ) => {
    const remainingQty = totalQty - cancelledQty;
    setCancellingItem({ orderId, itemIndex });
    setCancellingItemInfo({
      name: itemName,
      price: unitPrice * remainingQty,
      totalQty,
      remainingQty,
      unitPrice,
    });
    setCancelQuantity(remainingQty); // 기본값: 남은 수량 전체
    setCancelConfirmModal(true);
  };

  const handleEditCustomer = async () => {
    if (!editingCustomer) return;
    setSubmittingEdit(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          name: editName || null,
          gender: editGender,
          birthday: editBirthday || null,
          birthYear: editBirthYear ? parseInt(editBirthYear, 10) : null,
          memo: editMemo || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '고객 정보 수정 중 오류가 발생했습니다.');
      }

      setEditModal(false);
      setEditingCustomer(null);
      setShowDateFilter(false);
      setCancelMode(false);
      setRefreshKey((key) => key + 1);
      showToast('고객 정보가 수정되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '고객 정보 수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!editingCustomer) return;
    if (!window.confirm('이 고객을 삭제하시겠습니까?\n삭제된 고객의 모든 데이터(포인트, 주문내역, 피드백 등)가 함께 삭제되며 복구할 수 없습니다.')) return;

    setSubmittingEdit(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '고객 삭제 중 오류가 발생했습니다.');
      }

      setEditModal(false);
      setEditingCustomer(null);
      setShowDateFilter(false);
      setCancelMode(false);
      setRefreshKey((key) => key + 1);
      showToast('고객이 삭제되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '고객 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!addPhone) {
      showToast('전화번호는 필수입니다.', 'error');
      return;
    }

    setSubmittingAdd(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          name: addName || null,
          phone: addPhone,
          gender: addGender || null,
          birthday: addBirthday || null,
          birthYear: addBirthYear ? parseInt(addBirthYear, 10) : null,
          memo: addMemo || null,
          initialPoints: addInitialPoints ? parseInt(addInitialPoints, 10) : 0,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '고객 등록 중 오류가 발생했습니다.');
      }

      setAddModal(false);
      setAddName('');
      setAddPhone('');
      setAddGender('');
      setAddBirthday('');
      setAddBirthYear('');
      setAddMemo('');
      setAddInitialPoints('');
      setPage(1);
      setRefreshKey((key) => key + 1);
      showToast('고객이 등록되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '고객 등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // 샘플 엑셀 다운로드
  const handleDownloadSampleExcel = () => {
    const headers = ['전화번호', '이름', '성별', '생년(YYYY)', '생일(MM-DD)', '메모'];
    const sampleData = [
      ['01012345678', '홍길동', '남', 1990, '03-15', 'VIP고객'],
      ['01098765432', '김영희', '여', 1985, '11-20', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '고객목록');
    XLSX.writeFile(wb, '대량_고객등록_샘플.xlsx');
  };

  // 엑셀 파일 파싱
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

        if (rows.length < 2) {
          showToast('데이터가 없습니다. 헤더 아래에 데이터를 입력해주세요.', 'error');
          return;
        }

        // 헤더 매핑
        const headerRow = (rows[0] as any[]).map((h: any) => String(h || '').trim());
        const colMap: Record<string, number> = {};
        headerRow.forEach((h, idx) => {
          if (h.includes('전화') || h.includes('phone') || h.includes('Phone')) colMap.phone = idx;
          else if (h.includes('이름') || h.includes('name') || h.includes('Name')) colMap.name = idx;
          else if (h.includes('성별') || h.includes('gender') || h.includes('Gender')) colMap.gender = idx;
          else if (h.includes('생년') || h.includes('birthYear') || h.includes('Birth') && h.includes('Y')) colMap.birthYear = idx;
          else if (h.includes('생일') || h.includes('birthday') || h.includes('Birth') && h.includes('D')) colMap.birthday = idx;
          else if (h.includes('메모') || h.includes('memo') || h.includes('Memo')) colMap.memo = idx;
        });

        if (colMap.phone === undefined) {
          showToast('전화번호 컬럼을 찾을 수 없습니다. 헤더에 "전화번호"를 포함해주세요.', 'error');
          return;
        }

        const parsed: BulkRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.length === 0) continue;
          const phone = row[colMap.phone];
          if (!phone && !row[colMap.name ?? -1]) continue; // 완전 빈 행 스킵

          parsed.push({
            phone: phone ? String(phone).trim() : '',
            name: colMap.name !== undefined ? (row[colMap.name] ? String(row[colMap.name]).trim() : undefined) : undefined,
            gender: colMap.gender !== undefined ? (row[colMap.gender] ? String(row[colMap.gender]).trim() : undefined) : undefined,
            birthYear: colMap.birthYear !== undefined ? row[colMap.birthYear] : undefined,
            birthday: colMap.birthday !== undefined ? (row[colMap.birthday] ? String(row[colMap.birthday]).trim() : undefined) : undefined,
            memo: colMap.memo !== undefined ? (row[colMap.memo] ? String(row[colMap.memo]).trim() : undefined) : undefined,
          });
        }

        if (parsed.length === 0) {
          showToast('등록할 데이터가 없습니다.', 'error');
          return;
        }
        if (parsed.length > 500) {
          showToast(`최대 500건까지 등록 가능합니다. (현재 ${parsed.length}건)`, 'error');
          return;
        }

        setBulkParsedData(parsed);
        setBulkResult(null);
      } catch {
        showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    // input 초기화 (같은 파일 다시 선택 가능하도록)
    e.target.value = '';
  };

  // 대량 등록 API 호출
  const handleBulkUpload = async () => {
    if (bulkParsedData.length === 0) return;
    setBulkUploading(true);
    try {
      const res = await fetch(`${apiUrl}/api/customers/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ customers: bulkParsedData }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '대량 등록 중 오류가 발생했습니다.');
      }
      setBulkResult(data);
      if (data.created > 0) {
        setPage(1);
        setRefreshKey((key) => key + 1);
      }
    } catch (err: any) {
      showToast(err.message || '대량 등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setBulkUploading(false);
    }
  };

  const remainingPoints = selectedCustomer
    ? selectedCustomer.totalPoints - (parseInt(useAmount) || 0)
    : 0;

  const earnedPoints = selectedCustomer
    ? selectedCustomer.totalPoints + (parseInt(earnAmount) || 0)
    : 0;

  const getVisitDescription = (customer: Customer) => {
    const daysAgo = Math.floor(
      (new Date().getTime() - new Date(customer.lastVisitAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (customer.isNew) return '신규 고객';
    if (daysAgo > 90) return '90일 이상 미방문';
    if (customer.visitCount > 20) return `최근 3개월 ${Math.floor(customer.visitCount / 4)}회`;
    return `올해 ${Math.ceil(customer.visitCount / 3)}회`;
  };

  const closeAllDropdowns = () => {
    setGenderDropdownOpen(false);
    setVisitDropdownOpen(false);
    setLastVisitDropdownOpen(false);
    setDateRangeDropdownOpen(false);
  };

  const handleGenderSelect = (value: 'all' | 'MALE' | 'FEMALE') => {
    setGenderFilter(value);
    setGenderDropdownOpen(false);
    setPage(1);
  };

  const handleVisitSelect = (value: 'all' | '1' | '2' | '5' | '10' | '20') => {
    setVisitFilter(value);
    setVisitDropdownOpen(false);
    setPage(1);
  };

  const handleLastVisitSelect = (value: 'all' | '7' | '30' | '90') => {
    setLastVisitFilter(value);
    setLastVisitDropdownOpen(false);
    setPage(1);
  };

  const resetFilters = () => {
    setGenderFilter('all');
    setVisitFilter('all');
    setLastVisitFilter('all');
    setStartDate('');
    setEndDate('');
    setDateFilterType('lastVisit');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close dateRangeDropdown if click is inside it
      if (dateRangeDropdownOpen && dateRangeDropdownRef.current?.contains(event.target as Node)) {
        return;
      }
      closeAllDropdowns();
    };
    if (genderDropdownOpen || visitDropdownOpen || lastVisitDropdownOpen || dateRangeDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [genderDropdownOpen, visitDropdownOpen, lastVisitDropdownOpen, dateRangeDropdownOpen]);

  const genderOptions = [
    { value: 'all', label: '전체' },
    { value: 'MALE', label: '남성' },
    { value: 'FEMALE', label: '여성' },
  ];

  const visitOptions = [
    { value: 'all', label: '전체' },
    { value: '1', label: '1회' },
    { value: '2', label: '2회' },
    { value: '5', label: '5회 이상' },
    { value: '10', label: '10회 이상' },
    { value: '20', label: '20회 이상' },
  ];

  const lastVisitOptions = [
    { value: 'all', label: '전체' },
    { value: '7', label: '최근 7일' },
    { value: '30', label: '최근 30일' },
    { value: '90', label: '최근 90일' },
  ];

  return (
    <div className="p-6 lg:p-8">
      {ToastComponent}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="mb-6 space-y-3">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-200 rounded-lg"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Megaphone className="w-5 h-5 text-brand-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="info" className="text-xs">공지</Badge>
                  <span className="font-medium text-neutral-900">{announcement.title}</span>
                </div>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{announcement.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">고객 리스트</h1>
          <p className="text-sm text-neutral-500 mt-1">
            전체 고객 {formatNumber(pagination.total)}명
          </p>
        </div>
        <div className="flex gap-3">
          {selectedCustomers.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const selectedData = customers
                  .filter(c => selectedCustomers.includes(c.id))
                  .map(c => ({ id: c.id, name: c.name, phone: c.phone }));
                const params = encodeURIComponent(JSON.stringify(selectedData));
                router.push(`/messages?customers=${params}`);
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              선택 고객에게 메시지 발송 ({selectedCustomers.length}명)
            </Button>
          )}
          <Button onClick={() => setAddModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            고객 등록
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setBulkModal(true);
              setBulkParsedData([]);
              setBulkResult(null);
            }}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            대량 등록
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              placeholder="이름, 전화번호, 메모 검색"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              전체 보기
            </Button>

            {/* Gender Filter Dropdown */}
            <div className="relative">
              <Button
                variant={genderFilter === 'all' ? 'outline' : 'secondary'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setGenderDropdownOpen(!genderDropdownOpen);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                성별 {genderOptions.find(o => o.value === genderFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {genderDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {genderOptions.map((option) => (
                    <button
                      key={option.value}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                      onClick={() => handleGenderSelect(option.value as 'all' | 'MALE' | 'FEMALE')}
                    >
                      {option.label}
                      {genderFilter === option.value && (
                        <Check className="w-4 h-4 text-brand-800" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Visit Count Filter Dropdown */}
            <div className="relative">
              <Button
                variant={visitFilter === 'all' ? 'outline' : 'secondary'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setVisitDropdownOpen(!visitDropdownOpen);
                  setGenderDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                방문 횟수 {visitOptions.find(o => o.value === visitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {visitDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {visitOptions.map((option) => (
                    <button
                      key={option.value}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                      onClick={() => handleVisitSelect(option.value as 'all' | '1' | '2' | '5' | '10' | '20')}
                    >
                      {option.label}
                      {visitFilter === option.value && (
                        <Check className="w-4 h-4 text-brand-800" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Last Visit Filter Dropdown */}
            <div className="relative">
              <Button
                variant={lastVisitFilter === 'all' ? 'outline' : 'secondary'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setLastVisitDropdownOpen(!lastVisitDropdownOpen);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                마지막 방문 {lastVisitOptions.find(o => o.value === lastVisitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {lastVisitDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {lastVisitOptions.map((option) => (
                    <button
                      key={option.value}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                      onClick={() => handleLastVisitSelect(option.value as 'all' | '7' | '30' | '90')}
                    >
                      {option.label}
                      {lastVisitFilter === option.value && (
                        <Check className="w-4 h-4 text-brand-800" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range Filter Dropdown */}
            <div className="relative" ref={dateRangeDropdownRef}>
              <Button
                variant={(startDate || endDate) ? 'secondary' : 'outline'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDateRangeDropdownOpen(!dateRangeDropdownOpen);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" />
                {(startDate || endDate) ? (
                  <span className="text-xs">
                    {startDate && endDate ? `${startDate.slice(5)} ~ ${endDate.slice(5)}` : startDate ? `${startDate.slice(5)} ~` : `~ ${endDate.slice(5)}`}
                  </span>
                ) : (
                  '기간'
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {dateRangeDropdownOpen && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[240px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Date type selector */}
                  <div className="mb-3 space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="dateType"
                        checked={dateFilterType === 'lastVisit'}
                        onChange={() => setDateFilterType('lastVisit')}
                        className="text-brand-800 focus:ring-brand-800"
                      />
                      <span className="text-sm text-neutral-700">마지막 방문일</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="dateType"
                        checked={dateFilterType === 'created'}
                        onChange={() => setDateFilterType('created')}
                        className="text-brand-800 focus:ring-brand-800"
                      />
                      <span className="text-sm text-neutral-700">가입일</span>
                    </label>
                  </div>

                  {/* Date inputs */}
                  <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">시작일</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">종료일</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStartDate('');
                        setEndDate('');
                        setDateFilterType('lastVisit');
                        setPage(1);
                      }}
                      className="flex-1 text-sm"
                    >
                      초기화
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRangeDropdownOpen(false);
                        setPage(1);
                      }}
                      className="flex-1 text-sm"
                    >
                      적용
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Column Settings Dropdown */}
            <div className="relative" ref={columnSettingsRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setColumnSettingsOpen(!columnSettingsOpen);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                <Settings2 className="w-3.5 h-3.5" />
                컬럼
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {columnSettingsOpen && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-2 min-w-[180px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 pb-2 border-b border-neutral-100 mb-2">
                    <span className="text-xs font-medium text-neutral-500">표시할 컬럼</span>
                  </div>
                  {COLUMN_DEFINITIONS.map((column) => (
                    <label
                      key={column.id}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-50 ${column.required ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.id)}
                        disabled={column.required}
                        onChange={() => toggleColumn(column.id)}
                        className="rounded border-neutral-300"
                      />
                      <span className="text-sm text-neutral-700">{column.label}</span>
                      {column.required && <span className="text-xs text-neutral-400">(필수)</span>}
                    </label>
                  ))}
                  <div className="px-3 pt-2 mt-2 border-t border-neutral-100">
                    <button
                      onClick={resetColumnsToDefault}
                      className="text-xs text-neutral-500 hover:text-neutral-700"
                    >
                      기본값으로 초기화
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Customer Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="p-4 w-12">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCustomers(customers.map((c) => c.id));
                      } else {
                        setSelectedCustomers([]);
                      }
                    }}
                  />
                </th>
                {isColumnVisible('nickname') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    닉네임
                  </th>
                )}
                {isColumnVisible('phone') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    전화번호
                  </th>
                )}
                {isColumnVisible('points') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    적립 포인트
                  </th>
                )}
                {isColumnVisible('stamps') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    스탬프
                  </th>
                )}
                {isColumnVisible('birthday') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    생일 / 연령대
                  </th>
                )}
                {isColumnVisible('memo') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    메모
                  </th>
                )}
                {isColumnVisible('visitSource') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    방문 경로
                  </th>
                )}
                {isColumnVisible('tableLabel') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    좌석
                  </th>
                )}
                {isColumnVisible('visitCount') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    방문 횟수
                  </th>
                )}
                {surveyQuestionLabels.map((sq) => (
                  <th key={sq.id} className="p-4 text-left text-sm font-medium text-neutral-600">
                    {sq.label}
                  </th>
                ))}
                {isColumnVisible('actions') && (
                  <th className="p-4 text-left text-sm font-medium text-neutral-600">
                    액션
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={visibleColumnCount} className="p-8 text-center text-neutral-500">
                    불러오는 중...
                  </td>
                </tr>
              )}
              {!isLoading && error && (
                <tr>
                  <td colSpan={visibleColumnCount} className="p-8 text-center text-error">
                    {error}
                  </td>
                </tr>
              )}
              {!isLoading && !error && customers.length === 0 && (
                <tr>
                  <td colSpan={visibleColumnCount} className="p-8 text-center text-neutral-500">
                    결과가 없습니다.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                customers.map((customer) => {
                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer"
                      onClick={() => openEditModal(customer)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-neutral-300"
                          checked={selectedCustomers.includes(customer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCustomers([...selectedCustomers, customer.id]);
                            } else {
                              setSelectedCustomers(
                                selectedCustomers.filter((id) => id !== customer.id)
                              );
                            }
                          }}
                        />
                      </td>
                      {isColumnVisible('nickname') && (
                        <td className="p-4">
                          <span className="font-medium text-neutral-900">
                            {maskNickname(customer.name)}
                          </span>
                        </td>
                      )}
                      {isColumnVisible('phone') && (
                        <td className="p-4 text-neutral-600">
                          <div className="flex items-center gap-2">
                            <span>{formatPhone(customer.phone)}</span>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('points') && (
                        <td className="p-4 font-medium text-neutral-900">
                          {formatNumber(customer.totalPoints)} p
                        </td>
                      )}
                      {isColumnVisible('stamps') && (
                        <td className="p-4 text-neutral-600">
                          {customer.totalStamps || 0}
                        </td>
                      )}
                      {isColumnVisible('birthday') && (
                        <td className="p-4 text-neutral-600">
                          <div className="flex flex-col gap-0.5">
                            <span>{formatBirthdayMonth(customer.birthday)}</span>
                            <span className="text-xs text-neutral-500">{getAgeGroup(customer.birthYear)}</span>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('memo') && (
                        <td className="p-4 max-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-600 truncate text-sm">
                              {customer.memo || '-'}
                            </span>
                            <button className="flex-shrink-0 p-1 hover:bg-neutral-100 rounded">
                              <Edit2 className="w-3.5 h-3.5 text-neutral-400" />
                            </button>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('visitSource') && (
                        <td className="p-4">
                          <span className="text-neutral-600 text-sm">
                            {customer.visitSource
                              ? visitSourceLabelMap[customer.visitSource] || customer.visitSource
                              : '-'}
                          </span>
                        </td>
                      )}
                      {isColumnVisible('tableLabel') && (
                        <td className="p-4">
                          <span className="text-neutral-600 text-sm">
                            {customer.lastTableLabel || '-'}
                          </span>
                        </td>
                      )}
                      {isColumnVisible('visitCount') && (
                        <td className="p-4">
                          <div>
                            <span className="font-medium text-neutral-900">
                              {customer.visitCount}회
                            </span>
                            <p className="text-xs text-neutral-500">
                              {getVisitDescription(customer)}
                            </p>
                          </div>
                        </td>
                      )}
                      {surveyQuestionLabels.map((sq) => {
                        const answer = customer.surveyAnswers?.find((a) => a.questionId === sq.id);
                        return (
                          <td key={sq.id} className="p-4">
                            <span className="text-neutral-600 text-sm">
                              {answer?.valueDate
                                ? new Date(answer.valueDate).toLocaleDateString('ko-KR')
                                : answer?.valueText || '-'}
                            </span>
                          </td>
                        );
                      })}
                      {isColumnVisible('actions') && (
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openUsePointsModal(customer)}
                            >
                              포인트 사용
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setEarnPointsModal(true);
                              }}
                            >
                              포인트 적립
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-neutral-200">
          <span className="text-sm text-neutral-500">
            {formatNumber((page - 1) * pageSize + (customers.length ? 1 : 0))}-
            {formatNumber((page - 1) * pageSize + customers.length)} of{' '}
            {formatNumber(pagination.total)} customers
          </span>
          <div className="flex items-center gap-3">
            <select
              className="border border-neutral-200 rounded-md text-sm text-neutral-700 px-2 py-1 bg-white"
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              <option value={20}>20 / 페이지</option>
              <option value={50}>50 / 페이지</option>
            </select>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Use Points Modal */}
      <Modal open={usePointsModal} onOpenChange={setUsePointsModal}>
        <ModalContent className="sm:max-w-lg">
          <ModalHeader>
            <ModalTitle>포인트 사용</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            {/* Target */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">
                사용 대상
              </label>
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <span className="text-neutral-400">사용 대상</span>
                <span className="font-medium text-neutral-900">
                  {maskNickname(selectedCustomer?.name)}
                </span>
              </div>
            </div>

            {/* Available Points */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">
                보유 포인트
              </label>
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <span className="text-neutral-400">보유 포인트</span>
                <span className="font-semibold text-neutral-900">
                  {formatNumber(selectedCustomer?.totalPoints || 0)} p
                </span>
              </div>
            </div>

            {/* Use Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">
                사용할 포인트
              </label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0"
                  value={useAmount}
                  onChange={(e) => setUseAmount(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  p
                </span>
              </div>
              <div className="text-right text-sm text-neutral-500">
                사용 후 잔액{' '}
                <span className="font-medium text-neutral-900">
                  {formatNumber(Math.max(0, remainingPoints))} p
                </span>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">
                사용 사유 (선택)
              </label>
              <Input
                placeholder="예: 단골 서비스"
                value={useReason}
                onChange={(e) => setUseReason(e.target.value)}
              />
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => setUsePointsModal(false)}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={() => {
                setUsePointsModal(false);
                setUseConfirmModal(true);
              }}
              disabled={
                !useAmount ||
                parseInt(useAmount) <= 0 ||
                parseInt(useAmount) > (selectedCustomer?.totalPoints || 0) ||
                submittingUse
              }
              className="flex-1"
            >
              사용하기
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Use Points Confirm Modal */}
      <Modal open={useConfirmModal} onOpenChange={(open) => {
        setUseConfirmModal(open);
        if (!open) {
          setUsePointsModal(true);
        }
      }}>
        <ModalContent className="sm:max-w-sm">
          <ModalHeader>
            <ModalTitle>포인트 사용 확인</ModalTitle>
          </ModalHeader>
          <div className="py-4 text-center space-y-2">
            <p className="text-neutral-600">
              <span className="font-semibold text-neutral-900">{maskNickname(selectedCustomer?.name)}</span> 님의 포인트를
            </p>
            <p className="text-2xl font-bold text-red-500">
              {formatNumber(parseInt(useAmount) || 0)} p 사용
            </p>
            <p className="text-sm text-neutral-500">
              사용 후 잔액: {formatNumber(Math.max(0, (selectedCustomer?.totalPoints || 0) - (parseInt(useAmount) || 0)))} p
            </p>
          </div>
          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setUseConfirmModal(false);
                setUsePointsModal(true);
              }}
              className="flex-1"
            >
              돌아가기
            </Button>
            <Button
              onClick={() => {
                setUseConfirmModal(false);
                handleUsePoints();
              }}
              disabled={submittingUse}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              {submittingUse ? '처리 중...' : '확인'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Earn Points Modal */}
      <Modal open={earnPointsModal} onOpenChange={setEarnPointsModal}>
        <ModalContent className="sm:max-w-lg">
          <ModalHeader>
            <ModalTitle>포인트 적립</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">적립 대상</label>
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <span className="text-neutral-400">적립 대상</span>
                <span className="font-medium text-neutral-900">{maskNickname(selectedCustomer?.name)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">현재 보유 포인트</label>
              <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <span className="text-neutral-400">보유 포인트</span>
                <span className="font-semibold text-neutral-900">
                  {formatNumber(selectedCustomer?.totalPoints || 0)} p
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">적립할 포인트</label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0"
                  value={earnAmount}
                  onChange={(e) => setEarnAmount(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">p</span>
              </div>
              <div className="text-right text-sm text-neutral-500">
                적립 후 잔액{' '}
                <span className="font-medium text-neutral-900">{formatNumber(earnedPoints)} p</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">적립 사유 (선택)</label>
              <Input
                placeholder="예: 방문 적립"
                value={earnReason}
                onChange={(e) => setEarnReason(e.target.value)}
              />
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => setEarnPointsModal(false)}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={handleEarnPoints}
              disabled={!earnAmount || parseInt(earnAmount) <= 0 || submittingEarn}
              className="flex-1"
            >
              {submittingEarn ? '처리 중...' : '적립하기'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal open={editModal} onOpenChange={setEditModal}>
        <ModalContent className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-x-hidden">
          <ModalHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <ModalTitle>고객 정보</ModalTitle>
              {editingCustomer?.isVip && <Badge variant="vip">VIP</Badge>}
              {editingCustomer?.isNew && <Badge variant="new">신규</Badge>}
            </div>
          </ModalHeader>

          <div className="py-4 overflow-y-auto overflow-x-hidden flex-1 px-1">
            {/* 2-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden h-full min-h-[400px]">
              {/* Left Column - Customer Info Form */}
              <div className="space-y-4 min-w-0">
                {/* Read-only info: Visit count, last visit, points, total order */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-xs text-neutral-500 mb-1">방문 횟수</p>
                    <p className="font-semibold text-neutral-900">
                      {editingCustomer?.visitCount || 0}회
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-xs text-neutral-500 mb-1">마지막 방문일</p>
                    <p className="font-semibold text-neutral-900">
                      {editingCustomer?.lastVisitAt ? formatDate(editingCustomer.lastVisitAt) : '-'}
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-xs text-neutral-500 mb-1">적립 포인트</p>
                    <p className="font-semibold text-neutral-900">
                      {formatNumber(editingCustomer?.totalPoints || 0)} P
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-xs text-neutral-500 mb-1">스탬프</p>
                    <p className="font-semibold text-neutral-900">
                      {(editingCustomer as any)?.totalStamps || 0}개
                    </p>
                  </div>
                </div>

                {/* Stamp Use Section */}
                {((editingCustomer as any)?.totalStamps || 0) > 0 && (
                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-neutral-700">스탬프 보상 사용</p>
                    <div className="flex flex-wrap gap-2">
                      {stampRewardTiers.map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          disabled={((editingCustomer as any)?.totalStamps || 0) < amount || submittingEdit}
                          onClick={async () => {
                            if (!editingCustomer) return;
                            setSubmittingEdit(true);
                            try {
                              const token = getAuthToken();
                              const res = await fetch(`${apiUrl}/api/stamps/use`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                  customerId: editingCustomer.id,
                                  amount,
                                }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setEditingCustomer(prev => prev ? { ...prev, totalStamps: data.remainingStamps } as any : null);
                                showToast(`스탬프 ${amount}개가 사용되었습니다.`, 'success');
                                setRefreshKey(prev => prev + 1);
                              } else {
                                const error = await res.json();
                                showToast(error.error || '스탬프 사용에 실패했습니다.', 'error');
                              }
                            } catch (error) {
                              showToast('스탬프 사용 중 오류가 발생했습니다.', 'error');
                            } finally {
                              setSubmittingEdit(false);
                            }
                          }}
                          className="flex-1 min-w-[70px]"
                        >
                          {amount}개 사용
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-500">
                      고객이 보상을 요청하면 해당 버튼을 눌러주세요.
                    </p>
                  </div>
                )}

                {/* Nickname */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">닉네임</label>
                  <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                    {maskNickname(editName)}
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">성별</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                        editGender === 'MALE'
                          ? 'border-brand-800 bg-brand-50 text-brand-800'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                      onClick={() => setEditGender('MALE')}
                    >
                      남성
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                        editGender === 'FEMALE'
                          ? 'border-brand-800 bg-brand-50 text-brand-800'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                      }`}
                      onClick={() => setEditGender('FEMALE')}
                    >
                      여성
                    </button>
                  </div>
                </div>

                {/* Birthday and Age Group */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-600">생일</label>
                    <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                      {editBirthday ? formatBirthdayMonth(editBirthday).replace(' 생일', '') : '-'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-600">연령대</label>
                    <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                      {editBirthYear ? getAgeGroup(parseInt(editBirthYear, 10)) : '-'}
                    </div>
                  </div>
                </div>

                {/* Memo (moved here for left column) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">메모</label>
                  <textarea
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
                    rows={3}
                    placeholder="고객에 대한 메모를 입력하세요"
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                  />
                </div>
              </div>

              {/* Right Column - Tabs for Orders, Feedback, History */}
              <div className="flex flex-col min-w-0 overflow-hidden h-full">
                {/* Tab Headers - 2 rows, 3 columns grid */}
                <div className="flex-shrink-0 border-b border-neutral-200">
                  <div className="grid grid-cols-3 gap-1">
                    {/* Row 1 */}
                    <button
                      type="button"
                      onClick={() => setEditModalTab('orders')}
                      className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        editModalTab === 'orders'
                          ? 'border-brand-800 text-brand-800 bg-brand-50'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                      <span>주문</span>
                      {(orderHistory?.length || 0) > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                          {orderHistory.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditModalTab('feedback')}
                      className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        editModalTab === 'feedback'
                          ? 'border-brand-800 text-brand-800 bg-brand-50'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                      <span>피드백</span>
                      {(feedbackHistory?.length || 0) > 0 && (
                        <span className="text-yellow-500">★{feedbackHistory.length}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditModalTab('history')}
                      className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        editModalTab === 'history'
                          ? 'border-brand-800 text-brand-800 bg-brand-50'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <History className="w-4 h-4 flex-shrink-0" />
                      <span>포인트</span>
                      {(pointHistory?.length || 0) > 0 && (
                        <span className="text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">
                          {pointHistory.length}
                        </span>
                      )}
                    </button>
                    {/* Row 2 */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditModalTab('messages');
                        if (editingCustomer && messageHistory.length === 0) {
                          fetchCustomerMessages(editingCustomer.id);
                        }
                      }}
                      className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        editModalTab === 'messages'
                          ? 'border-brand-800 text-brand-800 bg-brand-50'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <Send className="w-4 h-4 flex-shrink-0" />
                      <span>발송내역</span>
                      {messageSummary.total > 0 && (
                        <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                          {messageSummary.total}
                        </span>
                      )}
                    </button>
                    {/* Empty cells for grid alignment */}
                    <div></div>
                    <div></div>
                  </div>
                </div>

                {/* Orders Tab */}
                {editModalTab === 'orders' && (
                  <div className="flex-1 overflow-hidden flex flex-col mt-3">
                    {/* Action Buttons - Tablet Friendly */}
                    <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0">
                      <Button
                        variant={showDateFilter ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setShowDateFilter(!showDateFilter)}
                        className="text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        날짜 조회
                      </Button>
                      <Button
                        variant={cancelMode ? 'destructive' : 'secondary'}
                        size="sm"
                        onClick={() => setCancelMode(!cancelMode)}
                        className="text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        적립 취소
                      </Button>
                    </div>

                    {/* Date Filter - Conditional */}
                    {showDateFilter && (
                      <div className="mb-3 flex-shrink-0 p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={orderStartDate}
                            onChange={(e) => setOrderStartDate(e.target.value)}
                            className="px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800 flex-1 min-w-0"
                          />
                          <span className="text-neutral-400 text-sm">~</span>
                          <input
                            type="date"
                            value={orderEndDate}
                            onChange={(e) => setOrderEndDate(e.target.value)}
                            className="px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800 flex-1 min-w-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              if (editingCustomer) {
                                fetchFilteredOrders(editingCustomer.id, orderStartDate, orderEndDate);
                              }
                            }}
                            disabled={loadingHistory}
                            className="text-sm px-4 py-1.5 h-auto flex-1"
                          >
                            조회
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOrderStartDate('');
                              setOrderEndDate('');
                              if (editingCustomer) {
                                fetchFilteredOrders(editingCustomer.id, '', '');
                              }
                            }}
                            className="text-sm px-4 py-1.5 h-auto flex-1 text-neutral-500"
                          >
                            초기화
                          </Button>
                        </div>
                      </div>
                    )}

                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && (orderHistory?.length || 0) === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        주문 내역이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && (orderHistory?.length || 0) > 0 && (
                      <div className="flex-1 overflow-hidden relative">
                        <div className="h-full overflow-y-auto space-y-3 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
                          {(orderHistory || []).map((order) => (
                            <div
                              key={order.id}
                              className="p-3 bg-neutral-50 rounded-lg border border-neutral-100"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-neutral-900">
                                    {order.totalAmount ? `${formatNumber(order.totalAmount)}원` : '금액 미입력'}
                                  </span>
                                  {order.tableNumber && (
                                    <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                      {order.tableNumber}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-neutral-400">
                                  {formatDate(order.visitedAt)} {new Date(order.visitedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </div>
                              {getOrderItems(order.items).length > 0 ? (
                                <div className="space-y-1.5 pt-1 border-t border-neutral-200 mt-2">
                                  {getOrderItems(order.items).map((item: OrderItem, idx: number) => {
                                    const menuName = item.label || item.name || item.menuName || item.productName || item.title || '(메뉴명 없음)';
                                    const qty = item.count || item.quantity || item.qty || 1;
                                    const itemPrice = typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.amount || item.totalPrice || 0);
                                    const cancelledQty = item.cancelledQuantity || 0;
                                    const isFullyCancelled = item.cancelled === true || cancelledQty >= qty;
                                    const isPartlyCancelled = cancelledQty > 0 && cancelledQty < qty;
                                    const remainingQty = qty - cancelledQty;

                                    return (
                                      <div key={idx} className={`flex items-center justify-between text-sm py-0.5 group ${isFullyCancelled ? 'opacity-50' : ''}`}>
                                        <div className={`flex-1 pr-2 ${isFullyCancelled ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                                          <span className="truncate">
                                            {menuName}
                                            {qty > 1 && (
                                              <span className="text-neutral-400 ml-1">x{qty}</span>
                                            )}
                                            {isFullyCancelled && (
                                              <span className="ml-2 text-xs text-red-500">(취소됨)</span>
                                            )}
                                            {isPartlyCancelled && (
                                              <span className="ml-2 text-xs text-orange-500">({cancelledQty}개 취소)</span>
                                            )}
                                          </span>
                                          {item.option && (
                                            <div className="text-xs text-neutral-400 mt-0.5">{item.option}</div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {itemPrice > 0 && (
                                            <span className={`${isFullyCancelled ? 'text-neutral-400 line-through' : 'text-neutral-500'}`}>
                                              {formatNumber(itemPrice)}원
                                            </span>
                                          )}
                                          {!isFullyCancelled && cancelMode && remainingQty > 0 && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openCancelConfirm(order.id, idx, menuName, itemPrice, qty, cancelledQty);
                                              }}
                                              className="p-1.5 rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
                                              title="적립 취소"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-neutral-400">메뉴 정보 없음</p>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Scroll indicator gradient */}
                        <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback Tab */}
                {editModalTab === 'feedback' && (
                  <div className="flex-1 overflow-hidden flex flex-col mt-3">
                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && (feedbackHistory?.length || 0) === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        고객이 남긴 피드백이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && (feedbackHistory?.length || 0) > 0 && (
                      <div className="flex-1 overflow-hidden relative">
                        <div className="h-full overflow-y-auto space-y-3 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
                          {(feedbackHistory || []).map((feedback) => (
                            <div
                              key={feedback.id}
                              className="p-3 bg-neutral-50 rounded-lg border border-neutral-100"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <StarRating rating={feedback.rating} readonly />
                                <span className="text-xs text-neutral-400">
                                  {formatDate(feedback.createdAt)}
                                </span>
                              </div>
                              {feedback.text && (
                                <p className="text-sm text-neutral-700">{feedback.text}</p>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Scroll indicator gradient */}
                        <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}

                {/* Point History Tab */}
                {editModalTab === 'history' && (
                  <div className="flex-1 overflow-hidden flex flex-col mt-3">
                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && (pointHistory?.length || 0) === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        포인트 내역이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && (pointHistory?.length || 0) > 0 && (
                      <div className="flex-1 overflow-hidden relative">
                        <div className="h-full overflow-y-auto space-y-2 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
                          {(pointHistory || []).map((entry) => {
                            // ordersheetId가 포함된 reason을 필터링하여 표시
                            let displayReason = entry.reason;
                            if (displayReason && displayReason.includes('ordersheetId')) {
                              // "TagHere 주문 적립 (ordersheetId: xxx)" -> "TagHere 주문 적립"
                              displayReason = displayReason.replace(/\s*\(ordersheetId:.*?\)/gi, '').trim();
                            }
                            if (!displayReason) {
                              displayReason = entry.type === 'EARN' ? '포인트 적립' : entry.type === 'USE' ? '포인트 사용' : entry.type;
                            }

                            return (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-sm font-semibold ${
                                        entry.delta > 0 ? 'text-green-600' : 'text-red-600'
                                      }`}
                                    >
                                      {entry.delta > 0 ? '+' : ''}{formatNumber(entry.delta)} P
                                    </span>
                                    <span className="text-xs text-neutral-400">
                                      잔액 {formatNumber(entry.balance)} P
                                    </span>
                                    {entry.tableLabel && (
                                      <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                        {entry.tableLabel}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-neutral-500 mt-0.5">
                                    {displayReason}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-neutral-400">
                                    {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Scroll indicator gradient */}
                        <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}

                {/* Messages Tab */}
                {editModalTab === 'messages' && (
                  <div className="flex-1 overflow-hidden flex flex-col mt-3">
                    {/* Summary */}
                    {messageSummary.total > 0 && (
                      <div className="mb-3 flex-shrink-0 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-neutral-600">
                            총 <span className="font-semibold text-neutral-900">{messageSummary.total}</span>건
                          </span>
                          <span className="text-green-600">
                            성공 <span className="font-semibold">{messageSummary.sent}</span>건
                          </span>
                          {messageSummary.failed > 0 && (
                            <span className="text-red-500">
                              실패 <span className="font-semibold">{messageSummary.failed}</span>건
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {loadingMessages && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingMessages && messageHistory.length === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        발송 내역이 없습니다.
                      </div>
                    )}
                    {!loadingMessages && messageHistory.length > 0 && (
                      <div className="flex-1 overflow-hidden relative">
                        <div className="h-full overflow-y-auto pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white">
                              <tr className="border-b border-neutral-200">
                                <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">발송일</th>
                                <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">상태</th>
                                <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">내용</th>
                              </tr>
                            </thead>
                            <tbody>
                              {messageHistory.map((msg) => (
                                <tr key={msg.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                                  <td className="py-2 px-2 text-neutral-600 whitespace-nowrap">
                                    <div className="text-xs">
                                      {formatDate(msg.createdAt)}
                                    </div>
                                    <div className="text-xs text-neutral-400">
                                      {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2">
                                    {msg.status === 'SENT' ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                        <Check className="w-3 h-3" />
                                        성공
                                      </span>
                                    ) : msg.status === 'FAILED' ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                        <X className="w-3 h-3" />
                                        실패
                                      </span>
                                    ) : (
                                      <span className="text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                        대기
                                      </span>
                                    )}
                                    {msg.failReason && (
                                      <div className="text-xs text-red-400 mt-0.5 max-w-[100px] truncate" title={msg.failReason}>
                                        {msg.failReason}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-neutral-700">
                                    <div className="max-w-[200px] truncate" title={msg.content}>
                                      {msg.content}
                                    </div>
                                    {msg.campaignTitle && (
                                      <div className="text-xs text-neutral-400 mt-0.5 truncate">
                                        {msg.campaignTitle}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Scroll indicator gradient */}
                        <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <ModalFooter className="flex-shrink-0">
            <Button
              variant="ghost"
              onClick={handleDeleteCustomer}
              disabled={submittingEdit}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 mr-auto"
            >
              고객 삭제
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditModal(false);
                setShowDateFilter(false);
                setCancelMode(false);
              }}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={handleEditCustomer}
              disabled={submittingEdit}
              className="flex-1"
            >
              {submittingEdit ? '저장 중...' : '저장하기'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Add Customer Modal */}
      <Modal open={addModal} onOpenChange={setAddModal}>
        <ModalContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <ModalHeader className="flex-shrink-0">
            <ModalTitle>고객 등록</ModalTitle>
          </ModalHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1">
            {/* Phone - Required */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">
                전화번호 <span className="text-red-500">*</span>
              </label>
              <Input
                type="tel"
                placeholder="010-0000-0000"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
              />
              <p className="text-xs text-neutral-500">
                하이픈(-) 없이 숫자만 입력해도 됩니다.
              </p>
            </div>

            {/* Nickname */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">닉네임</label>
              <Input
                type="text"
                placeholder="닉네임을 입력하세요"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
              {addName && (
                <p className="text-xs text-neutral-500">표시: {maskNickname(addName)}</p>
              )}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">성별</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                    addGender === 'MALE'
                      ? 'border-brand-800 bg-brand-50 text-brand-800'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                  onClick={() => setAddGender('MALE')}
                >
                  남성
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                    addGender === 'FEMALE'
                      ? 'border-brand-800 bg-brand-50 text-brand-800'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                  onClick={() => setAddGender('FEMALE')}
                >
                  여성
                </button>
              </div>
            </div>

            {/* Birthday and Birth Year */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-600">생일 (MM-DD)</label>
                <Input
                  type="text"
                  placeholder="01-15"
                  value={addBirthday}
                  onChange={(e) => setAddBirthday(e.target.value)}
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-600">출생연도</label>
                <Input
                  type="number"
                  placeholder="1990"
                  value={addBirthYear}
                  onChange={(e) => setAddBirthYear(e.target.value)}
                  min={1900}
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            {/* Initial Points */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">초기 포인트</label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0"
                  value={addInitialPoints}
                  onChange={(e) => setAddInitialPoints(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">p</span>
              </div>
              <p className="text-xs text-neutral-500">
                등록 시 지급할 포인트를 입력하세요. (선택)
              </p>
            </div>

            {/* Memo */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">메모</label>
              <textarea
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
                rows={3}
                placeholder="고객에 대한 메모를 입력하세요"
                value={addMemo}
                onChange={(e) => setAddMemo(e.target.value)}
              />
            </div>
          </div>

          <ModalFooter className="flex-shrink-0">
            <Button
              variant="secondary"
              onClick={() => setAddModal(false)}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={handleAddCustomer}
              disabled={!addPhone || submittingAdd}
              className="flex-1"
            >
              {submittingAdd ? '등록 중...' : '등록하기'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal open={bulkModal} onOpenChange={setBulkModal}>
        <ModalContent className="sm:max-w-2xl">
          <ModalHeader>
            <ModalTitle>대량 고객 등록</ModalTitle>
          </ModalHeader>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* 안내 + 샘플 다운로드 */}
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                엑셀 파일로 고객을 일괄 등록할 수 있습니다. (최대 500건)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadSampleExcel}
              >
                <Download className="w-4 h-4 mr-1" />
                샘플 다운로드
              </Button>
            </div>

            {/* 파일 업로드 */}
            <div>
              <input
                ref={bulkFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full py-8 border-dashed border-2"
                onClick={() => bulkFileInputRef.current?.click()}
              >
                <Upload className="w-5 h-5 mr-2" />
                {bulkParsedData.length > 0
                  ? `${bulkParsedData.length}건 로드됨 (다시 선택하려면 클릭)`
                  : '엑셀 파일 선택 (.xlsx, .xls, .csv)'}
              </Button>
            </div>

            {/* 미리보기 테이블 */}
            {bulkParsedData.length > 0 && !bulkResult && (
              <div>
                <p className="text-sm font-medium text-neutral-700 mb-2">
                  미리보기 (처음 10건)
                </p>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">#</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">전화번호*</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">이름</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">성별</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">생년</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">생일</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-600">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkParsedData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className={`border-t ${!row.phone ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2 text-neutral-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            {row.phone || <span className="text-red-500 text-xs">전화번호 없음</span>}
                          </td>
                          <td className="px-3 py-2">{row.name || '-'}</td>
                          <td className="px-3 py-2">{row.gender || '-'}</td>
                          <td className="px-3 py-2">{row.birthYear || '-'}</td>
                          <td className="px-3 py-2">{row.birthday || '-'}</td>
                          <td className="px-3 py-2">{row.memo || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bulkParsedData.length > 10 && (
                  <p className="text-xs text-neutral-500 mt-1">
                    외 {bulkParsedData.length - 10}건 더 있음
                  </p>
                )}
              </div>
            )}

            {/* 결과 표시 */}
            {bulkResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{bulkResult.created}</p>
                    <p className="text-xs text-green-600">등록 성공</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-700">{bulkResult.skipped}</p>
                    <p className="text-xs text-yellow-600">중복 스킵</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-700">{bulkResult.errors.length}</p>
                    <p className="text-xs text-red-600">오류</p>
                  </div>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-sm font-medium text-red-700 mb-1">오류 목록:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {bulkResult.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>행 {err.row}: {err.phone ? `${err.phone} - ` : ''}{err.reason}</li>
                      ))}
                      {bulkResult.errors.length > 10 && (
                        <li>외 {bulkResult.errors.length - 10}건...</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <ModalFooter className="flex-shrink-0">
            <Button
              variant="secondary"
              onClick={() => setBulkModal(false)}
              className="flex-1"
            >
              {bulkResult ? '닫기' : '취소'}
            </Button>
            {!bulkResult && (
              <Button
                onClick={handleBulkUpload}
                disabled={bulkParsedData.length === 0 || bulkUploading}
                className="flex-1"
              >
                {bulkUploading ? '등록 중...' : `${bulkParsedData.length}건 등록하기`}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Cancel Order Item Confirm Modal */}
      <Modal open={cancelConfirmModal} onOpenChange={(open) => {
        setCancelConfirmModal(open);
        if (!open) {
          setCancellingItem(null);
          setCancellingItemInfo(null);
          setCancelQuantity(1);
        }
      }}>
        <ModalContent className="sm:max-w-md">
          <ModalHeader>
            <ModalTitle>주문 취소 확인</ModalTitle>
          </ModalHeader>

          <div className="py-4">
            <p className="text-sm text-neutral-700 mb-4">
              다음 메뉴의 주문을 취소하시겠습니까?
            </p>
            {cancellingItemInfo && (
              <div className="p-3 bg-neutral-50 rounded-lg space-y-3">
                <div>
                  <p className="font-medium text-neutral-900">{cancellingItemInfo.name}</p>
                  <p className="text-sm text-neutral-500 mt-1">
                    단가: {formatNumber(cancellingItemInfo.unitPrice)}원
                  </p>
                </div>

                {/* 수량이 2개 이상일 때만 수량 선택 UI 표시 */}
                {cancellingItemInfo.remainingQty > 1 ? (
                  <div className="pt-3 border-t border-neutral-200">
                    <p className="text-sm font-medium text-neutral-700 mb-2">
                      취소할 수량 (남은 수량: {cancellingItemInfo.remainingQty}개)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: cancellingItemInfo.remainingQty }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setCancelQuantity(num)}
                          className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                            cancelQuantity === num
                              ? 'bg-red-500 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-neutral-600 mt-3">
                      취소 금액: <span className="font-medium">{formatNumber(cancellingItemInfo.unitPrice * cancelQuantity)}원</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    취소 금액: {formatNumber(cancellingItemInfo.price)}원
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-red-500 mt-3">
              ※ 해당 메뉴에 대한 적립 포인트가 자동으로 차감됩니다.
            </p>
          </div>

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setCancelConfirmModal(false);
                setCancellingItem(null);
                setCancellingItemInfo(null);
                setCancelQuantity(1);
              }}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrderItem}
              className="flex-1"
            >
              {cancellingItemInfo && cancellingItemInfo.remainingQty > 1
                ? `${cancelQuantity}개 취소`
                : '주문 취소'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
