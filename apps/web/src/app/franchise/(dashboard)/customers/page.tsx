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

// Demo customers data
const DEMO_CUSTOMERS = [
  { id: '1', name: '김*호', phone: '010-****-5678', visitCount: 12, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '서울 강남구', age: '30대', gender: 'MALE' },
  { id: '2', name: '이*영', phone: '010-****-1234', visitCount: 8, lastVisit: '2025-01-10', preferredCategories: ['한식'], region: '서울 마포구', age: '20대', gender: 'FEMALE' },
  { id: '3', name: '박*진', phone: '010-****-9012', visitCount: 15, lastVisit: '2025-01-14', preferredCategories: ['한식', '일식'], region: '서울 강남구', age: '40대', gender: 'MALE' },
  { id: '4', name: '최*아', phone: '010-****-3456', visitCount: 6, lastVisit: '2025-01-08', preferredCategories: ['카페'], region: '경기 성남시', age: '20대', gender: 'FEMALE' },
  { id: '5', name: '정*수', phone: '010-****-7890', visitCount: 22, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이', '일식'], region: '서울 송파구', age: '50대', gender: 'MALE' },
  { id: '6', name: '강*미', phone: '010-****-2345', visitCount: 4, lastVisit: '2025-01-05', preferredCategories: ['양식'], region: '인천 남동구', age: '30대', gender: 'FEMALE' },
  { id: '7', name: '윤*현', phone: '010-****-6789', visitCount: 18, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식'], region: '부산 부산진구', age: '40대', gender: 'MALE' },
  { id: '8', name: '임*서', phone: '010-****-0123', visitCount: 9, lastVisit: '2025-01-11', preferredCategories: ['카페', '디저트'], region: '서울 서대문구', age: '20대', gender: 'FEMALE' },
  { id: '9', name: '한*우', phone: '010-****-4567', visitCount: 31, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이'], region: '대구 중구', age: '60대', gender: 'MALE' },
  { id: '10', name: '오*빈', phone: '010-****-8901', visitCount: 7, lastVisit: '2025-01-09', preferredCategories: ['일식'], region: '광주 서구', age: '30대', gender: 'FEMALE' },
  { id: '11', name: '서*준', phone: '010-****-2346', visitCount: 14, lastVisit: '2025-01-13', preferredCategories: ['한식', '양식'], region: '대전 서구', age: '30대', gender: 'MALE' },
  { id: '12', name: '신*은', phone: '010-****-6780', visitCount: 5, lastVisit: '2025-01-07', preferredCategories: ['카페'], region: '울산 남구', age: '20대', gender: 'FEMALE' },
  { id: '13', name: '권*민', phone: '010-****-0124', visitCount: 11, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '경기 수원시', age: '40대', gender: 'MALE' },
  { id: '14', name: '황*지', phone: '010-****-4568', visitCount: 3, lastVisit: '2025-01-04', preferredCategories: ['디저트'], region: '제주 제주시', age: '20대', gender: 'FEMALE' },
  { id: '15', name: '안*석', phone: '010-****-8902', visitCount: 25, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '서울 용산구', age: '50대', gender: 'MALE' },
  { id: '16', name: '송*라', phone: '010-****-2347', visitCount: 8, lastVisit: '2025-01-10', preferredCategories: ['일식', '카페'], region: '서울 광진구', age: '30대', gender: 'FEMALE' },
  { id: '17', name: '전*혁', phone: '010-****-6781', visitCount: 19, lastVisit: '2025-01-13', preferredCategories: ['한식'], region: '충남 천안시', age: '40대', gender: 'MALE' },
  { id: '18', name: '홍*연', phone: '010-****-0125', visitCount: 6, lastVisit: '2025-01-06', preferredCategories: ['양식', '카페'], region: '충북 청주시', age: '20대', gender: 'FEMALE' },
  { id: '19', name: '유*훈', phone: '010-****-4569', visitCount: 13, lastVisit: '2025-01-11', preferredCategories: ['한식', '구이'], region: '전북 전주시', age: '50대', gender: 'MALE' },
  { id: '20', name: '조*희', phone: '010-****-8903', visitCount: 10, lastVisit: '2025-01-12', preferredCategories: ['디저트', '카페'], region: '경남 창원시', age: '30대', gender: 'FEMALE' },
];

// Filter options
const REGION_OPTIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '충남', '충북', '전북', '전남', '경북', '경남', '강원', '제주'];
const AGE_OPTIONS = ['20대', '30대', '40대', '50대', '60대 이상'];
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

interface Customer {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
  preferredCategories: string[];
  region: string;
  age: string;
  gender: string;
}

interface SegmentCondition {
  id: string;
  field: 'region' | 'age' | 'gender' | 'visitCount' | 'lastVisit';
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

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/customers`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || DEMO_CUSTOMERS);
      } else {
        setCustomers(DEMO_CUSTOMERS);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setCustomers(DEMO_CUSTOMERS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Calculate estimated target count based on segment conditions
  useEffect(() => {
    if (segmentGroups.length === 0) {
      setEstimatedTargetCount(customers.length);
      return;
    }

    // Simple filtering logic for demo
    const filtered = customers.filter((customer) => {
      const groupResults = segmentGroups.map((group) => {
        const conditionResults = group.conditions.map((condition) => {
          switch (condition.field) {
            case 'region':
              if (Array.isArray(condition.value)) {
                return condition.value.some((v) => customer.region.includes(v));
              }
              return customer.region.includes(condition.value as string);
            case 'age':
              if (Array.isArray(condition.value)) {
                return condition.value.includes(customer.age);
              }
              return customer.age === condition.value;
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
              const daysDiff = Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / (1000 * 60 * 60 * 24));
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
      customer.region.toLowerCase().includes(searchQuery.toLowerCase());
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
                field: 'region',
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

  // Render field options in segment builder
  const renderFieldOptions = (condition: SegmentCondition, groupId: string) => {
    switch (condition.field) {
      case 'region':
        return (
          <div className="flex flex-wrap gap-2">
            {REGION_OPTIONS.map((region) => (
              <button
                key={region}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(region)
                    ? currentValue.filter((v) => v !== region)
                    : [...currentValue, region];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(region)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {region}
              </button>
            ))}
          </div>
        );
      case 'age':
        return (
          <div className="flex flex-wrap gap-2">
            {AGE_OPTIONS.map((age) => (
              <button
                key={age}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(age)
                    ? currentValue.filter((v) => v !== age)
                    : [...currentValue, age];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(age)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {age}
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
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
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
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
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
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
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
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Segment Builder Button */}
            <button
              onClick={() => setIsSegmentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    방문횟수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    최근방문
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    선호업종
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50 transition-colors"
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
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {customer.visitCount}회
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDate(customer.lastVisit)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {customer.preferredCategories.map((category) => (
                            <span
                              key={category}
                              className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
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
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-indigo-600">예상 타겟 수</p>
                      <p className="text-2xl font-bold text-indigo-900">
                        {estimatedTargetCount.toLocaleString()}명
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSegmentGroups([]);
                      setGroupLogic('AND');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
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
                                    <option value="region">지역</option>
                                    <option value="age">연령대</option>
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
                          className="mt-3 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
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
                className="mt-4 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
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
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                적용하기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
