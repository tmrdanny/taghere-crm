'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { formatPhone, formatNumber, formatDate, getRelativeTime } from '@/lib/utils';
import { Search, ChevronLeft, ChevronRight, Edit2, ChevronDown, Check, UserPlus, Star, MessageSquare, History, Send, ShoppingBag } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useRouter, useSearchParams } from 'next/navigation';

interface Customer {
  id: string;
  name: string;
  phone: string;
  totalPoints: number;
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
}

interface PointLedgerEntry {
  id: string;
  delta: number;
  balance: number;
  type: 'EARN' | 'USE' | 'EXPIRE' | 'ADJUST';
  reason: string | null;
  createdAt: string;
}

interface CustomerFeedbackEntry {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
}

interface OrderItem {
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
}

interface VisitOrOrderEntry {
  id: string;
  orderId: string | null;
  visitedAt: string;
  items: OrderItem[] | null;
  totalAmount: number | null;
}

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

  // Edit modal tab and feedback states
  const [editModalTab, setEditModalTab] = useState<'memo' | 'feedback' | 'history' | 'orders'>('orders');
  const [editFeedbackRating, setEditFeedbackRating] = useState(0);
  const [editFeedbackText, setEditFeedbackText] = useState('');
  const [pointHistory, setPointHistory] = useState<PointLedgerEntry[]>([]);
  const [feedbackHistory, setFeedbackHistory] = useState<CustomerFeedbackEntry[]>([]);
  const [orderHistory, setOrderHistory] = useState<VisitOrOrderEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 고객 주문 총액 계산
  const customerTotalOrderAmount = orderHistory.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

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

  useEffect(() => {
    const controller = new AbortController();
    const fetchCustomers = async () => {
      setIsLoading(true);
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

        const res = await fetch(`${apiUrl}/api/customers?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error('고객 목록 조회 중 오류가 발생했습니다.');
        }

        const data = await res.json();
        setCustomers(data.customers || []);
        setPagination({
          total: data.pagination?.total || 0,
          totalPages: data.pagination?.totalPages || 1,
        });
        setSelectedCustomers([]);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message || '조회 중 오류가 발생했습니다.');
        setCustomers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
    return () => controller.abort();
  }, [apiUrl, searchQuery, genderFilter, visitFilter, lastVisitFilter, page, pageSize, refreshKey]);

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
        setPointHistory(data.pointLedger || []);
        setFeedbackHistory(data.feedbacks || []);
        setOrderHistory(data.visitsOrOrders || []);
      }
    } catch (err) {
      console.error('Failed to fetch customer details:', err);
    } finally {
      setLoadingHistory(false);
    }
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
      setRefreshKey((key) => key + 1);
      showToast('고객 정보가 수정되었습니다.', 'success');
    } catch (err: any) {
      showToast(err.message || '고객 정보 수정 중 오류가 발생했습니다.', 'error');
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
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => closeAllDropdowns();
    if (genderDropdownOpen || visitDropdownOpen || lastVisitDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [genderDropdownOpen, visitDropdownOpen, lastVisitDropdownOpen]);

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
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  이름
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  전화번호
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  적립 포인트
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  생일
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  메모
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  방문 횟수
                </th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  액션
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500">
                    불러오는 중...
                  </td>
                </tr>
              )}
              {!isLoading && error && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-error">
                    {error}
                  </td>
                </tr>
              )}
              {!isLoading && !error && customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500">
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
                      <td className="p-4">
                        <span className="font-medium text-neutral-900">
                          {customer.name || '이름 없음'}
                        </span>
                      </td>
                      <td className="p-4 text-neutral-600">
                        <div className="flex items-center gap-2">
                          <span>{formatPhone(customer.phone)}</span>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-neutral-900">
                        {formatNumber(customer.totalPoints)} p
                      </td>
                      <td className="p-4 text-neutral-600">
                        {customer.birthday || '-'}
                      </td>
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
                  {selectedCustomer?.name}
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
              onClick={handleUsePoints}
              disabled={
                !useAmount ||
                parseInt(useAmount) <= 0 ||
                parseInt(useAmount) > (selectedCustomer?.totalPoints || 0) ||
                submittingUse
              }
              className="flex-1"
            >
              {submittingUse ? '처리 중...' : '사용하기'}
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
                <span className="font-medium text-neutral-900">{selectedCustomer?.name}</span>
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
        <ModalContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <ModalHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <ModalTitle>고객 정보</ModalTitle>
              {editingCustomer?.isVip && <Badge variant="vip">VIP</Badge>}
              {editingCustomer?.isNew && <Badge variant="new">신규</Badge>}
            </div>
          </ModalHeader>

          <div className="py-4 overflow-y-auto flex-1 px-1">
            {/* 2-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Customer Info Form */}
              <div className="space-y-4">
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
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 mb-1">총 주문금액</p>
                    <p className="font-semibold text-blue-700">
                      {formatNumber(customerTotalOrderAmount)}원
                    </p>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">이름</label>
                  <Input
                    type="text"
                    placeholder="이름을 입력하세요"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
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

                {/* Birthday and Birth Year */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-600">생일 (MM-DD)</label>
                    <Input
                      type="text"
                      placeholder="01-15"
                      value={editBirthday}
                      onChange={(e) => setEditBirthday(e.target.value)}
                      maxLength={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-600">출생연도</label>
                    <Input
                      type="number"
                      placeholder="1990"
                      value={editBirthYear}
                      onChange={(e) => setEditBirthYear(e.target.value)}
                      min={1900}
                      max={new Date().getFullYear()}
                    />
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
              <div className="space-y-3">
                {/* Tab Headers */}
                <div className="flex border-b border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setEditModalTab('orders')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      editModalTab === 'orders'
                        ? 'border-brand-800 text-brand-800'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                    <span>주문내역</span>
                    {orderHistory.length > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                        {orderHistory.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModalTab('feedback')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      editModalTab === 'feedback'
                        ? 'border-brand-800 text-brand-800'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span>피드백</span>
                    {feedbackHistory.length > 0 && (
                      <span className="ml-1 text-yellow-500">★{feedbackHistory.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModalTab('history')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      editModalTab === 'history'
                        ? 'border-brand-800 text-brand-800'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    <History className="w-4 h-4 flex-shrink-0" />
                    <span>포인트</span>
                    {pointHistory.length > 0 && (
                      <span className="ml-1 text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">
                        {pointHistory.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Orders Tab */}
                {editModalTab === 'orders' && (
                  <div className="space-y-2">
                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && orderHistory.length === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        주문 내역이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && orderHistory.length > 0 && (
                      <div className="max-h-64 overflow-y-auto space-y-3">
                        {orderHistory.map((order) => (
                          <div
                            key={order.id}
                            className="p-3 bg-neutral-50 rounded-lg border border-neutral-100"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-neutral-900">
                                {order.totalAmount ? `${formatNumber(order.totalAmount)}원` : '금액 미입력'}
                              </span>
                              <span className="text-xs text-neutral-400">
                                {formatDate(order.visitedAt)}
                              </span>
                            </div>
                            {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                              <div className="space-y-1.5 pt-1 border-t border-neutral-200 mt-2">
                                {order.items.map((item: OrderItem, idx: number) => {
                                  const menuName = item.name || item.menuName || item.productName || item.title || '(메뉴명 없음)';
                                  const qty = item.quantity || item.count || item.qty || 1;
                                  const itemPrice = item.price || item.amount || item.totalPrice || 0;

                                  return (
                                    <div key={idx} className="flex items-center justify-between text-sm py-0.5">
                                      <span className="text-neutral-700 flex-1 truncate pr-2">
                                        {menuName}
                                        {qty > 1 && (
                                          <span className="text-neutral-400 ml-1">x{qty}</span>
                                        )}
                                      </span>
                                      {itemPrice > 0 && (
                                        <span className="text-neutral-500 flex-shrink-0">{formatNumber(itemPrice)}원</span>
                                      )}
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
                    )}
                  </div>
                )}

                {/* Feedback Tab */}
                {editModalTab === 'feedback' && (
                  <div className="space-y-2">
                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && feedbackHistory.length === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        고객이 남긴 피드백이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && feedbackHistory.length > 0 && (
                      <div className="max-h-64 overflow-y-auto space-y-3">
                        {feedbackHistory.map((feedback) => (
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
                    )}
                  </div>
                )}

                {/* Point History Tab */}
                {editModalTab === 'history' && (
                  <div className="space-y-2">
                    {loadingHistory && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        불러오는 중...
                      </div>
                    )}
                    {!loadingHistory && pointHistory.length === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-sm">
                        포인트 내역이 없습니다.
                      </div>
                    )}
                    {!loadingHistory && pointHistory.length > 0 && (
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {pointHistory.map((entry) => {
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
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <ModalFooter className="flex-shrink-0">
            <Button
              variant="secondary"
              onClick={() => setEditModal(false)}
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

            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">이름</label>
              <Input
                type="text"
                placeholder="이름을 입력하세요"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
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
    </div>
  );
}
