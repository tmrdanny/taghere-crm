'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  X,
  Plus,
  Send,
  MapPin,
  Users,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Info,
  Loader2,
  Wifi,
  Camera,
  ChevronUp,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Korea regions
const KOREA_REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];

// Age group options
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

// Gender options
const GENDER_OPTIONS = [
  { value: 'all', label: '전체 성별' },
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
];

// Cost constants
const SMS_COST_PER_MESSAGE = 150;
const KAKAO_COST_PER_MESSAGE = 200;

export default function AcquisitionCampaignsPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'sms' | 'kakao'>('sms');

  // Region selection
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [regionSearch, setRegionSearch] = useState('');
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  // Filter states
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [gender, setGender] = useState('all');

  // Target counts
  const [globalTotalCount, setGlobalTotalCount] = useState(125000);
  const [availableCount, setAvailableCount] = useState(0);
  const [sendCount, setSendCount] = useState(0);

  // Message state
  const [content, setContent] = useState('');

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(500000);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Calculate counts when filters change
  useEffect(() => {
    if (selectedRegions.length === 0) {
      setAvailableCount(0);
      setSendCount(0);
      return;
    }

    // Simulate count calculation
    setIsLoading(true);
    const timer = setTimeout(() => {
      let baseCount = selectedRegions.length * 5000;

      // Adjust by age groups
      if (selectedAgeGroups.length > 0) {
        baseCount = Math.floor(baseCount * (selectedAgeGroups.length / 5));
      }

      // Adjust by gender
      if (gender !== 'all') {
        baseCount = Math.floor(baseCount * 0.5);
      }

      setAvailableCount(baseCount);
      setSendCount(baseCount);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedRegions, selectedAgeGroups, gender]);

  // Add region
  const addRegion = (region: string) => {
    if (!selectedRegions.includes(region)) {
      setSelectedRegions([...selectedRegions, region]);
    }
    setRegionSearch('');
    setShowRegionDropdown(false);
  };

  // Remove region
  const removeRegion = (region: string) => {
    setSelectedRegions(selectedRegions.filter((r) => r !== region));
  };

  // Toggle age group
  const toggleAgeGroup = (value: string) => {
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // Filter regions by search
  const filteredRegions = regionSearch.trim()
    ? KOREA_REGIONS.filter((r) => r.includes(regionSearch))
    : KOREA_REGIONS;

  // Cost calculations
  const costPerMessage = activeTab === 'sms' ? SMS_COST_PER_MESSAGE : KAKAO_COST_PER_MESSAGE;
  const estimatedCost = sendCount * costPerMessage;
  const canAfford = walletBalance >= estimatedCost;

  // Send validation
  const canSend =
    selectedRegions.length > 0 &&
    content.trim() &&
    sendCount > 0 &&
    canAfford &&
    !isSending;

  // Handle send
  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setSuccessMessage(
        `${sendCount.toLocaleString()}건 발송 요청 완료! 결과는 발송 내역에서 확인하세요.`
      );
      setContent('');
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // Byte length for SMS
  const getByteLength = (str: string): number => {
    let byteLength = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode > 127) {
        byteLength += 2;
      } else {
        byteLength += 1;
      }
    }
    return byteLength;
  };

  const byteLength = getByteLength(content);
  const smsMessageType = byteLength > 90 ? 'LMS' : 'SMS';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Panel - Settings */}
          <div className="flex-1 lg:max-w-2xl">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-200 mb-6">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">신규 고객 유치</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    새로운 고객에게 메시지를 발송하여 방문을 유도합니다
                  </p>
                </div>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('sms')}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-md transition-all',
                      activeTab === 'sms'
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    SMS/LMS
                  </button>
                  <button
                    onClick={() => setActiveTab('kakao')}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-md transition-all',
                      activeTab === 'kakao'
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    카카오톡
                  </button>
                </div>
              </div>

              {/* Info Callout */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 mb-6">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  전국 태그히어 이용 고객 중 마케팅 수신에 동의한 고객에게 발송됩니다.
                </p>
              </div>

              {/* Error/Success */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-6">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 mb-6 text-sm">
                  {successMessage}
                </div>
              )}

              {/* Target Summary */}
              <div className="mb-6">
                <h2 className="text-sm font-medium text-slate-900 mb-3">발송 대상</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-slate-200 bg-white">
                    <p className="text-xs text-slate-500 mb-1">전체 고객</p>
                    <p className="text-xl font-bold text-slate-900">{globalTotalCount.toLocaleString()}</p>
                  </div>
                  <div className={cn(
                    'p-4 rounded-xl border-2 transition-all',
                    selectedRegions.length > 0
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white'
                  )}>
                    <p className="text-xs text-slate-500 mb-1">선택 지역</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {isLoading ? '...' : availableCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-white">
                    <p className="text-xs text-slate-500 mb-1">발송 예정</p>
                    <p className="text-xl font-bold text-indigo-600">{sendCount.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Region Selection */}
              <div className="mb-6">
                <h2 className="text-sm font-medium text-slate-900 mb-3">지역 선택</h2>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">지역을 선택하세요</p>
                      <p className="text-xs text-slate-500">여러 지역을 선택할 수 있습니다</p>
                    </div>
                  </div>

                  {/* Selected Regions */}
                  {selectedRegions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedRegions.map((region) => (
                        <span
                          key={region}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium"
                        >
                          {region}
                          <button
                            onClick={() => removeRegion(region)}
                            className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Region Search */}
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={regionSearch}
                        onChange={(e) => {
                          setRegionSearch(e.target.value);
                          setShowRegionDropdown(true);
                        }}
                        onFocus={() => setShowRegionDropdown(true)}
                        placeholder="지역 검색 (예: 서울, 경기, 부산...)"
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    {/* Dropdown */}
                    {showRegionDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowRegionDropdown(false)} />
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                          {filteredRegions.length > 0 ? (
                            filteredRegions.map((region) => {
                              const isSelected = selectedRegions.includes(region);
                              return (
                                <button
                                  key={region}
                                  onClick={() => !isSelected && addRegion(region)}
                                  disabled={isSelected}
                                  className={cn(
                                    'w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors',
                                    isSelected
                                      ? 'bg-indigo-50 text-indigo-600'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  )}
                                >
                                  <span className="font-medium">{region}</span>
                                  {isSelected ? (
                                    <span className="text-xs text-indigo-500">선택됨</span>
                                  ) : (
                                    <Plus className="w-4 h-4 text-slate-400" />
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-4 py-3 text-sm text-slate-500">
                              검색 결과가 없습니다
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="mb-6">
                <h2 className="text-sm font-medium text-slate-900 mb-3">상세 필터</h2>
                <div className="flex flex-wrap gap-2">
                  {/* Gender */}
                  {GENDER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setGender(option.value)}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                        gender === option.value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                  <div className="w-px h-8 bg-slate-200 mx-1" />
                  {/* Age Groups */}
                  {AGE_GROUP_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleAgeGroup(option.value)}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                        selectedAgeGroups.includes(option.value)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {selectedAgeGroups.length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">연령대 미선택 시 전체 연령대로 발송됩니다</p>
                )}
              </div>

              {/* Send Count */}
              <div className="mb-6">
                <h2 className="text-sm font-medium text-slate-900 mb-3">발송 인원 수</h2>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={availableCount || 10000}
                    value={sendCount}
                    onChange={(e) => setSendCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-slate-600">명</span>
                </div>
                {availableCount > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    최대 발송 가능: {availableCount.toLocaleString()}명
                  </p>
                )}
              </div>

              {/* Message Content */}
              <div className="mb-6">
                <h2 className="text-sm font-medium text-slate-900 mb-3">
                  메시지 내용 {activeTab === 'sms' && <span className="text-slate-400 font-normal">(단문/장문 자동 전환)</span>}
                </h2>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="메시지 내용을 입력하세요..."
                  rows={6}
                  className="w-full border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-2">
                  {activeTab === 'sms' ? (
                    <>
                      <span>{smsMessageType} ({byteLength}byte)</span>
                      <span>{content.length}자</span>
                    </>
                  ) : (
                    <>
                      <span>카카오톡 브랜드 메시지</span>
                      <span>{content.length}자</span>
                    </>
                  )}
                </div>
              </div>

              {/* Cost Summary */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-slate-600">예상 비용</p>
                    <p className="text-xl font-bold text-slate-900">
                      {sendCount.toLocaleString()}명 x {costPerMessage}원 ={' '}
                      <span className="text-indigo-600">{estimatedCost.toLocaleString()}원</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">현재 잔액</p>
                    <p className={cn('text-xl font-bold', canAfford ? 'text-emerald-600' : 'text-red-600')}>
                      {walletBalance.toLocaleString()}원
                    </p>
                  </div>
                </div>

                {/* Marketing Effect */}
                {sendCount > 0 && (
                  <div className="mb-4 p-4 bg-emerald-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-700">예상 마케팅 효과</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">예상 방문율</p>
                        <p className="text-base font-bold text-emerald-700">
                          {activeTab === 'sms' ? '2.7%' : '3.4%'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">예상 방문</p>
                        <p className="text-base font-bold text-emerald-700">
                          {Math.round(sendCount * (activeTab === 'sms' ? 0.027 : 0.034)).toLocaleString()}명
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">예상 매출</p>
                        <p className="text-base font-bold text-emerald-700">
                          {(Math.round(sendCount * (activeTab === 'sms' ? 0.027 : 0.034)) * 25000).toLocaleString()}원
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      * 업계 평균 방문율 및 기본 객단가 25,000원 기준
                    </p>
                  </div>
                )}

                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={cn(
                    'w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors',
                    canSend
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-slate-300 cursor-not-allowed'
                  )}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      발송 중...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      발송하기
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="hidden lg:block w-[360px]">
            <div className="sticky top-6 bg-slate-200 rounded-3xl p-5">
              {/* iPhone Preview */}
              <div className="w-full h-[600px] bg-white rounded-[44px] border-[10px] border-slate-800 overflow-hidden flex flex-col shadow-2xl relative">
                {/* Dynamic Island */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90px] h-[28px] bg-slate-800 rounded-full z-20" />

                {/* Status Bar */}
                <div className="h-12 bg-white flex items-end justify-between px-6 pb-1 text-xs font-semibold">
                  <span>12:30</span>
                  <div className="flex items-center gap-1">
                    <Wifi className="w-4 h-4" />
                  </div>
                </div>

                {/* iOS Header */}
                <div className="h-[60px] bg-white flex items-center justify-between px-4 border-b border-slate-200">
                  <ChevronLeft className="w-6 h-6 text-blue-500" />
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <Users className="w-5 h-5 text-slate-400" />
                    </div>
                    <span className="text-[13px] font-semibold text-slate-900 mt-1">태그히어</span>
                  </div>
                  <div className="w-6" />
                </div>

                {/* Message Body */}
                <div className="flex-1 bg-white px-4 py-3 overflow-y-auto">
                  <div className="text-center text-[12px] text-slate-400 font-medium mb-4">
                    문자 메시지
                    <br />
                    오늘 오후 12:30
                  </div>
                  <div className="flex justify-start">
                    <div className="py-3 px-4 rounded-[20px] rounded-bl-[6px] max-w-[85%] text-[15px] leading-relaxed bg-slate-100 text-slate-900">
                      {content ? (
                        <span className="whitespace-pre-wrap break-words">
                          {activeTab === 'sms' ? `(광고)\n${content}\n무료수신거부 080-500-4233` : content}
                        </span>
                      ) : (
                        <span className="text-slate-400">메시지 미리보기</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Input Bar */}
                <div className="py-3 px-4 bg-white border-t border-slate-200 flex items-center gap-3">
                  <Camera className="w-6 h-6 text-blue-500" />
                  <div className="flex-1 h-9 bg-slate-100 rounded-full px-4 flex items-center">
                    <span className="text-slate-400 text-[15px]">iMessage</span>
                  </div>
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <ChevronUp className="w-5 h-5 text-white" />
                  </div>
                </div>

                {/* Home Indicator */}
                <div className="h-8 bg-white flex items-center justify-center">
                  <div className="w-32 h-1 bg-slate-800 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
