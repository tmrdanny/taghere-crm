'use client';

import { API_BASE } from '@/lib/api-config';
import { getFranchiseToken } from '@/lib/auth-token';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  Check,
  Calendar,
  Star,
  Building2,
  Settings2,
  Stamp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRegion } from '@/features/customers/types';


// Column definitions for customization
const COLUMN_DEFINITIONS = [
  { id: 'name', label: '이름', required: true, defaultVisible: true },
  { id: 'phone', label: '연락처', required: false, defaultVisible: true },
  { id: 'store', label: '소속 매장', required: false, defaultVisible: true },
  { id: 'stamps', label: '스탬프', required: false, defaultVisible: true },
  { id: 'points', label: '포인트', required: false, defaultVisible: true },
  { id: 'gender', label: '성별', required: false, defaultVisible: false },
  { id: 'birthday', label: '생일(월)', required: false, defaultVisible: true },
  { id: 'ageGroup', label: '연령대', required: false, defaultVisible: true },
  { id: 'visitSource', label: '방문 경로', required: false, defaultVisible: true },
  { id: 'tableLabel', label: '좌석', required: false, defaultVisible: true },
  { id: 'visitCount', label: '방문횟수', required: false, defaultVisible: true },
  { id: 'lastVisit', label: '최근방문', required: false, defaultVisible: true },
  { id: 'region', label: '지역', required: false, defaultVisible: false },
  { id: 'consentMarketing', label: '마케팅 수신 동의', required: false, defaultVisible: false },
] as const;

type ColumnId = (typeof COLUMN_DEFINITIONS)[number]['id'];

const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = COLUMN_DEFINITIONS.filter(
  (c) => c.defaultVisible
).map((c) => c.id);

const COLUMN_STORAGE_KEY = 'taghere-franchise-customer-list-columns';

// API response types
interface Customer {
  id: string;
  name: string; // already masked
  phone: string; // already masked
  gender: string | null;
  ageGroup: string | null;
  birthYear: number | null;
  birthday: string | null;
  visitCount: number;
  totalPoints: number;
  totalStamps: number;
  lastVisitAt: string | null;
  createdAt: string;
  store: {
    id: string;
    name: string;
  };
  visitSource: string | null;
  lastTableLabel: string | null;
  regionSido?: string | null;
  regionSigungu?: string | null;
  consentMarketing?: boolean;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface VisitOrOrderEntry {
  id: string;
  visitedAt: string;
  totalAmount: number | null;
  orderItems: OrderItem[];
}

interface CustomerFeedbackEntry {
  id: string;
  rating: number;
  feedbackText: string | null;
  createdAt: string;
}

interface PointLedgerEntry {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  createdAt: string;
}

interface CustomerDetail extends Customer {
  visitsOrOrders: VisitOrOrderEntry[];
  feedbacks: CustomerFeedbackEntry[];
  pointLedger: PointLedgerEntry[];
  totalOrderAmount: number;
}

interface Store {
  id: string;
  name: string;
}

interface FranchiseCustomerItem {
  id: string;
  kakaoId: string;
  name: string | null;
  phone: string | null;
  totalStamps: number;
  totalPoints: number;
  visitCount: number;
  lastVisitAt: string | null;
  lastStore: { id: string; name: string } | null;
  createdAt: string;
}

interface FranchiseStampLedgerEntry {
  id: string;
  type: string;
  delta: number;
  balance: number;
  drawnReward: string | null;
  drawnRewardTier: number | null;
  reason: string | null;
  createdAt: string;
  store: { id: string; name: string };
}

interface FranchisePointLedgerEntry {
  id: string;
  delta: number;
  balance: number;
  type: string;
  reason: string | null;
  createdAt: string;
  store: { id: string; name: string };
}

interface FranchiseCustomerDetail {
  id: string;
  kakaoId: string;
  name: string | null;
  phone: string | null;
  totalStamps: number;
  totalPoints: number;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
  stampLedger: FranchiseStampLedgerEntry[];
  pointLedger: FranchisePointLedgerEntry[];
}

export default function FranchiseCustomersPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'store' | 'franchise'>('store');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Franchise customer states
  const [franchiseCustomers, setFranchiseCustomers] = useState<FranchiseCustomerItem[]>([]);
  const [isFranchiseLoading, setIsFranchiseLoading] = useState(false);
  const [franchiseSearchQuery, setFranchiseSearchQuery] = useState('');
  const [franchiseSearchInput, setFranchiseSearchInput] = useState('');
  const [franchiseCurrentPage, setFranchiseCurrentPage] = useState(1);
  const [franchiseTotalPages, setFranchiseTotalPages] = useState(1);
  const [franchiseTotalCustomers, setFranchiseTotalCustomers] = useState(0);
  const [selectedFranchiseCustomer, setSelectedFranchiseCustomer] = useState<FranchiseCustomerDetail | null>(null);
  const [isFranchiseDetailLoading, setIsFranchiseDetailLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const ITEMS_PER_PAGE = 50;

  // Filter states
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'MALE' | 'FEMALE'>('all');
  const [visitFilter, setVisitFilter] = useState<'all' | '1' | '2' | '5' | '10' | '20'>('all');
  const [lastVisitFilter, setLastVisitFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateFilterType, setDateFilterType] = useState<'created' | 'lastVisit'>('lastVisit');

  // Dropdown states
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [visitDropdownOpen, setVisitDropdownOpen] = useState(false);
  const [lastVisitDropdownOpen, setLastVisitDropdownOpen] = useState(false);
  const [dateRangeDropdownOpen, setDateRangeDropdownOpen] = useState(false);

  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const genderDropdownRef = useRef<HTMLDivElement>(null);
  const visitDropdownRef = useRef<HTMLDivElement>(null);
  const lastVisitDropdownRef = useRef<HTMLDivElement>(null);

  // Column customization states
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE_COLUMNS);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const columnSettingsRef = useRef<HTMLDivElement>(null);
  const [visitSourceLabelMap, setVisitSourceLabelMap] = useState<Record<string, string>>({});

  // Filter options
  const genderOptions = [
    { value: 'all', label: '전체' },
    { value: 'MALE', label: '남성' },
    { value: 'FEMALE', label: '여성' },
  ];

  const visitOptions = [
    { value: 'all', label: '전체' },
    { value: '1', label: '1회' },
    { value: '2', label: '2회 이상' },
    { value: '5', label: '5회 이상' },
    { value: '10', label: '10회 이상' },
    { value: '20', label: '20회 이상' },
  ];

  const lastVisitOptions = [
    { value: 'all', label: '전체' },
    { value: '7', label: '7일 이내' },
    { value: '30', label: '30일 이내' },
    { value: '90', label: '90일 이내' },
  ];

  // Auth token helper
  // Fetch stores for filter
  const fetchStores = useCallback(async () => {
    try {
      const token = getFranchiseToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/api/franchise/stores`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Load visible columns from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleColumns(parsed as ColumnId[]);
        }
      } catch (e) {
        // Use default if parsing fails
      }
    }
  }, []);

  // Fetch visit source settings for label mapping
  useEffect(() => {
    const fetchVisitSourceSettings = async () => {
      try {
        const token = getFranchiseToken();
        if (!token) return;

        const res = await fetch(`${API_BASE}/api/franchise/visit-source-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const options = data.options as Array<{ id: string; label: string }>;
          const labelMap: Record<string, string> = {};
          options.forEach((opt) => {
            labelMap[opt.id] = opt.label;
          });
          setVisitSourceLabelMap(labelMap);
        }
      } catch (error) {
        console.error('Failed to fetch visit source settings:', error);
      }
    };

    fetchVisitSourceSettings();
  }, []);

  // Close column settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setColumnSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Column toggle functions
  const isColumnVisible = (columnId: ColumnId) => visibleColumns.includes(columnId);

  const toggleColumn = (columnId: ColumnId) => {
    const column = COLUMN_DEFINITIONS.find((c) => c.id === columnId);
    if (column?.required) return;

    const newColumns = visibleColumns.includes(columnId)
      ? visibleColumns.filter((id) => id !== columnId)
      : [...visibleColumns, columnId];

    setVisibleColumns(newColumns as ColumnId[]);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newColumns));
  };

  const resetColumnsToDefault = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(DEFAULT_VISIBLE_COLUMNS));
  };

  // Fetch customers from API
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getFranchiseToken();
      if (!token) {
        console.error('No auth token found');
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (storeFilter !== 'all') params.append('storeId', storeFilter);
      if (genderFilter !== 'all') params.append('gender', genderFilter);
      if (visitFilter !== 'all') params.append('visitCount', visitFilter);
      if (lastVisitFilter !== 'all') params.append('lastVisit', lastVisitFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (startDate || endDate) params.append('dateType', dateFilterType);

      const response = await fetch(`${API_BASE}/api/franchise/customers?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }

      const data = await response.json();
      setCustomers(data.customers || []);
      setTotalPages(data.totalPages || 1);
      setTotalCustomers(data.total || 0);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
      setTotalPages(1);
      setTotalCustomers(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, storeFilter, genderFilter, visitFilter, lastVisitFilter, startDate, endDate, dateFilterType]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Fetch customer detail
  const fetchCustomerDetail = async (customerId: string) => {
    setIsDetailLoading(true);
    try {
      const token = getFranchiseToken();
      if (!token) {
        console.error('No auth token found');
        return;
      }

      const response = await fetch(`${API_BASE}/api/franchise/customers/${customerId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer detail');
      }

      const data = await response.json();
      setSelectedCustomer(data.customer);
    } catch (error) {
      console.error('Error fetching customer detail:', error);
      setSelectedCustomer(null);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Fetch franchise customers
  const fetchFranchiseCustomers = useCallback(async () => {
    setIsFranchiseLoading(true);
    try {
      const token = getFranchiseToken();
      if (!token) {
        setIsFranchiseLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('page', franchiseCurrentPage.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());
      if (franchiseSearchQuery) params.append('search', franchiseSearchQuery);

      const response = await fetch(`${API_BASE}/api/franchise/franchise-customers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch franchise customers');

      const data = await response.json();
      setFranchiseCustomers(data.customers || []);
      setFranchiseTotalPages(data.totalPages || 1);
      setFranchiseTotalCustomers(data.total || 0);
    } catch (error) {
      console.error('Error fetching franchise customers:', error);
      setFranchiseCustomers([]);
      setFranchiseTotalPages(1);
      setFranchiseTotalCustomers(0);
    } finally {
      setIsFranchiseLoading(false);
    }
  }, [franchiseCurrentPage, franchiseSearchQuery]);

  useEffect(() => {
    if (activeTab === 'franchise') {
      fetchFranchiseCustomers();
    }
  }, [activeTab, fetchFranchiseCustomers]);

  // Fetch franchise customer detail
  const fetchFranchiseCustomerDetail = async (kakaoId: string) => {
    setIsFranchiseDetailLoading(true);
    try {
      const token = getFranchiseToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/api/franchise/franchise-customers/${kakaoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch franchise customer detail');

      const data = await response.json();
      setSelectedFranchiseCustomer(data.customer);
    } catch (error) {
      console.error('Error fetching franchise customer detail:', error);
      setSelectedFranchiseCustomer(null);
    } finally {
      setIsFranchiseDetailLoading(false);
    }
  };

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicking on date input
      if (target.tagName === 'INPUT' && target.getAttribute('type') === 'date') {
        return;
      }

      // Check if click is inside any filter dropdown
      // (mousedown 단계에서 닫으면 옵션 버튼이 click 발생 전에 언마운트되어 선택이 무시됨)
      const dropdownRefs = [
        dateRangeDropdownRef,
        storeDropdownRef,
        genderDropdownRef,
        visitDropdownRef,
        lastVisitDropdownRef,
      ];
      if (dropdownRefs.some((ref) => ref.current && ref.current.contains(target))) {
        return;
      }

      setStoreDropdownOpen(false);
      setGenderDropdownOpen(false);
      setVisitDropdownOpen(false);
      setLastVisitDropdownOpen(false);
      setDateRangeDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper to display age group label
  const getAgeGroupLabel = (ageGroup: string) => {
    const labels: Record<string, string> = {
      TEENS: '10대',
      TWENTIES: '20대',
      THIRTIES: '30대',
      FORTIES: '40대',
      FIFTIES: '50대',
      SIXTY_PLUS: '60대 이상',
    };
    return labels[ageGroup] || ageGroup;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const datePart = date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timePart = date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart} ${timePart}`;
  };

  // Handle search
  const handleSearch = () => {
    setCurrentPage(1); // Reset to first page on search
    setSearchQuery(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Franchise search handlers
  const handleFranchiseSearch = () => {
    setFranchiseCurrentPage(1);
    setFranchiseSearchQuery(franchiseSearchInput);
  };

  const handleFranchiseKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFranchiseSearch();
    }
  };

  // Filter handlers
  const handleStoreSelect = (value: string) => {
    setCurrentPage(1); // Reset to first page on filter change
    setStoreFilter(value);
    setStoreDropdownOpen(false);
  };

  const handleGenderSelect = (value: 'all' | 'MALE' | 'FEMALE') => {
    setCurrentPage(1);
    setGenderFilter(value);
    setGenderDropdownOpen(false);
  };

  const handleVisitSelect = (value: 'all' | '1' | '2' | '5' | '10' | '20') => {
    setCurrentPage(1);
    setVisitFilter(value);
    setVisitDropdownOpen(false);
  };

  const handleLastVisitSelect = (value: 'all' | '7' | '30' | '90') => {
    setCurrentPage(1);
    setLastVisitFilter(value);
    setLastVisitDropdownOpen(false);
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[color:var(--ad-line)] px-4 py-3.5">
          <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-24"></div>
          <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-32"></div>
          <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-20"></div>
          <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-16"></div>
          <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-24"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
        <Users className="h-5 w-5 text-[color:var(--ad-faint)]" />
      </div>
      <h3 className="mb-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">고객이 없습니다</h3>
      <p className="text-[13px] text-[color:var(--ad-faint)]">검색 조건을 변경해보세요</p>
    </div>
  );

  return (
    <div>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 통합 DB</h1>
            <p className="ad-tnum mt-1 text-[13px] text-[color:var(--ad-muted)]">
              {activeTab === 'store'
                ? `전체 ${totalCustomers.toLocaleString()}명의 고객${totalPages > 1 ? ` (${currentPage}/${totalPages} 페이지)` : ''}`
                : `통합 고객 ${franchiseTotalCustomers.toLocaleString()}명${franchiseTotalPages > 1 ? ` (${franchiseCurrentPage}/${franchiseTotalPages} 페이지)` : ''}`
              }
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="mb-4 flex w-fit items-center gap-0.5 rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
          <button
            onClick={() => setActiveTab('store')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium transition-colors',
              activeTab === 'store'
                ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
            )}
          >
            <Users className="h-3.5 w-3.5" strokeWidth={1.8} />
            매장 고객
          </button>
          <button
            onClick={() => setActiveTab('franchise')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-medium transition-colors',
              activeTab === 'franchise'
                ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
            )}
          >
            <Stamp className="h-3.5 w-3.5" strokeWidth={1.8} />
            통합 고객
          </button>
        </div>

        {/* Search and Filters - Store Tab */}
        {activeTab === 'store' && (
        <>
        {/* Search and Filters */}
        <div className="ad-card mb-4 p-4">
          {/* Search bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ad-faint)]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="이름, 연락처, 매장명으로 검색"
                className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white pl-10 pr-4 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
            >
              검색
            </button>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Store Filter */}
            <div className="relative" ref={storeDropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStoreDropdownOpen(!storeDropdownOpen);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className={cn(
                  'ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                  storeFilter === 'all'
                    ? 'font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                    : 'font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)]'
                )}
              >
                <Building2 className="w-3.5 h-3.5" />
                {storeFilter === 'all' ? '전체 가맹점' : stores.find(s => s.id === storeFilter)?.name || '가맹점'}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {storeDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-1 min-w-[180px] max-h-[300px] overflow-y-auto z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                    onClick={() => handleStoreSelect('all')}
                  >
                    전체 가맹점
                    {storeFilter === 'all' && (
                      <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
                    )}
                  </button>
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                      onClick={() => handleStoreSelect(store.id)}
                    >
                      {store.name}
                      {storeFilter === store.id && (
                        <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gender Filter */}
            <div className="relative" ref={genderDropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGenderDropdownOpen(!genderDropdownOpen);
                  setStoreDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className={cn(
                  'ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                  genderFilter === 'all'
                    ? 'font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                    : 'font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)]'
                )}
              >
                성별 {genderOptions.find(o => o.value === genderFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {genderDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-1 min-w-[120px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {genderOptions.map((option) => (
                    <button
                      key={option.value}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                      onClick={() => handleGenderSelect(option.value as 'all' | 'MALE' | 'FEMALE')}
                    >
                      {option.label}
                      {genderFilter === option.value && (
                        <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Visit Count Filter */}
            <div className="relative" ref={visitDropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setVisitDropdownOpen(!visitDropdownOpen);
                  setStoreDropdownOpen(false);
                  setGenderDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className={cn(
                  'ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                  visitFilter === 'all'
                    ? 'font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                    : 'font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)]'
                )}
              >
                방문 횟수 {visitOptions.find(o => o.value === visitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {visitDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-1 min-w-[140px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {visitOptions.map((option) => (
                    <button
                      key={option.value}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                      onClick={() => handleVisitSelect(option.value as 'all' | '1' | '2' | '5' | '10' | '20')}
                    >
                      {option.label}
                      {visitFilter === option.value && (
                        <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Last Visit Filter */}
            <div className="relative" ref={lastVisitDropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLastVisitDropdownOpen(!lastVisitDropdownOpen);
                  setStoreDropdownOpen(false);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className={cn(
                  'ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                  lastVisitFilter === 'all'
                    ? 'font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                    : 'font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)]'
                )}
              >
                마지막 방문 {lastVisitOptions.find(o => o.value === lastVisitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {lastVisitDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-1 min-w-[140px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {lastVisitOptions.map((option) => (
                    <button
                      key={option.value}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                      onClick={() => handleLastVisitSelect(option.value as 'all' | '7' | '30' | '90')}
                    >
                      {option.label}
                      {lastVisitFilter === option.value && (
                        <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range Filter */}
            <div className="relative" ref={dateRangeDropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDateRangeDropdownOpen(!dateRangeDropdownOpen);
                  setStoreDropdownOpen(false);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                }}
                className={cn(
                  'ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)]',
                  (startDate || endDate)
                    ? 'font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)]'
                    : 'font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                {(startDate || endDate) ? (
                  <span className="ad-tnum text-[12.5px]">
                    {startDate && endDate ? `${startDate.slice(5)} ~ ${endDate.slice(5)}` : startDate ? `${startDate.slice(5)} ~` : `~ ${endDate.slice(5)}`}
                  </span>
                ) : (
                  '기간'
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {dateRangeDropdownOpen && (
                <div
                  className="absolute top-full right-0 z-50 mt-1 min-w-[240px] rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] p-3"
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
                        className="accent-[#131651]"
                      />
                      <span className="text-[13px] text-[color:var(--ad-ink-2)]">마지막 방문일</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="radio"
                        name="dateType"
                        checked={dateFilterType === 'created'}
                        onChange={() => setDateFilterType('created')}
                        className="accent-[#131651]"
                      />
                      <span className="text-[13px] text-[color:var(--ad-ink-2)]">가입일</span>
                    </label>
                  </div>

                  {/* Date inputs */}
                  <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[12px] text-[color:var(--ad-muted)]">시작일</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setCurrentPage(1); setStartDate(e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="h-9 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px] focus:border-[color:var(--ad-navy)] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[12px] text-[color:var(--ad-muted)]">종료일</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setCurrentPage(1); setEndDate(e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="h-9 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px] focus:border-[color:var(--ad-navy)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPage(1);
                        setStartDate('');
                        setEndDate('');
                        setDateFilterType('lastVisit');
                      }}
                      className="ad-press h-9 flex-1 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                    >
                      초기화
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRangeDropdownOpen(false);
                      }}
                      className="ad-press h-9 flex-1 rounded-[10px] bg-[color:var(--ad-ink)] text-[13px] font-semibold text-white hover:bg-[#383c40]"
                    >
                      적용
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Column Settings */}
            <div className="relative" ref={columnSettingsRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setColumnSettingsOpen(!columnSettingsOpen);
                  setStoreDropdownOpen(false);
                  setGenderDropdownOpen(false);
                  setVisitDropdownOpen(false);
                  setLastVisitDropdownOpen(false);
                  setDateRangeDropdownOpen(false);
                }}
                className="ad-press flex h-9 items-center gap-1 rounded-[10px] bg-white px-3 text-[13px] font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                <Settings2 className="w-3.5 h-3.5" />
                컬럼
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {columnSettingsOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-[12px] border border-[color:var(--ad-line)] bg-white shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-2">
                  {COLUMN_DEFINITIONS.map((column) => (
                    <label
                      key={column.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[color:var(--ad-bg-alt)]',
                        column.required && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.id)}
                        disabled={column.required}
                        onChange={() => toggleColumn(column.id)}
                        className="rounded border-[color:var(--ad-line-strong)] accent-[#131651]"
                      />
                      <span className="text-[13px] text-[color:var(--ad-ink-2)]">{column.label}</span>
                      {column.required && (
                        <span className="text-[11px] text-[color:var(--ad-faint)]">(필수)</span>
                      )}
                    </label>
                  ))}
                  <div className="mt-2 border-t border-[color:var(--ad-line)] px-3 pt-2">
                    <button
                      onClick={resetColumnsToDefault}
                      className="text-[12px] font-medium text-[color:var(--ad-link)] hover:underline"
                    >
                      기본값으로 초기화
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="ad-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                  {isColumnVisible('name') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      이름
                    </th>
                  )}
                  {isColumnVisible('phone') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      연락처
                    </th>
                  )}
                  {isColumnVisible('store') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      소속 매장
                    </th>
                  )}
                  {isColumnVisible('stamps') && (
                    <th className="px-4 py-2.5 text-right font-medium">
                      스탬프
                    </th>
                  )}
                  {isColumnVisible('points') && (
                    <th className="px-4 py-2.5 text-right font-medium">
                      포인트
                    </th>
                  )}
                  {isColumnVisible('gender') && (
                    <th className="px-4 py-2.5 text-center font-medium">
                      성별
                    </th>
                  )}
                  {isColumnVisible('birthday') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      생일(월)
                    </th>
                  )}
                  {isColumnVisible('ageGroup') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      연령대
                    </th>
                  )}
                  {isColumnVisible('visitSource') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      방문 경로
                    </th>
                  )}
                  {isColumnVisible('tableLabel') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      좌석
                    </th>
                  )}
                  {isColumnVisible('visitCount') && (
                    <th className="px-4 py-2.5 text-right font-medium">
                      방문횟수
                    </th>
                  )}
                  {isColumnVisible('lastVisit') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      최근방문
                    </th>
                  )}
                  {isColumnVisible('region') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      지역
                    </th>
                  )}
                  {isColumnVisible('consentMarketing') && (
                    <th className="px-4 py-2.5 text-left font-medium">
                      마케팅 수신 동의
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--ad-line)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={visibleColumns.length}>{renderSkeleton()}</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => fetchCustomerDetail(customer.id)}
                      className="cursor-pointer transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                    >
                      {isColumnVisible('name') && (
                        <td className="px-4 py-3">
                          <span className="font-medium text-[color:var(--ad-ink)]">{customer.name}</span>
                        </td>
                      )}
                      {isColumnVisible('phone') && (
                        <td className="px-4 py-3 ad-tnum text-[color:var(--ad-ink-2)]">{customer.phone}</td>
                      )}
                      {isColumnVisible('store') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">{customer.store.name}</td>
                      )}
                      {isColumnVisible('stamps') && (
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">
                          {customer.totalStamps}개
                        </td>
                      )}
                      {isColumnVisible('points') && (
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">
                          {customer.totalPoints.toLocaleString()}P
                        </td>
                      )}
                      {isColumnVisible('gender') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)] text-center">
                          {customer.gender === 'MALE' ? '남성' : customer.gender === 'FEMALE' ? '여성' : '-'}
                        </td>
                      )}
                      {isColumnVisible('birthday') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                          {customer.birthday
                            ? `${parseInt(customer.birthday.split('-')[0], 10)}월`
                            : '-'}
                        </td>
                      )}
                      {isColumnVisible('ageGroup') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                          {customer.ageGroup ? getAgeGroupLabel(customer.ageGroup) : '-'}
                        </td>
                      )}
                      {isColumnVisible('visitSource') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                          {customer.visitSource
                            ? visitSourceLabelMap[customer.visitSource] || customer.visitSource
                            : '-'}
                        </td>
                      )}
                      {isColumnVisible('tableLabel') && (
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                          {customer.lastTableLabel || '-'}
                        </td>
                      )}
                      {isColumnVisible('visitCount') && (
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">
                          {customer.visitCount}회
                        </td>
                      )}
                      {isColumnVisible('lastVisit') && (
                        <td className="px-4 py-3 ad-tnum text-[color:var(--ad-muted)]">
                          {customer.lastVisitAt ? formatDateTime(customer.lastVisitAt) : '-'}
                        </td>
                      )}
                      {isColumnVisible('region') && (
                        <td className="px-4 py-3 whitespace-nowrap text-[color:var(--ad-ink-2)]">
                          {formatRegion(customer.regionSido, customer.regionSigungu)}
                        </td>
                      )}
                      {isColumnVisible('consentMarketing') && (
                        <td className="px-4 py-3">
                          {customer.consentMarketing ? (
                            <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                              동의
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-neg)]">
                              미동의
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
              <p className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                {totalCustomers.toLocaleString()}명 중 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalCustomers)}명 표시
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-8 rounded-[8px] px-2.5 text-[12.5px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  처음
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          'ad-tnum h-8 w-8 rounded-[8px] text-[12.5px] transition-colors',
                          currentPage === pageNum
                            ? 'bg-[color:var(--ad-ink)] font-medium text-white'
                            : 'text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 rounded-[8px] px-2.5 text-[12.5px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  마지막
                </button>
              </div>
            </div>
          )}
        </div>
        </>
        )}

        {/* Franchise Tab Content */}
        {activeTab === 'franchise' && (
        <>
          {/* Search */}
          <div className="ad-card mb-4 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ad-faint)]" />
                <input
                  type="text"
                  value={franchiseSearchInput}
                  onChange={(e) => setFranchiseSearchInput(e.target.value)}
                  onKeyPress={handleFranchiseKeyPress}
                  placeholder="이름, 연락처로 검색"
                  className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white pl-10 pr-4 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>
              <button
                onClick={handleFranchiseSearch}
                className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
              >
                검색
              </button>
            </div>
          </div>

          {/* Franchise Customer Table */}
          <div className="ad-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                    <th className="px-4 py-2.5 text-left font-medium">이름</th>
                    <th className="px-4 py-2.5 text-left font-medium">연락처</th>
                    <th className="px-4 py-2.5 text-right font-medium">스탬프</th>
                    <th className="px-4 py-2.5 text-right font-medium">포인트</th>
                    <th className="px-4 py-2.5 text-right font-medium">방문횟수</th>
                    <th className="px-4 py-2.5 text-left font-medium">최근 적립 매장</th>
                    <th className="px-4 py-2.5 text-left font-medium">최근방문</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--ad-line)]">
                  {isFranchiseLoading ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="animate-pulse">
                          {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 border-b border-[color:var(--ad-line)] px-4 py-3.5">
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-24"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-32"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-16"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-16"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-12"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-24"></div>
                              <div className="h-3.5 rounded bg-[color:var(--ad-bg)] w-20"></div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : franchiseCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-col items-center justify-center py-16">
                          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
                            <Stamp className="h-5 w-5 text-[color:var(--ad-faint)]" />
                          </div>
                          <h3 className="mb-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">통합 고객이 없습니다</h3>
                          <p className="text-[13px] text-[color:var(--ad-faint)]">통합 스탬프를 활성화한 매장에서 적립이 발생하면 여기에 표시됩니다</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    franchiseCustomers.map((fc) => (
                      <tr
                        key={fc.id}
                        onClick={() => fetchFranchiseCustomerDetail(fc.kakaoId)}
                        className="cursor-pointer transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-[color:var(--ad-ink)]">{fc.name || '-'}</span>
                        </td>
                        <td className="px-4 py-3 ad-tnum text-[color:var(--ad-ink-2)]">{fc.phone || '-'}</td>
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">{fc.totalStamps}개</td>
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">{fc.totalPoints.toLocaleString()}P</td>
                        <td className="px-4 py-3 ad-tnum text-right font-medium text-[color:var(--ad-ink)]">{fc.visitCount}회</td>
                        <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">{fc.lastStore?.name || '-'}</td>
                        <td className="px-4 py-3 ad-tnum text-[color:var(--ad-muted)]">
                          {fc.lastVisitAt ? formatDateTime(fc.lastVisitAt) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Franchise Pagination */}
            {!isFranchiseLoading && franchiseTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
                <p className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                  {franchiseTotalCustomers.toLocaleString()}명 중 {((franchiseCurrentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(franchiseCurrentPage * ITEMS_PER_PAGE, franchiseTotalCustomers)}명 표시
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFranchiseCurrentPage(1)}
                    disabled={franchiseCurrentPage === 1}
                    className="h-8 rounded-[8px] px-2.5 text-[12.5px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    처음
                  </button>
                  <button
                    onClick={() => setFranchiseCurrentPage(franchiseCurrentPage - 1)}
                    disabled={franchiseCurrentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, franchiseTotalPages) }, (_, i) => {
                      let pageNum;
                      if (franchiseTotalPages <= 5) {
                        pageNum = i + 1;
                      } else if (franchiseCurrentPage <= 3) {
                        pageNum = i + 1;
                      } else if (franchiseCurrentPage >= franchiseTotalPages - 2) {
                        pageNum = franchiseTotalPages - 4 + i;
                      } else {
                        pageNum = franchiseCurrentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setFranchiseCurrentPage(pageNum)}
                          className={cn(
                            'ad-tnum h-8 w-8 rounded-[8px] text-[12.5px] transition-colors',
                            franchiseCurrentPage === pageNum
                              ? 'bg-[color:var(--ad-ink)] font-medium text-white'
                              : 'text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setFranchiseCurrentPage(franchiseCurrentPage + 1)}
                    disabled={franchiseCurrentPage === franchiseTotalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setFranchiseCurrentPage(franchiseTotalPages)}
                    disabled={franchiseCurrentPage === franchiseTotalPages}
                    className="h-8 rounded-[8px] px-2.5 text-[12.5px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    마지막
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm"
            onClick={() => setSelectedCustomer(null)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[85vh] z-50 flex flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[color:var(--ad-line)] px-6 py-4">
              <div>
                <h2 className="text-[17px] font-semibold text-[color:var(--ad-ink)]">고객 상세 정보</h2>
                <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">{selectedCustomer.store.name}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="rounded-[10px] p-2 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
              >
                <X className="h-5 w-5 text-[color:var(--ad-muted)]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--ad-ink)] border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* Customer Info */}
                  <div className="mb-6 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">이름</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedCustomer.name}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">연락처</p>
                        <p className="ad-tnum text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">성별</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                          {selectedCustomer.gender === 'MALE' ? '남성' : selectedCustomer.gender === 'FEMALE' ? '여성' : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">연령대</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                          {selectedCustomer.ageGroup ? getAgeGroupLabel(selectedCustomer.ageGroup) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">방문 횟수</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedCustomer.visitCount}회</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">누적 포인트</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{(selectedCustomer.totalPoints ?? 0).toLocaleString()}P</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">총 주문 금액</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                          {(selectedCustomer.totalOrderAmount ?? 0).toLocaleString()}원
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">최근 방문</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                          {selectedCustomer.lastVisitAt ? formatDateTime(selectedCustomer.lastVisitAt) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="space-y-4">
                    {/* Orders */}
                    <div className="overflow-hidden rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">주문 내역 ({selectedCustomer.visitsOrOrders.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.visitsOrOrders.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">주문 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.visitsOrOrders.map((order) => (
                              <div key={order.id} className="rounded-[10px] bg-[color:var(--ad-bg-alt)] p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[12px] text-[color:var(--ad-muted)]">{formatDate(order.visitedAt)}</p>
                                  <p className="ad-tnum text-[13.5px] font-semibold text-[color:var(--ad-ink)]">
                                    {order.totalAmount ? `${order.totalAmount.toLocaleString()}원` : '-'}
                                  </p>
                                </div>
                                {order.orderItems.length > 0 && (
                                  <div className="space-y-1">
                                    {order.orderItems.map((item, idx) => (
                                      <div key={item.id || `item-${idx}`} className="flex items-center justify-between text-[12px]">
                                        <span className="text-[color:var(--ad-ink-2)]">
                                          {item.name || '메뉴'} x{item.quantity || 1}
                                        </span>
                                        <span className="ad-tnum text-[color:var(--ad-muted)]">{(item.price ?? 0).toLocaleString()}원</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Feedback */}
                    <div className="overflow-hidden rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">피드백 ({selectedCustomer.feedbacks.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.feedbacks.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">피드백이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.feedbacks.map((feedback) => (
                              <div key={feedback.id} className="rounded-[10px] bg-[color:var(--ad-bg-alt)] p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <Star key={i} strokeWidth={1.7} className={cn('h-3.5 w-3.5 fill-none', i < feedback.rating ? 'text-[color:var(--ad-ink-2)]' : 'text-[#d1d3d6]')} />
                                    ))}
                                  </div>
                                  <p className="text-[12px] text-[color:var(--ad-muted)]">{formatDate(feedback.createdAt)}</p>
                                </div>
                                {feedback.feedbackText && (
                                  <p className="mt-2 text-[13px] text-[color:var(--ad-ink-2)]">{feedback.feedbackText}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Points History */}
                    <div className="overflow-hidden rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">포인트 내역 ({selectedCustomer.pointLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.pointLedger.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">포인트 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedCustomer.pointLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between border-b border-[color:var(--ad-line)] py-2 last:border-0">
                                <div>
                                  <p className="text-[13px] text-[color:var(--ad-ink)]">{entry.reason || entry.type}</p>
                                  <p className="text-[12px] text-[color:var(--ad-muted)]">{formatDate(entry.createdAt)}</p>
                                </div>
                                <p className={cn(
                                  'ad-tnum text-[13px] font-semibold',
                                  (entry.amount ?? 0) > 0 ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'
                                )}>
                                  {(entry.amount ?? 0) > 0 ? '+' : ''}{(entry.amount ?? 0).toLocaleString()}P
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[color:var(--ad-line)] px-6 py-4">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                닫기
              </button>
            </div>
          </div>
        </>
      )}

      {/* Franchise Customer Detail Modal */}
      {selectedFranchiseCustomer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm"
            onClick={() => setSelectedFranchiseCustomer(null)}
          />

          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[85vh] z-50 flex flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[color:var(--ad-line)] px-6 py-4">
              <div>
                <h2 className="text-[17px] font-semibold text-[color:var(--ad-ink)]">통합 고객 상세 정보</h2>
                <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">프랜차이즈 통합 스탬프/포인트</p>
              </div>
              <button
                onClick={() => setSelectedFranchiseCustomer(null)}
                className="rounded-[10px] p-2 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
              >
                <X className="h-5 w-5 text-[color:var(--ad-muted)]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isFranchiseDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[color:var(--ad-ink)] border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* Customer Info */}
                  <div className="mb-6 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">이름</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedFranchiseCustomer.name || '-'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">연락처</p>
                        <p className="ad-tnum text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedFranchiseCustomer.phone || '-'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">통합 스탬프</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedFranchiseCustomer.totalStamps}개</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">통합 포인트</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedFranchiseCustomer.totalPoints.toLocaleString()}P</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">방문 횟수</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{selectedFranchiseCustomer.visitCount}회</p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">최근 방문</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                          {selectedFranchiseCustomer.lastVisitAt ? formatDateTime(selectedFranchiseCustomer.lastVisitAt) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">가입일</p>
                        <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{formatDate(selectedFranchiseCustomer.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stamp Ledger */}
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">스탬프 내역 ({selectedFranchiseCustomer.stampLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedFranchiseCustomer.stampLedger.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">스탬프 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedFranchiseCustomer.stampLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between border-b border-[color:var(--ad-line)] py-2 last:border-0">
                                <div>
                                  <p className="text-[13px] text-[color:var(--ad-ink)]">
                                    {entry.type === 'EARN' ? '적립' : entry.type === 'USE' ? '사용' : entry.type}
                                    {entry.drawnReward && ` - ${entry.drawnReward}`}
                                  </p>
                                  <p className="text-[12px] text-[color:var(--ad-muted)]">
                                    {entry.store.name} · {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                                <p className={cn(
                                  'ad-tnum text-[13px] font-semibold',
                                  entry.delta > 0 ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'
                                )}>
                                  {entry.delta > 0 ? '+' : ''}{entry.delta}개
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Point Ledger */}
                    <div className="overflow-hidden rounded-[12px] border border-[color:var(--ad-line)]">
                      <div className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">포인트 내역 ({selectedFranchiseCustomer.pointLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedFranchiseCustomer.pointLedger.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">포인트 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedFranchiseCustomer.pointLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between border-b border-[color:var(--ad-line)] py-2 last:border-0">
                                <div>
                                  <p className="text-[13px] text-[color:var(--ad-ink)]">{entry.reason || entry.type}</p>
                                  <p className="text-[12px] text-[color:var(--ad-muted)]">
                                    {entry.store.name} · {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                                <p className={cn(
                                  'ad-tnum text-[13px] font-semibold',
                                  entry.delta > 0 ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'
                                )}>
                                  {entry.delta > 0 ? '+' : ''}{entry.delta.toLocaleString()}P
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[color:var(--ad-line)] px-6 py-4">
              <button
                onClick={() => setSelectedFranchiseCustomer(null)}
                className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
