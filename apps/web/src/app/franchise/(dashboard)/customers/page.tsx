'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronDown,
  X,
  Users,
  UserCircle,
  Check,
  Calendar,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

export default function FranchiseCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Filter states
  const [genderFilter, setGenderFilter] = useState<'all' | 'MALE' | 'FEMALE'>('all');
  const [visitFilter, setVisitFilter] = useState<'all' | '1' | '2' | '5' | '10' | '20'>('all');
  const [lastVisitFilter, setLastVisitFilter] = useState<'all' | '7' | '30' | '90'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateFilterType, setDateFilterType] = useState<'created' | 'lastVisit'>('lastVisit');

  // Dropdown states
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [visitDropdownOpen, setVisitDropdownOpen] = useState(false);
  const [lastVisitDropdownOpen, setLastVisitDropdownOpen] = useState(false);
  const [dateRangeDropdownOpen, setDateRangeDropdownOpen] = useState(false);

  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);

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
      params.append('limit', '10000'); // 전체 고객 조회
      if (searchQuery) params.append('search', searchQuery);
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
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, genderFilter, visitFilter, lastVisitFilter, startDate, endDate, dateFilterType]);

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
    setSearchQuery(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Filter handlers
  const handleGenderSelect = (value: 'all' | 'MALE' | 'FEMALE') => {
    setGenderFilter(value);
    setGenderDropdownOpen(false);
  };

  const handleVisitSelect = (value: 'all' | '1' | '2' | '5' | '10' | '20') => {
    setVisitFilter(value);
    setVisitDropdownOpen(false);
  };

  const handleLastVisitSelect = (value: 'all' | '7' | '30' | '90') => {
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
              전체 {customers.length.toLocaleString()}명의 고객
            </p>
          </div>
        </div>

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
            {/* Gender Filter */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGenderDropdownOpen(!genderDropdownOpen);
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
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
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    연락처
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    소속 매장
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    포인트
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    성별
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    연령대
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    방문횟수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    최근방문
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8}>{renderSkeleton()}</td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={8}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => fetchCustomerDetail(customer.id)}
                      className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">
                            <UserCircle className="w-5 h-5 text-neutral-400" />
                          </div>
                          <span className="text-sm font-medium text-neutral-900">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 font-pretendard">{customer.phone}</td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{customer.store.name}</td>
                      <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">
                        {customer.totalPoints.toLocaleString()}P
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 text-center">
                        {customer.gender === 'MALE' ? '남성' : customer.gender === 'FEMALE' ? '여성' : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {customer.ageGroup ? getAgeGroupLabel(customer.ageGroup) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900 text-right font-medium">
                        {customer.visitCount}회
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-500">
                        {customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
    </div>
  );
}
