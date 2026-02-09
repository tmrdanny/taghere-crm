'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  UserCircle,
  Check,
  Calendar,
  Star,
  Building2,
  Settings2,
  Stamp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Column definitions for customization
const COLUMN_DEFINITIONS = [
  { id: 'name', label: '이름', required: true, defaultVisible: true },
  { id: 'phone', label: '연락처', required: false, defaultVisible: true },
  { id: 'store', label: '소속 매장', required: false, defaultVisible: true },
  { id: 'points', label: '포인트', required: false, defaultVisible: true },
  { id: 'gender', label: '성별', required: false, defaultVisible: false },
  { id: 'ageGroup', label: '연령대', required: false, defaultVisible: false },
  { id: 'visitSource', label: '방문 경로', required: false, defaultVisible: true },
  { id: 'tableLabel', label: '좌석', required: false, defaultVisible: true },
  { id: 'visitCount', label: '방문횟수', required: false, defaultVisible: true },
  { id: 'lastVisit', label: '최근방문', required: false, defaultVisible: true },
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
  visitCount: number;
  totalPoints: number;
  lastVisitAt: string | null;
  createdAt: string;
  store: {
    id: string;
    name: string;
  };
  visitSource: string | null;
  lastTableLabel: string | null;
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
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch stores for filter
  const fetchStores = useCallback(async () => {
    try {
      const token = getAuthToken();
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
        const token = getAuthToken();
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
      const token = getAuthToken();
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
      const token = getAuthToken();
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
      const token = getAuthToken();
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
      const token = getAuthToken();
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

      // Check if click is inside date range dropdown
      if (dateRangeDropdownRef.current && dateRangeDropdownRef.current.contains(target)) {
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
    <div className="animate-pulse font-pretendard">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-neutral-100">
          <div className="h-4 bg-neutral-200 rounded w-24"></div>
          <div className="h-4 bg-neutral-200 rounded w-32"></div>
          <div className="h-4 bg-neutral-200 rounded w-20"></div>
          <div className="h-4 bg-neutral-200 rounded w-16"></div>
          <div className="h-4 bg-neutral-200 rounded w-24"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 font-pretendard">
      <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-neutral-400" />
      </div>
      <h3 className="text-lg font-medium text-neutral-900 mb-1">고객이 없습니다</h3>
      <p className="text-sm text-neutral-500">검색 조건을 변경해보세요</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 font-pretendard">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">고객 통합 DB</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {activeTab === 'store'
                ? `전체 ${totalCustomers.toLocaleString()}명의 고객${totalPages > 1 ? ` (${currentPage}/${totalPages} 페이지)` : ''}`
                : `통합 고객 ${franchiseTotalCustomers.toLocaleString()}명${franchiseTotalPages > 1 ? ` (${franchiseCurrentPage}/${franchiseTotalPages} 페이지)` : ''}`
              }
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 mb-4 bg-neutral-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('store')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'store'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            )}
          >
            <Users className="w-4 h-4" />
            매장 고객
          </button>
          <button
            onClick={() => setActiveTab('franchise')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'franchise'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            )}
          >
            <Stamp className="w-4 h-4" />
            통합 고객
          </button>
        </div>

        {/* Search and Filters - Store Tab */}
        {activeTab === 'store' && (
        <>
        {/* Search and Filters */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-sm mb-6 p-4">
          {/* Search bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="이름, 연락처, 매장명으로 검색"
                className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-brand-800 text-white rounded-lg text-sm font-medium hover:bg-brand-900 transition-colors"
            >
              검색
            </button>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Store Filter */}
            <div className="relative">
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
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  storeFilter === 'all'
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                    : 'bg-brand-50 border-brand-200 text-brand-800'
                )}
              >
                <Building2 className="w-3.5 h-3.5" />
                {storeFilter === 'all' ? '전체 가맹점' : stores.find(s => s.id === storeFilter)?.name || '가맹점'}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {storeDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-[300px] overflow-y-auto z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                    onClick={() => handleStoreSelect('all')}
                  >
                    전체 가맹점
                    {storeFilter === 'all' && (
                      <Check className="w-4 h-4 text-brand-800" />
                    )}
                  </button>
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                      onClick={() => handleStoreSelect(store.id)}
                    >
                      {store.name}
                      {storeFilter === store.id && (
                        <Check className="w-4 h-4 text-brand-800" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gender Filter */}
            <div className="relative">
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
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  genderFilter === 'all'
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                    : 'bg-brand-50 border-brand-200 text-brand-800'
                )}
              >
                성별 {genderOptions.find(o => o.value === genderFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
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

            {/* Visit Count Filter */}
            <div className="relative">
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
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  visitFilter === 'all'
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                    : 'bg-brand-50 border-brand-200 text-brand-800'
                )}
              >
                방문 횟수 {visitOptions.find(o => o.value === visitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
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

            {/* Last Visit Filter */}
            <div className="relative">
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
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  lastVisitFilter === 'all'
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                    : 'bg-brand-50 border-brand-200 text-brand-800'
                )}
              >
                마지막 방문 {lastVisitOptions.find(o => o.value === lastVisitFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
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
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  (startDate || endDate)
                    ? 'bg-brand-50 border-brand-200 text-brand-800'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                )}
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
              </button>
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
                        onChange={(e) => { setCurrentPage(1); setStartDate(e.target.value); }}
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
                        onChange={(e) => { setCurrentPage(1); setEndDate(e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
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
                      className="flex-1 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 rounded transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRangeDropdownOpen(false);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-brand-800 text-white rounded hover:bg-brand-900 transition-colors"
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
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                컬럼
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {columnSettingsOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-2 min-w-[180px] z-50">
                  {COLUMN_DEFINITIONS.map((column) => (
                    <label
                      key={column.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-50',
                        column.required && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.id)}
                        disabled={column.required}
                        onChange={() => toggleColumn(column.id)}
                        className="rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                      />
                      <span className="text-sm text-neutral-700">{column.label}</span>
                      {column.required && (
                        <span className="text-xs text-neutral-400">(필수)</span>
                      )}
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

        {/* Table */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  {isColumnVisible('name') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      이름
                    </th>
                  )}
                  {isColumnVisible('phone') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      연락처
                    </th>
                  )}
                  {isColumnVisible('store') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      소속 매장
                    </th>
                  )}
                  {isColumnVisible('points') && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      포인트
                    </th>
                  )}
                  {isColumnVisible('gender') && (
                    <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      성별
                    </th>
                  )}
                  {isColumnVisible('ageGroup') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      연령대
                    </th>
                  )}
                  {isColumnVisible('visitSource') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      방문 경로
                    </th>
                  )}
                  {isColumnVisible('tableLabel') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      좌석
                    </th>
                  )}
                  {isColumnVisible('visitCount') && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      방문횟수
                    </th>
                  )}
                  {isColumnVisible('lastVisit') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      최근방문
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
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
                      className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      {isColumnVisible('name') && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">
                              <UserCircle className="w-5 h-5 text-neutral-400" />
                            </div>
                            <span className="text-sm font-medium text-neutral-900">{customer.name}</span>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('phone') && (
                        <td className="px-6 py-4 text-sm text-neutral-600 font-pretendard">{customer.phone}</td>
                      )}
                      {isColumnVisible('store') && (
                        <td className="px-6 py-4 text-sm text-neutral-600">{customer.store.name}</td>
                      )}
                      {isColumnVisible('points') && (
                        <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">
                          {customer.totalPoints.toLocaleString()}P
                        </td>
                      )}
                      {isColumnVisible('gender') && (
                        <td className="px-6 py-4 text-sm text-neutral-600 text-center">
                          {customer.gender === 'MALE' ? '남성' : customer.gender === 'FEMALE' ? '여성' : '-'}
                        </td>
                      )}
                      {isColumnVisible('ageGroup') && (
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {customer.ageGroup ? getAgeGroupLabel(customer.ageGroup) : '-'}
                        </td>
                      )}
                      {isColumnVisible('visitSource') && (
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {customer.visitSource
                            ? visitSourceLabelMap[customer.visitSource] || customer.visitSource
                            : '-'}
                        </td>
                      )}
                      {isColumnVisible('tableLabel') && (
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {customer.lastTableLabel || '-'}
                        </td>
                      )}
                      {isColumnVisible('visitCount') && (
                        <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">
                          {customer.visitCount}회
                        </td>
                      )}
                      {isColumnVisible('lastVisit') && (
                        <td className="px-6 py-4 text-sm text-neutral-500">
                          {customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '-'}
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
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
              <p className="text-sm text-neutral-500">
                {totalCustomers.toLocaleString()}명 중 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalCustomers)}명 표시
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  처음
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
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
                          'w-8 h-8 text-sm rounded-lg transition-colors',
                          currentPage === pageNum
                            ? 'bg-brand-800 text-white'
                            : 'text-neutral-600 hover:bg-neutral-100'
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
                  className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm mb-6 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={franchiseSearchInput}
                  onChange={(e) => setFranchiseSearchInput(e.target.value)}
                  onKeyPress={handleFranchiseKeyPress}
                  placeholder="이름, 연락처로 검색"
                  className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleFranchiseSearch}
                className="px-4 py-2 bg-brand-800 text-white rounded-lg text-sm font-medium hover:bg-brand-900 transition-colors"
              >
                검색
              </button>
            </div>
          </div>

          {/* Franchise Customer Table */}
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">이름</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">연락처</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">스탬프</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">포인트</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">방문횟수</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">최근 적립 매장</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">최근방문</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {isFranchiseLoading ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="animate-pulse font-pretendard">
                          {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-neutral-100">
                              <div className="h-4 bg-neutral-200 rounded w-24"></div>
                              <div className="h-4 bg-neutral-200 rounded w-32"></div>
                              <div className="h-4 bg-neutral-200 rounded w-16"></div>
                              <div className="h-4 bg-neutral-200 rounded w-16"></div>
                              <div className="h-4 bg-neutral-200 rounded w-12"></div>
                              <div className="h-4 bg-neutral-200 rounded w-24"></div>
                              <div className="h-4 bg-neutral-200 rounded w-20"></div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : franchiseCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-col items-center justify-center py-16 font-pretendard">
                          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
                            <Stamp className="w-8 h-8 text-neutral-400" />
                          </div>
                          <h3 className="text-lg font-medium text-neutral-900 mb-1">통합 고객이 없습니다</h3>
                          <p className="text-sm text-neutral-500">통합 스탬프를 활성화한 매장에서 적립이 발생하면 여기에 표시됩니다</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    franchiseCustomers.map((fc) => (
                      <tr
                        key={fc.id}
                        onClick={() => fetchFranchiseCustomerDetail(fc.kakaoId)}
                        className="hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center">
                              <Stamp className="w-4 h-4 text-amber-500" />
                            </div>
                            <span className="text-sm font-medium text-neutral-900">{fc.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600 font-pretendard">{fc.phone || '-'}</td>
                        <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">{fc.totalStamps}개</td>
                        <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">{fc.totalPoints.toLocaleString()}P</td>
                        <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">{fc.visitCount}회</td>
                        <td className="px-6 py-4 text-sm text-neutral-600">{fc.lastStore?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-neutral-500">
                          {fc.lastVisitAt ? formatDate(fc.lastVisitAt) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Franchise Pagination */}
            {!isFranchiseLoading && franchiseTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
                <p className="text-sm text-neutral-500">
                  {franchiseTotalCustomers.toLocaleString()}명 중 {((franchiseCurrentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(franchiseCurrentPage * ITEMS_PER_PAGE, franchiseTotalCustomers)}명 표시
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFranchiseCurrentPage(1)}
                    disabled={franchiseCurrentPage === 1}
                    className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    처음
                  </button>
                  <button
                    onClick={() => setFranchiseCurrentPage(franchiseCurrentPage - 1)}
                    disabled={franchiseCurrentPage === 1}
                    className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
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
                            'w-8 h-8 text-sm rounded-lg transition-colors',
                            franchiseCurrentPage === pageNum
                              ? 'bg-brand-800 text-white'
                              : 'text-neutral-600 hover:bg-neutral-100'
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
                    className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setFranchiseCurrentPage(franchiseTotalPages)}
                    disabled={franchiseCurrentPage === franchiseTotalPages}
                    className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedCustomer(null)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col font-pretendard">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">고객 상세 정보</h2>
                <p className="text-sm text-neutral-500">{selectedCustomer.store.name}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Customer Info */}
                  <div className="bg-neutral-50 rounded-xl p-4 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">이름</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedCustomer.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">연락처</p>
                        <p className="text-sm font-medium text-neutral-900 font-pretendard">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">성별</p>
                        <p className="text-sm font-medium text-neutral-900">
                          {selectedCustomer.gender === 'MALE' ? '남성' : selectedCustomer.gender === 'FEMALE' ? '여성' : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">연령대</p>
                        <p className="text-sm font-medium text-neutral-900">
                          {selectedCustomer.ageGroup ? getAgeGroupLabel(selectedCustomer.ageGroup) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">방문 횟수</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedCustomer.visitCount}회</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">누적 포인트</p>
                        <p className="text-sm font-medium text-neutral-900">{(selectedCustomer.totalPoints ?? 0).toLocaleString()}P</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">총 주문 금액</p>
                        <p className="text-sm font-medium text-neutral-900">
                          {(selectedCustomer.totalOrderAmount ?? 0).toLocaleString()}원
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">최근 방문</p>
                        <p className="text-sm font-medium text-neutral-900">
                          {selectedCustomer.lastVisitAt ? formatDate(selectedCustomer.lastVisitAt) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="space-y-4">
                    {/* Orders */}
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="text-sm font-semibold text-neutral-900">주문 내역 ({selectedCustomer.visitsOrOrders.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.visitsOrOrders.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">주문 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.visitsOrOrders.map((order) => (
                              <div key={order.id} className="bg-neutral-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs text-neutral-500">{formatDate(order.visitedAt)}</p>
                                  <p className="text-sm font-semibold text-neutral-900">
                                    {order.totalAmount ? `${order.totalAmount.toLocaleString()}원` : '-'}
                                  </p>
                                </div>
                                {order.orderItems.length > 0 && (
                                  <div className="space-y-1">
                                    {order.orderItems.map((item, idx) => (
                                      <div key={item.id || `item-${idx}`} className="flex items-center justify-between text-xs">
                                        <span className="text-neutral-600">
                                          {item.name || '메뉴'} x{item.quantity || 1}
                                        </span>
                                        <span className="text-neutral-500">{(item.price ?? 0).toLocaleString()}원</span>
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
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="text-sm font-semibold text-neutral-900">피드백 ({selectedCustomer.feedbacks.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.feedbacks.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">피드백이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.feedbacks.map((feedback) => (
                              <div key={feedback.id} className="bg-neutral-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <span key={i} className={i < feedback.rating ? 'text-yellow-400' : 'text-neutral-300'}>
                                        ★
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-neutral-500">{formatDate(feedback.createdAt)}</p>
                                </div>
                                {feedback.feedbackText && (
                                  <p className="text-sm text-neutral-700 mt-2">{feedback.feedbackText}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Points History */}
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="text-sm font-semibold text-neutral-900">포인트 내역 ({selectedCustomer.pointLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.pointLedger.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">포인트 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedCustomer.pointLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                                <div>
                                  <p className="text-sm text-neutral-900">{entry.reason || entry.type}</p>
                                  <p className="text-xs text-neutral-500">{formatDate(entry.createdAt)}</p>
                                </div>
                                <p className={cn(
                                  'text-sm font-semibold',
                                  (entry.amount ?? 0) > 0 ? 'text-green-600' : 'text-red-600'
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
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
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
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedFranchiseCustomer(null)}
          />

          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col font-pretendard">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">통합 고객 상세 정보</h2>
                <p className="text-sm text-neutral-500">프랜차이즈 통합 스탬프/포인트</p>
              </div>
              <button
                onClick={() => setSelectedFranchiseCustomer(null)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isFranchiseDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Customer Info */}
                  <div className="bg-neutral-50 rounded-xl p-4 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">이름</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedFranchiseCustomer.name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">연락처</p>
                        <p className="text-sm font-medium text-neutral-900 font-pretendard">{selectedFranchiseCustomer.phone || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">통합 스탬프</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedFranchiseCustomer.totalStamps}개</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">통합 포인트</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedFranchiseCustomer.totalPoints.toLocaleString()}P</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">방문 횟수</p>
                        <p className="text-sm font-medium text-neutral-900">{selectedFranchiseCustomer.visitCount}회</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">최근 방문</p>
                        <p className="text-sm font-medium text-neutral-900">
                          {selectedFranchiseCustomer.lastVisitAt ? formatDate(selectedFranchiseCustomer.lastVisitAt) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">가입일</p>
                        <p className="text-sm font-medium text-neutral-900">{formatDate(selectedFranchiseCustomer.createdAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stamp Ledger */}
                  <div className="space-y-4">
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="text-sm font-semibold text-neutral-900">스탬프 내역 ({selectedFranchiseCustomer.stampLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedFranchiseCustomer.stampLedger.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">스탬프 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedFranchiseCustomer.stampLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                                <div>
                                  <p className="text-sm text-neutral-900">
                                    {entry.type === 'EARN' ? '적립' : entry.type === 'USE' ? '사용' : entry.type}
                                    {entry.drawnReward && ` - ${entry.drawnReward}`}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {entry.store.name} · {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                                <p className={cn(
                                  'text-sm font-semibold',
                                  entry.delta > 0 ? 'text-green-600' : 'text-red-600'
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
                    <div className="border border-neutral-200 rounded-xl overflow-hidden">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h3 className="text-sm font-semibold text-neutral-900">포인트 내역 ({selectedFranchiseCustomer.pointLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedFranchiseCustomer.pointLedger.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">포인트 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedFranchiseCustomer.pointLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                                <div>
                                  <p className="text-sm text-neutral-900">{entry.reason || entry.type}</p>
                                  <p className="text-xs text-neutral-500">
                                    {entry.store.name} · {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                                <p className={cn(
                                  'text-sm font-semibold',
                                  entry.delta > 0 ? 'text-green-600' : 'text-red-600'
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
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedFranchiseCustomer(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
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
