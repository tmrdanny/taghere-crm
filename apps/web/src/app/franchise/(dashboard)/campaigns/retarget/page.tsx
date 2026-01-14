'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  X,
  Plus,
  Send,
  Calendar,
  Users,
  MessageSquare,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  sentCount: number;
  scheduledAt?: string;
  createdAt: string;
  store: string;
}

interface StoreOption {
  id: string;
  name: string;
}

// Demo campaigns data
const DEMO_CAMPAIGNS: Campaign[] = [
  { id: '1', name: '1월 신규 고객 환영', channel: 'SMS', status: 'completed', sentCount: 1523, createdAt: '2025-01-10', store: '전체 가맹점' },
  { id: '2', name: '겨울 메뉴 프로모션', channel: '카카오톡', status: 'scheduled', sentCount: 0, scheduledAt: '2025-01-16 10:00', createdAt: '2025-01-14', store: '전체 가맹점' },
  { id: '3', name: '설 연휴 영업 안내', channel: 'SMS', status: 'in_progress', sentCount: 892, createdAt: '2025-01-13', store: '철길부산집 강남점' },
  { id: '4', name: 'VIP 고객 특별 할인', channel: '카카오톡', status: 'completed', sentCount: 456, createdAt: '2025-01-08', store: '철길부산집 홍대점' },
  { id: '5', name: '리뷰 이벤트 안내', channel: 'SMS', status: 'cancelled', sentCount: 0, createdAt: '2025-01-05', store: '전체 가맹점' },
  { id: '6', name: '신메뉴 출시 안내', channel: '카카오톡', status: 'completed', sentCount: 2341, createdAt: '2025-01-03', store: '전체 가맹점' },
  { id: '7', name: '연말 감사 인사', channel: 'SMS', status: 'completed', sentCount: 3456, createdAt: '2024-12-28', store: '전체 가맹점' },
  { id: '8', name: '크리스마스 이벤트', channel: '카카오톡', status: 'completed', sentCount: 1890, createdAt: '2024-12-23', store: '전체 가맹점' },
];

// Demo stores for filter
const DEMO_STORES = [
  { id: 'all', name: '전체 가맹점' },
  { id: '1', name: '철길부산집 강남점' },
  { id: '2', name: '철길부산집 홍대점' },
  { id: '3', name: '철길부산집 신촌점' },
  { id: '4', name: '철길부산집 이태원점' },
  { id: '5', name: '철길부산집 건대점' },
  { id: '6', name: '철길부산집 잠실점' },
];

// Channel options
const CHANNEL_OPTIONS = [
  { value: 'all', label: '전체 채널' },
  { value: 'SMS', label: 'SMS' },
  { value: '카카오톡', label: '카카오톡' },
];

// Status options
const STATUS_OPTIONS = [
  { value: 'all', label: '전체 상태' },
  { value: 'scheduled', label: '예약' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

export default function RetargetCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);

  // New campaign form state
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    channel: 'SMS',
    store: 'all',
    message: '',
    targetType: 'all',
    scheduledAt: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdowns
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/campaigns/retarget`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || DEMO_CAMPAIGNS);
      } else {
        setCampaigns(DEMO_CAMPAIGNS);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
      setCampaigns(DEMO_CAMPAIGNS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch stores
  const fetchStores = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/stores`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStores([{ id: 'all', name: '전체 가맹점' }, ...(data.stores || [])]);
      } else {
        setStores(DEMO_STORES);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
      setStores(DEMO_STORES);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchStores();
  }, [fetchCampaigns, fetchStores]);

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStore = selectedStore === 'all' || campaign.store === stores.find((s) => s.id === selectedStore)?.name;
    const matchesChannel = channelFilter === 'all' || campaign.channel === channelFilter;
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;

    return matchesSearch && matchesStore && matchesChannel && matchesStatus;
  });

  // Status badge renderer
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3" />
            예약
          </span>
        );
      case 'in_progress':
        return (
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            진행중
          </span>
        );
      case 'completed':
        return (
          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            완료
          </span>
        );
      case 'cancelled':
        return (
          <span className="bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            취소
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  // Channel badge renderer
  const renderChannelBadge = (channel: string) => {
    if (channel === 'SMS') {
      return (
        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full">
          SMS
        </span>
      );
    }
    return (
      <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 text-xs font-medium rounded-full">
        카카오톡
      </span>
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

  // Handle new campaign submission
  const handleSubmitCampaign = async () => {
    if (!newCampaign.name || !newCampaign.message) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Add to campaigns list
      const newCampaignData: Campaign = {
        id: Date.now().toString(),
        name: newCampaign.name,
        channel: newCampaign.channel,
        status: newCampaign.scheduledAt ? 'scheduled' : 'in_progress',
        sentCount: 0,
        scheduledAt: newCampaign.scheduledAt || undefined,
        createdAt: new Date().toISOString().split('T')[0],
        store: stores.find((s) => s.id === newCampaign.store)?.name || '전체 가맹점',
      };

      setCampaigns([newCampaignData, ...campaigns]);
      setIsNewCampaignModalOpen(false);
      setNewCampaign({
        name: '',
        channel: 'SMS',
        store: 'all',
        message: '',
        targetType: 'all',
        scheduledAt: '',
      });
    } catch (err) {
      console.error('Failed to create campaign:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-48"></div>
          <div className="h-4 bg-slate-200 rounded w-20"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
          <div className="h-4 bg-slate-200 rounded w-20"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-1">캠페인이 없습니다</h3>
      <p className="text-sm text-slate-500 mb-4">새 캠페인을 생성해보세요</p>
      <button
        onClick={() => setIsNewCampaignModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        새 캠페인
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">리타겟 캠페인</h1>
            <p className="text-sm text-slate-500 mt-1">
              기존 고객에게 메시지를 발송하여 재방문을 유도합니다
            </p>
          </div>
          <button
            onClick={() => setIsNewCampaignModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            새 캠페인
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <div className="p-4 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="캠페인명으로 검색"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Store Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowStoreDropdown(!showStoreDropdown);
                  setShowChannelDropdown(false);
                  setShowStatusDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Store className="w-4 h-4 text-slate-400" />
                {stores.find((s) => s.id === selectedStore)?.name || '전체 가맹점'}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showStoreDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStoreDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {stores.map((store) => (
                      <button
                        key={store.id}
                        onClick={() => {
                          setSelectedStore(store.id);
                          setShowStoreDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          selectedStore === store.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                        )}
                      >
                        {store.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Channel Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowChannelDropdown(!showChannelDropdown);
                  setShowStoreDropdown(false);
                  setShowStatusDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-slate-400" />
                {CHANNEL_OPTIONS.find((c) => c.value === channelFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showChannelDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowChannelDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg">
                    {CHANNEL_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setChannelFilter(option.value);
                          setShowChannelDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          channelFilter === option.value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowStatusDropdown(!showStatusDropdown);
                  setShowStoreDropdown(false);
                  setShowChannelDropdown(false);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Filter className="w-4 h-4 text-slate-400" />
                {STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showStatusDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setStatusFilter(option.value);
                          setShowStatusDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          statusFilter === option.value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    캠페인명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    채널
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    발송수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    생성일
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  filteredCampaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <span className="text-sm font-medium text-slate-900">{campaign.name}</span>
                          <p className="text-xs text-slate-500 mt-0.5">{campaign.store}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">{renderChannelBadge(campaign.channel)}</td>
                      <td className="px-6 py-4">{renderStatusBadge(campaign.status)}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {campaign.sentCount.toLocaleString()}건
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDate(campaign.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Campaign Modal */}
      {isNewCampaignModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsNewCampaignModalOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[85vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">새 캠페인</h2>
                <p className="text-sm text-slate-500">리타겟 캠페인을 생성합니다</p>
              </div>
              <button
                onClick={() => setIsNewCampaignModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  캠페인명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="예: 1월 신규 고객 환영 메시지"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Channel Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  발송 채널 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setNewCampaign({ ...newCampaign, channel: 'SMS' })}
                    className={cn(
                      'flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors',
                      newCampaign.channel === 'SMS'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <MessageSquare className="w-5 h-5" />
                      <span>SMS</span>
                      <span className="text-xs text-slate-500">150원/건</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setNewCampaign({ ...newCampaign, channel: '카카오톡' })}
                    className={cn(
                      'flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors',
                      newCampaign.channel === '카카오톡'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <MessageSquare className="w-5 h-5" />
                      <span>카카오톡</span>
                      <span className="text-xs text-slate-500">200원/건</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Store Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  대상 가맹점
                </label>
                <select
                  value={newCampaign.store}
                  onChange={(e) => setNewCampaign({ ...newCampaign, store: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  발송 대상
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setNewCampaign({ ...newCampaign, targetType: 'all' })}
                    className={cn(
                      'py-2 px-4 rounded-lg border text-sm font-medium transition-colors',
                      newCampaign.targetType === 'all'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    전체 고객
                  </button>
                  <button
                    onClick={() => setNewCampaign({ ...newCampaign, targetType: 'revisit' })}
                    className={cn(
                      'py-2 px-4 rounded-lg border text-sm font-medium transition-colors',
                      newCampaign.targetType === 'revisit'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    재방문 유도
                  </button>
                  <button
                    onClick={() => setNewCampaign({ ...newCampaign, targetType: 'vip' })}
                    className={cn(
                      'py-2 px-4 rounded-lg border text-sm font-medium transition-colors',
                      newCampaign.targetType === 'vip'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    VIP 고객
                  </button>
                </div>
              </div>

              {/* Message Content */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  메시지 내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newCampaign.message}
                  onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                  placeholder="메시지 내용을 입력하세요..."
                  rows={5}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">{newCampaign.message.length}자</p>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  예약 발송 (선택)
                </label>
                <input
                  type="datetime-local"
                  value={newCampaign.scheduledAt}
                  onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">비워두면 즉시 발송됩니다</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsNewCampaignModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmitCampaign}
                disabled={!newCampaign.name || !newCampaign.message || isSubmitting}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors',
                  !newCampaign.name || !newCampaign.message || isSubmitting
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    캠페인 생성
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
