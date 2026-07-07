'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatNumber } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  Customer,
  PointLedgerEntry,
  StampLedgerEntry,
  CustomerFeedbackEntry,
  VisitOrOrderEntry,
  Announcement,
  MessageHistoryEntry,
  BulkRow,
} from './types';
import { AddCustomerModal } from './AddCustomerModal';
import { BulkUploadModal } from './BulkUploadModal';
import { CustomerTable } from './CustomerTable';
import { CustomerFilters } from './CustomerFilters';
import { CustomerAnnouncements } from './CustomerAnnouncements';
import { CustomerListHeader } from './CustomerListHeader';
import { AutomationBanner } from './AutomationBanner';
import { EditCustomerModal } from './EditCustomerModal';
import { UsePointsModal } from './UsePointsModal';
import { UsePointsConfirmModal } from './UsePointsConfirmModal';
import { CancelOrderItemModal } from './CancelOrderItemModal';
import { EarnPointsModal } from './EarnPointsModal';
import { EarnStampsModal } from './EarnStampsModal';

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
  const [earnStampsModal, setEarnStampsModal] = useState(false);
  const [earnStampAmount, setEarnStampAmount] = useState('1');
  const [earnStampReason, setEarnStampReason] = useState('');
  const [stampMode, setStampMode] = useState<'earn' | 'deduct'>('earn');
  const [submittingEarnStamp, setSubmittingEarnStamp] = useState(false);
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
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkParsedData, setBulkParsedData] = useState<BulkRow[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: Array<{ row: number; phone: string; reason: string }> } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  // Edit modal tab and feedback states
  const [editModalTab, setEditModalTab] = useState<'feedback' | 'history' | 'stamps' | 'orders' | 'messages'>('orders');
  const [editFeedbackRating, setEditFeedbackRating] = useState(0);
  const [editFeedbackText, setEditFeedbackText] = useState('');
  const [pointHistory, setPointHistory] = useState<PointLedgerEntry[]>([]);
  const [stampHistory, setStampHistory] = useState<StampLedgerEntry[]>([]);
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

  // 자동 마케팅 상태
  const [automationStatus, setAutomationStatus] = useState<{
    hasActiveRules: boolean;
    previews: Record<string, { totalEligible: number; thisMonthEstimate: number }> | null;
  } | null>(null);

  // 스탬프 보상 티어 목록 (매장 설정 기반)
  const [stampRewardTiers, setStampRewardTiers] = useState<number[]>([5, 10, 15, 20, 25, 30]);
  // 스탬프 적립 활성화 매장 여부 (활성화 시 포인트 사용/적립 액션 숨김)
  const [stampEnabled, setStampEnabled] = useState(false);

  // 방문 경로 라벨 맵
  const [visitSourceLabelMap, setVisitSourceLabelMap] = useState<Record<string, string>>({});

  // 설문 질문 목록 (컬럼 헤더용)
  const [surveyQuestionLabels, setSurveyQuestionLabels] = useState<Array<{ id: string; label: string }>>([]);

  const apiUrl = useMemo(() => API_BASE, []);
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

  // Fetch automation marketing status
  useEffect(() => {
    const fetchAutomationStatus = async () => {
      try {
        const token = getAuthToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [rulesRes, previewRes] = await Promise.all([
          fetch(`${apiUrl}/api/automation/rules`, { headers }),
          fetch(`${apiUrl}/api/automation/preview-all`, { headers }),
        ]);

        let hasActiveRules = false;
        let previews = null;

        if (rulesRes.ok) {
          const data = await rulesRes.json();
          hasActiveRules = data.rules?.some((r: { enabled: boolean }) => r.enabled) ?? false;
        }
        if (previewRes.ok) {
          const data = await previewRes.json();
          previews = data.previews;
        }

        setAutomationStatus({ hasActiveRules, previews });
      } catch (error) {
        console.error('Failed to fetch automation status:', error);
      }
    };

    fetchAutomationStatus();
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
          setStampEnabled(!!data.enabled);
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

      trackEvent('owner_points_deduct', { amount: parseInt(useAmount, 10) });
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

      trackEvent('owner_points_earn', { amount: parseInt(earnAmount, 10), source: 'customers' });
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

  const handleEarnStamps = async () => {
    if (!selectedCustomer || !earnStampAmount) return;
    const isDeduct = stampMode === 'deduct';
    const amount = parseInt(earnStampAmount, 10);
    setSubmittingEarnStamp(true);
    try {
      const res = await fetch(`${apiUrl}/api/stamps/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          delta: isDeduct ? -amount : amount,
          reason: earnStampReason || (isDeduct ? '스탬프 수동 차감' : '스탬프 수동 적립'),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (isDeduct ? '스탬프 차감 중 오류가 발생했습니다.' : '스탬프 적립 중 오류가 발생했습니다.'));
      }

      trackEvent(isDeduct ? 'owner_stamps_deduct' : 'owner_stamps_earn', { count: amount });
      setEarnStampsModal(false);
      setEarnStampAmount('1');
      setEarnStampReason('');
      setSelectedCustomer(null);
      setPage(1);
      setRefreshKey((key) => key + 1);
      showToast(isDeduct ? '스탬프가 차감되었습니다.' : '스탬프가 적립되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || (isDeduct ? '스탬프 차감 중 오류가 발생했습니다.' : '스탬프 적립 중 오류가 발생했습니다.'), 'error');
    } finally {
      setSubmittingEarnStamp(false);
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
    setStampHistory([]);
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
        setStampHistory(Array.isArray(data.stampLedger) ? data.stampLedger : []);
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
      trackEvent('owner_customer_update');
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
      trackEvent('owner_customer_delete');
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
      trackEvent('owner_customer_add');
      showToast('고객이 등록되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '고객 등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // 샘플 엑셀 다운로드
  const handleDownloadSampleExcel = () => {
    const headers = ['전화번호', '이름', '성별', '생년(YYYY)', '생일(MM-DD)', '메모', '포인트 적립', '스탬프 적립'];
    const sampleData = [
      ['01012345678', '홍길동', '남', 1990, '03-15', 'VIP고객', 500, 3],
      ['01098765432', '김영희', '여', 1985, '11-20', '', 0, 0],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
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
          else if (h.includes('포인트') || h.includes('point') || h.includes('Point')) colMap.initialPoints = idx;
          else if (h.includes('스탬프') || h.includes('stamp') || h.includes('Stamp')) colMap.initialStamps = idx;
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
            initialPoints: colMap.initialPoints !== undefined ? (parseInt(String(row[colMap.initialPoints] || 0), 10) || 0) : undefined,
            initialStamps: colMap.initialStamps !== undefined ? (parseInt(String(row[colMap.initialStamps] || 0), 10) || 0) : undefined,
          });
        }

        if (parsed.length === 0) {
          showToast('등록할 데이터가 없습니다.', 'error');
          return;
        }
        if (parsed.length > 10000) {
          showToast(`최대 10,000건까지 등록 가능합니다. (현재 ${parsed.length}건)`, 'error');
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
      trackEvent('owner_customer_bulk_upload', { count: data.created ?? bulkParsedData.length });
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
      <CustomerAnnouncements announcements={announcements} />

      {/* Header */}
      <CustomerListHeader
        total={pagination.total}
        selectedCount={selectedCustomers.length}
        onSendToSelected={() => {
          const selectedData = customers
            .filter(c => selectedCustomers.includes(c.id))
            .map(c => ({ id: c.id, name: c.name, phone: c.phone }));
          const params = encodeURIComponent(JSON.stringify(selectedData));
          router.push(`/messages?customers=${params}`);
        }}
        onAddCustomer={() => setAddModal(true)}
        onBulkUpload={() => {
          setBulkModal(true);
          setBulkParsedData([]);
          setBulkResult(null);
        }}
      />

      {/* 자동 마케팅 배너 */}
      <AutomationBanner
        automationStatus={automationStatus}
        onNavigate={() => router.push('/automation')}
      />

      {/* Search and Filters */}
      <CustomerFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onResetFilters={resetFilters}
        genderFilter={genderFilter}
        genderOptions={genderOptions}
        genderDropdownOpen={genderDropdownOpen}
        onGenderToggle={() => {
          setGenderDropdownOpen(!genderDropdownOpen);
          setVisitDropdownOpen(false);
          setLastVisitDropdownOpen(false);
        }}
        onGenderSelect={(value) => handleGenderSelect(value as 'all' | 'MALE' | 'FEMALE')}
        visitFilter={visitFilter}
        visitOptions={visitOptions}
        visitDropdownOpen={visitDropdownOpen}
        onVisitToggle={() => {
          setVisitDropdownOpen(!visitDropdownOpen);
          setGenderDropdownOpen(false);
          setLastVisitDropdownOpen(false);
        }}
        onVisitSelect={(value) => handleVisitSelect(value as 'all' | '1' | '2' | '5' | '10' | '20')}
        lastVisitFilter={lastVisitFilter}
        lastVisitOptions={lastVisitOptions}
        lastVisitDropdownOpen={lastVisitDropdownOpen}
        onLastVisitToggle={() => {
          setLastVisitDropdownOpen(!lastVisitDropdownOpen);
          setGenderDropdownOpen(false);
          setVisitDropdownOpen(false);
        }}
        onLastVisitSelect={(value) => handleLastVisitSelect(value as 'all' | '7' | '30' | '90')}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        dateFilterType={dateFilterType}
        onDateFilterTypeChange={setDateFilterType}
        dateRangeDropdownOpen={dateRangeDropdownOpen}
        onDateRangeToggle={() => {
          setDateRangeDropdownOpen(!dateRangeDropdownOpen);
          setGenderDropdownOpen(false);
          setVisitDropdownOpen(false);
          setLastVisitDropdownOpen(false);
        }}
        dateRangeDropdownRef={dateRangeDropdownRef}
        onDateRangeReset={() => {
          setStartDate('');
          setEndDate('');
          setDateFilterType('lastVisit');
          setPage(1);
        }}
        onDateRangeApply={() => {
          setDateRangeDropdownOpen(false);
          setPage(1);
        }}
        columnSettingsOpen={columnSettingsOpen}
        onColumnSettingsToggle={() => {
          setColumnSettingsOpen(!columnSettingsOpen);
          setGenderDropdownOpen(false);
          setVisitDropdownOpen(false);
          setLastVisitDropdownOpen(false);
          setDateRangeDropdownOpen(false);
        }}
        columnSettingsRef={columnSettingsRef}
        columnDefinitions={COLUMN_DEFINITIONS}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumnsToDefault}
      />

      {/* Customer Table */}
      <CustomerTable
        customers={customers}
        isLoading={isLoading}
        error={error}
        selectedCustomers={selectedCustomers}
        onSelectedChange={setSelectedCustomers}
        isColumnVisible={isColumnVisible}
        visibleColumnCount={visibleColumnCount}
        surveyQuestionLabels={surveyQuestionLabels}
        visitSourceLabelMap={visitSourceLabelMap}
        getVisitDescription={getVisitDescription}
        onRowClick={openEditModal}
        stampEnabled={stampEnabled}
        onUsePoints={openUsePointsModal}
        onEarnPoints={(customer) => {
          setSelectedCustomer(customer);
          setEarnPointsModal(true);
        }}
        onEarnStamps={(customer) => {
          setSelectedCustomer(customer);
          setStampMode('earn');
          setEarnStampAmount('1');
          setEarnStampReason('');
          setEarnStampsModal(true);
        }}
        onDeductStamps={(customer) => {
          setSelectedCustomer(customer);
          setStampMode('deduct');
          setEarnStampAmount('1');
          setEarnStampReason('');
          setEarnStampsModal(true);
        }}
        page={page}
        pageSize={pageSize}
        pagination={pagination}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onPageChange={setPage}
      />

      {/* Use Points Modal */}
      <UsePointsModal
        open={usePointsModal}
        onOpenChange={setUsePointsModal}
        customer={selectedCustomer}
        useAmount={useAmount}
        onAmountChange={setUseAmount}
        useReason={useReason}
        onReasonChange={setUseReason}
        submitting={submittingUse}
        onProceed={() => {
          setUsePointsModal(false);
          setUseConfirmModal(true);
        }}
      />

      {/* Use Points Confirm Modal */}
      <UsePointsConfirmModal
        open={useConfirmModal}
        customer={selectedCustomer}
        useAmount={useAmount}
        submitting={submittingUse}
        onBack={() => {
          setUseConfirmModal(false);
          setUsePointsModal(true);
        }}
        onConfirm={() => {
          setUseConfirmModal(false);
          handleUsePoints();
        }}
      />

      {/* Earn Points Modal */}
      <EarnPointsModal
        open={earnPointsModal}
        onOpenChange={setEarnPointsModal}
        customer={selectedCustomer}
        earnAmount={earnAmount}
        onAmountChange={setEarnAmount}
        earnReason={earnReason}
        onReasonChange={setEarnReason}
        submitting={submittingEarn}
        onSubmit={handleEarnPoints}
      />

      {/* Earn/Deduct Stamps Modal */}
      <EarnStampsModal
        open={earnStampsModal}
        onOpenChange={setEarnStampsModal}
        customer={selectedCustomer}
        mode={stampMode}
        stampAmount={earnStampAmount}
        onAmountChange={setEarnStampAmount}
        stampReason={earnStampReason}
        onReasonChange={setEarnStampReason}
        submitting={submittingEarnStamp}
        onSubmit={handleEarnStamps}
      />

      {/* Edit Customer Modal */}
      <EditCustomerModal
        open={editModal}
        onOpenChange={setEditModal}
        customer={editingCustomer}
        name={editName}
        gender={editGender}
        onGenderChange={setEditGender}
        birthday={editBirthday}
        birthYear={editBirthYear}
        memo={editMemo}
        onMemoChange={setEditMemo}
        tab={editModalTab}
        onTabChange={(t) => {
          setEditModalTab(t);
          if (t === 'messages' && editingCustomer && messageHistory.length === 0) {
            fetchCustomerMessages(editingCustomer.id);
          }
        }}
        submitting={submittingEdit}
        stampRewardTiers={stampRewardTiers}
        onUseStampReward={async (amount) => {
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
        orderHistory={orderHistory}
        feedbackHistory={feedbackHistory}
        pointHistory={pointHistory}
        stampHistory={stampHistory}
        messageHistory={messageHistory}
        messageSummary={messageSummary}
        loadingHistory={loadingHistory}
        loadingMessages={loadingMessages}
        showDateFilter={showDateFilter}
        onToggleDateFilter={() => setShowDateFilter(!showDateFilter)}
        cancelMode={cancelMode}
        onToggleCancelMode={() => setCancelMode(!cancelMode)}
        orderStartDate={orderStartDate}
        onStartDateChange={setOrderStartDate}
        orderEndDate={orderEndDate}
        onEndDateChange={setOrderEndDate}
        onApplyFilter={() => {
          if (editingCustomer) {
            fetchFilteredOrders(editingCustomer.id, orderStartDate, orderEndDate);
          }
        }}
        onResetFilter={() => {
          setOrderStartDate('');
          setOrderEndDate('');
          if (editingCustomer) {
            fetchFilteredOrders(editingCustomer.id, '', '');
          }
        }}
        onCancelItem={openCancelConfirm}
        onDelete={handleDeleteCustomer}
        onSave={handleEditCustomer}
        onClose={() => {
          setEditModal(false);
          setShowDateFilter(false);
          setCancelMode(false);
        }}
      />

      {/* Add Customer Modal */}
      <AddCustomerModal
        open={addModal}
        onOpenChange={setAddModal}
        phone={addPhone}
        onPhoneChange={setAddPhone}
        name={addName}
        onNameChange={setAddName}
        gender={addGender}
        onGenderChange={setAddGender}
        birthday={addBirthday}
        onBirthdayChange={setAddBirthday}
        birthYear={addBirthYear}
        onBirthYearChange={setAddBirthYear}
        initialPoints={addInitialPoints}
        onInitialPointsChange={setAddInitialPoints}
        memo={addMemo}
        onMemoChange={setAddMemo}
        submitting={submittingAdd}
        onSubmit={handleAddCustomer}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        open={bulkModal}
        onOpenChange={setBulkModal}
        fileInputRef={bulkFileInputRef}
        parsedData={bulkParsedData}
        result={bulkResult}
        uploading={bulkUploading}
        onDownloadSample={handleDownloadSampleExcel}
        onFileChange={handleBulkFileChange}
        onUpload={handleBulkUpload}
      />

      {/* Cancel Order Item Confirm Modal */}
      <CancelOrderItemModal
        open={cancelConfirmModal}
        itemInfo={cancellingItemInfo}
        cancelQuantity={cancelQuantity}
        onQuantityChange={setCancelQuantity}
        onClose={() => {
          setCancelConfirmModal(false);
          setCancellingItem(null);
          setCancellingItemInfo(null);
          setCancelQuantity(1);
        }}
        onConfirm={handleCancelOrderItem}
      />
    </div>
  );
}
