'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  X,
  Users,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  UserCircle,
  Hash,
  RefreshCw,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Filter options
const AGE_GROUP_OPTIONS = ['TWENTIES', 'THIRTIES', 'FORTIES', 'FIFTIES', 'SIXTIES_PLUS'];
const GENDER_OPTIONS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];
const VISIT_COUNT_OPTIONS = [
  { value: '1', label: '1회' },
  { value: '2-5', label: '2-5회' },
  { value: '6-10', label: '6-10회' },
  { value: '10+', label: '10회 이상' },
];
const LAST_VISIT_OPTIONS = [
  { value: '7', label: '7일 이내' },
  { value: '30', label: '30일 이내' },
  { value: '90', label: '90일 이내' },
  { value: '90+', label: '90일 이상' },
];

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

interface SegmentCondition {
  id: string;
  field: 'store' | 'ageGroup' | 'gender' | 'visitCount' | 'lastVisit';
  operator: 'equals' | 'in' | 'gt' | 'lt' | 'between';
  value: string | string[];
}

interface SegmentGroup {
  id: string;
  conditions: SegmentCondition[];
  logic: 'AND' | 'OR';
}

export default function FranchiseCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [segmentGroups, setSegmentGroups] = useState<SegmentGroup[]>([]);
  const [groupLogic, setGroupLogic] = useState<'AND' | 'OR'>('AND');
  const [estimatedTargetCount, setEstimatedTargetCount] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

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

      const response = await fetch(`${API_BASE}/api/franchise/customers`, {
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
  }, []);

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

  // Calculate estimated target count based on segment conditions
  useEffect(() => {
    if (segmentGroups.length === 0) {
      setEstimatedTargetCount(customers.length);
      return;
    }

    // Filter customers based on segment conditions
    const filtered = customers.filter((customer) => {
      const groupResults = segmentGroups.map((group) => {
        const conditionResults = group.conditions.map((condition) => {
          switch (condition.field) {
            case 'store':
              if (Array.isArray(condition.value)) {
                return condition.value.includes(customer.store.id);
              }
              return customer.store.id === condition.value;
            case 'ageGroup':
              if (Array.isArray(condition.value)) {
                return customer.ageGroup ? condition.value.includes(customer.ageGroup) : false;
              }
              return customer.ageGroup === condition.value;
            case 'gender':
              return customer.gender === condition.value;
            case 'visitCount':
              const vc = customer.visitCount;
              if (condition.value === '1') return vc === 1;
              if (condition.value === '2-5') return vc >= 2 && vc <= 5;
              if (condition.value === '6-10') return vc >= 6 && vc <= 10;
              if (condition.value === '10+') return vc > 10;
              return true;
            case 'lastVisit':
              if (!customer.lastVisitAt) return false;
              const daysDiff = Math.floor((Date.now() - new Date(customer.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24));
              if (condition.value === '7') return daysDiff <= 7;
              if (condition.value === '30') return daysDiff <= 30;
              if (condition.value === '90') return daysDiff <= 90;
              if (condition.value === '90+') return daysDiff > 90;
              return true;
            default:
              return true;
          }
        });

        return group.logic === 'AND'
          ? conditionResults.every((r) => r)
          : conditionResults.some((r) => r);
      });

      return groupLogic === 'AND'
        ? groupResults.every((r) => r)
        : groupResults.some((r) => r);
    });

    setEstimatedTargetCount(filtered.length);
  }, [segmentGroups, groupLogic, customers]);

  // Filter customers by search
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.includes(searchQuery) ||
      customer.phone.includes(searchQuery) ||
      customer.store.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Add segment group
  const addSegmentGroup = () => {
    setSegmentGroups([
      ...segmentGroups,
      {
        id: Date.now().toString(),
        conditions: [],
        logic: 'AND',
      },
    ]);
  };

  // Remove segment group
  const removeSegmentGroup = (groupId: string) => {
    setSegmentGroups(segmentGroups.filter((g) => g.id !== groupId));
  };

  // Add condition to group
  const addCondition = (groupId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: [
              ...group.conditions,
              {
                id: Date.now().toString(),
                field: 'store',
                operator: 'in',
                value: [],
              },
            ],
          };
        }
        return group;
      })
    );
  };

  // Remove condition from group
  const removeCondition = (groupId: string, conditionId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: group.conditions.filter((c) => c.id !== conditionId),
          };
        }
        return group;
      })
    );
  };

  // Update condition
  const updateCondition = (groupId: string, conditionId: string, updates: Partial<SegmentCondition>) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: group.conditions.map((c) => {
              if (c.id === conditionId) {
                return { ...c, ...updates };
              }
              return c;
            }),
          };
        }
        return group;
      })
    );
  };

  // Toggle group logic
  const toggleGroupLogic = (groupId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            logic: group.logic === 'AND' ? 'OR' : 'AND',
          };
        }
        return group;
      })
    );
  };

  // Get unique stores from customers
  const uniqueStores = Array.from(
    new Map(customers.map((c) => [c.store.id, c.store])).values()
  );

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-1">고객이 없습니다</h3>
      <p className="text-sm text-slate-500">검색 조건을 변경해보세요</p>
    </div>
  );

  // Helper to display age group label
  const getAgeGroupLabel = (ageGroup: string) => {
    const labels: Record<string, string> = {
      TWENTIES: '20대',
      THIRTIES: '30대',
      FORTIES: '40대',
      FIFTIES: '50대',
      SIXTIES_PLUS: '60대 이상',
    };
    return labels[ageGroup] || ageGroup;
  };

  // Render field options in segment builder
  const renderFieldOptions = (condition: SegmentCondition, groupId: string) => {
    switch (condition.field) {
      case 'store':
        return (
          <div className="flex flex-wrap gap-2">
            {uniqueStores.map((store) => (
              <button
                key={store.id}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(store.id)
                    ? currentValue.filter((v) => v !== store.id)
                    : [...currentValue, store.id];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(store.id)
                    ? 'bg-franchise-100 border-franchise-300 text-franchise-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {store.name}
              </button>
            ))}
          </div>
        );
      case 'ageGroup':
        return (
          <div className="flex flex-wrap gap-2">
            {AGE_GROUP_OPTIONS.map((ageGroup) => (
              <button
                key={ageGroup}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(ageGroup)
                    ? currentValue.filter((v) => v !== ageGroup)
                    : [...currentValue, ageGroup];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(ageGroup)
                    ? 'bg-franchise-100 border-franchise-300 text-franchise-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {getAgeGroupLabel(ageGroup)}
              </button>
            ))}
          </div>
        );
      case 'gender':
        return (
          <div className="flex gap-2">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-franchise-100 border-franchise-300 text-franchise-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case 'visitCount':
        return (
          <div className="flex flex-wrap gap-2">
            {VISIT_COUNT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-franchise-100 border-franchise-300 text-franchise-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case 'lastVisit':
        return (
          <div className="flex flex-wrap gap-2">
            {LAST_VISIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-franchise-100 border-franchise-300 text-franchise-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">고객 통합 DB</h1>
            <p className="text-sm text-slate-500 mt-1">
              전체 {customers.length.toLocaleString()}명의 고객
            </p>
          </div>
        </div>

        {/* Search and Segment Builder */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <div className="p-4 flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름, 연락처, 지역으로 검색"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
              />
            </div>

            {/* Segment Builder Button */}
            <button
              onClick={() => setIsSegmentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-franchise-500 text-white rounded-lg text-sm font-medium hover:bg-franchise-700 transition-colors"
            >
              <Filter className="w-4 h-4" />
              세그먼트 빌더
            </button>

            {/* Export Button */}
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" />
              내보내기
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    연락처
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    소속 매장
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    포인트
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    연령대
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    방문횟수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    최근방문
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => fetchCustomerDetail(customer.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">{customer.phone}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{customer.store.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {customer.totalPoints.toLocaleString()}P
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {customer.ageGroup || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {customer.visitCount}회
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
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

      {/* Segment Builder Modal */}
      {isSegmentModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsSegmentModalOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[80vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">세그먼트 빌더</h2>
                <p className="text-sm text-slate-500">조건을 설정하여 타겟 고객을 선택하세요</p>
              </div>
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Estimated Target Count */}
              <div className="bg-franchise-50 border border-franchise-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-franchise-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-franchise-600" />
                    </div>
                    <div>
                      <p className="text-sm text-franchise-600">예상 타겟 수</p>
                      <p className="text-2xl font-bold text-franchise-900">
                        {estimatedTargetCount.toLocaleString()}명
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSegmentGroups([]);
                      setGroupLogic('AND');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-franchise-600 hover:bg-franchise-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    초기화
                  </button>
                </div>
              </div>

              {/* Segment Groups */}
              {segmentGroups.length > 0 && (
                <div className="space-y-4">
                  {segmentGroups.map((group, groupIndex) => (
                    <div key={group.id}>
                      {groupIndex > 0 && (
                        <div className="flex items-center justify-center my-3">
                          <button
                            onClick={() => setGroupLogic(groupLogic === 'AND' ? 'OR' : 'AND')}
                            className="px-4 py-1 bg-slate-100 text-slate-600 rounded-full text-sm font-medium hover:bg-slate-200 transition-colors"
                          >
                            {groupLogic}
                          </button>
                        </div>
                      )}

                      <div className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-700">조건 그룹 {groupIndex + 1}</span>
                          <button
                            onClick={() => removeSegmentGroup(group.id)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Conditions */}
                        <div className="space-y-3">
                          {group.conditions.map((condition, conditionIndex) => (
                            <div key={condition.id}>
                              {conditionIndex > 0 && (
                                <div className="flex items-center justify-center my-2">
                                  <button
                                    onClick={() => toggleGroupLogic(group.id)}
                                    className="px-3 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium hover:bg-slate-200 transition-colors"
                                  >
                                    {group.logic}
                                  </button>
                                </div>
                              )}

                              <div className="bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <select
                                    value={condition.field}
                                    onChange={(e) =>
                                      updateCondition(group.id, condition.id, {
                                        field: e.target.value as SegmentCondition['field'],
                                        value: [],
                                      })
                                    }
                                    className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
                                  >
                                    <option value="store">소속 매장</option>
                                    <option value="ageGroup">연령대</option>
                                    <option value="gender">성별</option>
                                    <option value="visitCount">방문 횟수</option>
                                    <option value="lastVisit">최근 방문일</option>
                                  </select>
                                  <button
                                    onClick={() => removeCondition(group.id, condition.id)}
                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                {renderFieldOptions(condition, group.id)}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Condition Button */}
                        <button
                          onClick={() => addCondition(group.id)}
                          className="mt-3 flex items-center gap-1 text-sm text-franchise-600 hover:text-franchise-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          조건 추가
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Group Button */}
              <button
                onClick={addSegmentGroup}
                className="mt-4 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-franchise-300 hover:text-franchise-600 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                조건 그룹 추가
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="px-4 py-2 bg-franchise-500 text-white text-sm font-medium rounded-lg hover:bg-franchise-700 transition-colors"
              >
                적용하기
              </button>
            </div>
          </div>
        </>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedCustomer(null)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">고객 상세 정보</h2>
                <p className="text-sm text-slate-500">{selectedCustomer.store.name}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-franchise-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Customer Info */}
                  <div className="bg-slate-50 rounded-xl p-4 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">이름</p>
                        <p className="text-sm font-medium text-slate-900">{selectedCustomer.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">연락처</p>
                        <p className="text-sm font-medium text-slate-900 font-mono">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">성별</p>
                        <p className="text-sm font-medium text-slate-900">
                          {selectedCustomer.gender === 'MALE' ? '남성' : selectedCustomer.gender === 'FEMALE' ? '여성' : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">연령대</p>
                        <p className="text-sm font-medium text-slate-900">
                          {selectedCustomer.ageGroup ? getAgeGroupLabel(selectedCustomer.ageGroup) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">방문 횟수</p>
                        <p className="text-sm font-medium text-slate-900">{selectedCustomer.visitCount}회</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">누적 포인트</p>
                        <p className="text-sm font-medium text-slate-900">{selectedCustomer.totalPoints.toLocaleString()}P</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">총 주문 금액</p>
                        <p className="text-sm font-medium text-slate-900">
                          {selectedCustomer.totalOrderAmount.toLocaleString()}원
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">최근 방문</p>
                        <p className="text-sm font-medium text-slate-900">
                          {selectedCustomer.lastVisitAt ? formatDate(selectedCustomer.lastVisitAt) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="space-y-4">
                    {/* Orders */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                        <h3 className="text-sm font-semibold text-slate-900">주문 내역 ({selectedCustomer.visitsOrOrders.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.visitsOrOrders.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">주문 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.visitsOrOrders.map((order) => (
                              <div key={order.id} className="bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs text-slate-500">{formatDate(order.visitedAt)}</p>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {order.totalAmount ? `${order.totalAmount.toLocaleString()}원` : '-'}
                                  </p>
                                </div>
                                {order.orderItems.length > 0 && (
                                  <div className="space-y-1">
                                    {order.orderItems.map((item) => (
                                      <div key={item.id} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-600">
                                          {item.name} x{item.quantity}
                                        </span>
                                        <span className="text-slate-500">{item.price.toLocaleString()}원</span>
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
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                        <h3 className="text-sm font-semibold text-slate-900">피드백 ({selectedCustomer.feedbacks.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.feedbacks.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">피드백이 없습니다</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedCustomer.feedbacks.map((feedback) => (
                              <div key={feedback.id} className="bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <span key={i} className={i < feedback.rating ? 'text-yellow-400' : 'text-slate-300'}>
                                        ★
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-slate-500">{formatDate(feedback.createdAt)}</p>
                                </div>
                                {feedback.feedbackText && (
                                  <p className="text-sm text-slate-700 mt-2">{feedback.feedbackText}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Points History */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                        <h3 className="text-sm font-semibold text-slate-900">포인트 내역 ({selectedCustomer.pointLedger.length}건)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCustomer.pointLedger.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">포인트 내역이 없습니다</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedCustomer.pointLedger.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                <div>
                                  <p className="text-sm text-slate-900">{entry.reason || entry.type}</p>
                                  <p className="text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
                                </div>
                                <p className={cn(
                                  'text-sm font-semibold',
                                  entry.amount > 0 ? 'text-green-600' : 'text-red-600'
                                )}>
                                  {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}P
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
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
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
