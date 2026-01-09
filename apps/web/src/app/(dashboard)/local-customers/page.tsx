'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Users,
  Send,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Wifi,
  Camera,
  BatteryFull,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 연령대 옵션
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

// 성별 옵션
const GENDER_OPTIONS = [
  { value: 'all', label: '전체 성별' },
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
];

// 비용 상수
const COST_PER_MESSAGE = 250;

// 인증 토큰 가져오기
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token') || '';
  }
  return '';
};

export default function LocalCustomersPage() {
  // 지역 상태
  const [sidos, setSidos] = useState<string[]>([]);
  const [sigungus, setSigungus] = useState<string[]>([]);
  const [regionSido, setRegionSido] = useState('');
  const [regionSigungu, setRegionSigungu] = useState('');

  // 필터 상태
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [gender, setGender] = useState<string>('all');

  // 발송 대상 상태
  const [totalCount, setTotalCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);
  const [sendCount, setSendCount] = useState(100);

  // 메시지 상태
  const [content, setContent] = useState('');

  // 지갑 상태
  const [walletBalance, setWalletBalance] = useState(0);

  // UI 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 테스트 발송 상태
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);

  // 시/도 목록 로드
  useEffect(() => {
    const fetchSidos = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/local-customers/regions`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });
        const data = await res.json();
        setSidos(data.sidos || []);
      } catch (err) {
        console.error('Failed to fetch sidos:', err);
      }
    };
    fetchSidos();
  }, []);

  // 시/군/구 목록 로드
  useEffect(() => {
    if (!regionSido) {
      setSigungus([]);
      setRegionSigungu('');
      return;
    }

    const fetchSigungus = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/local-customers/regions?sido=${encodeURIComponent(regionSido)}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken()}`,
            },
          }
        );
        const data = await res.json();
        setSigungus(data.sigungus || []);
        setRegionSigungu('');
      } catch (err) {
        console.error('Failed to fetch sigungus:', err);
      }
    };
    fetchSigungus();
  }, [regionSido]);

  // 고객 수 조회
  const fetchCount = useCallback(async () => {
    if (!regionSido || !regionSigungu) {
      setTotalCount(0);
      setAvailableCount(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        regionSido,
        regionSigungu,
      });

      if (selectedAgeGroups.length > 0) {
        params.set('ageGroups', selectedAgeGroups.join(','));
      }
      if (gender !== 'all') {
        params.set('gender', gender);
      }

      const res = await fetch(`${API_BASE}/api/local-customers/count?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      const data = await res.json();

      setTotalCount(data.totalCount || 0);
      setAvailableCount(data.availableCount || 0);
    } catch (err) {
      console.error('Failed to fetch count:', err);
    } finally {
      setIsLoading(false);
    }
  }, [regionSido, regionSigungu, selectedAgeGroups, gender]);

  // 필터 변경 시 고객 수 조회
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // 비용 예상 조회
  const fetchEstimate = useCallback(async () => {
    if (sendCount <= 0) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/local-customers/estimate?sendCount=${sendCount}`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      const data = await res.json();
      setWalletBalance(data.walletBalance || 0);
    } catch (err) {
      console.error('Failed to fetch estimate:', err);
    }
  }, [sendCount]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  // 연령대 토글
  const toggleAgeGroup = (value: string) => {
    setSelectedAgeGroups((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 발송 수량 초과 확인
  const isOverLimit = sendCount > availableCount && availableCount > 0;

  // 예상 비용
  const estimatedCost = sendCount * COST_PER_MESSAGE;
  const canAfford = walletBalance >= estimatedCost;

  // 발송 가능 여부
  const canSend =
    regionSido &&
    regionSigungu &&
    content.trim() &&
    sendCount > 0 &&
    sendCount <= availableCount &&
    canAfford &&
    !isSending;

  // 메시지 발송
  const handleSend = async () => {
    if (isOverLimit) {
      setError(`발송 가능한 고객이 ${availableCount.toLocaleString()}명입니다.`);
      setSendCount(availableCount);
      return;
    }

    if (!canSend) return;

    setIsSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/local-customers/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          content,
          ageGroups: selectedAgeGroups.length > 0 ? selectedAgeGroups : null,
          gender: gender !== 'all' ? gender : null,
          regionSido,
          regionSigungu,
          sendCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '발송에 실패했습니다.');
      }

      setSuccessMessage(
        `${data.pendingCount.toLocaleString()}건 발송 요청 완료! 결과는 발송 내역에서 확인하세요.`
      );
      setContent('');
      fetchCount();
      fetchEstimate();
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // 테스트 발송
  const handleTestSend = async () => {
    if (!testPhone || !content.trim()) {
      setError('테스트 전화번호와 메시지 내용을 입력해주세요.');
      return;
    }

    setIsTestSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/local-customers/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ content, phone: testPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '테스트 발송에 실패했습니다.');
      }

      setSuccessMessage('테스트 메시지가 발송되었습니다.');
    } catch (err: any) {
      setError(err.message || '테스트 발송 중 오류가 발생했습니다.');
    } finally {
      setIsTestSending(false);
    }
  };

  // 바이트 길이 계산
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
  const messageType = byteLength > 90 ? 'LMS' : 'SMS';

  return (
    <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 gap-6 overflow-hidden max-w-[1200px] mx-auto w-full lg:justify-center">
      {/* Left Panel - Settings */}
      <div className="flex-1 lg:max-w-[720px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-neutral-900">우리동네 손님 찾기</h1>
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              NEW
            </span>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white">
              문자 (SMS/LMS)
            </button>
            <button
              disabled
              className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-400 cursor-not-allowed"
            >
              카카오톡 (알림톡)
            </button>
          </div>
        </div>

        {/* 에러/성공 메시지 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}

        {/* 발송 대상 선택 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 대상 선택</h2>
          <div className="grid grid-cols-3 gap-3">
            <div
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all',
                'border-brand-500 bg-brand-50'
              )}
            >
              <p className="text-sm text-neutral-600">전체 고객</p>
              <p className="text-2xl font-bold text-neutral-900">
                {isLoading ? '...' : totalCount.toLocaleString()}명
              </p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <p className="text-sm text-neutral-600">발송 가능</p>
              <p className="text-2xl font-bold text-green-600">
                {isLoading ? '...' : availableCount.toLocaleString()}명
              </p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <p className="text-sm text-neutral-600">발송 예정</p>
              <p className="text-2xl font-bold text-brand-600">{sendCount.toLocaleString()}명</p>
            </div>
          </div>
        </div>

        {/* 지역 선택 */}
        <div
          className="p-4 rounded-xl border border-neutral-200 bg-white cursor-pointer hover:border-brand-300 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-neutral-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-neutral-500">지역 선택</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="relative">
                  <select
                    value={regionSido}
                    onChange={(e) => setRegionSido(e.target.value)}
                    className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">시/도 선택</option>
                    {sidos.map((sido) => (
                      <option key={sido} value={sido}>
                        {sido}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={regionSigungu}
                    onChange={(e) => setRegionSigungu(e.target.value)}
                    disabled={!regionSido}
                    className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-neutral-100 disabled:text-neutral-400"
                  >
                    <option value="">시/군/구 선택</option>
                    {sigungus.map((sigungu) => (
                      <option key={sigungu} value={sigungu}>
                        {sigungu}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 상세 필터 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">상세 필터</h2>
          <div className="flex flex-wrap gap-2">
            {/* 성별 필터 */}
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setGender(option.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                  gender === option.value
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300'
                )}
              >
                {option.label}
              </button>
            ))}
            <div className="w-px h-8 bg-neutral-200 mx-1" />
            {/* 연령대 필터 */}
            {AGE_GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleAgeGroup(option.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
                  selectedAgeGroups.includes(option.value)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedAgeGroups.length === 0 && (
            <p className="text-xs text-neutral-500 mt-2">연령대 미선택 시 전체 연령대로 발송됩니다</p>
          )}
        </div>

        {/* 발송 인원 수 */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">발송 인원 수</h2>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={availableCount || 10000}
              value={sendCount}
              onChange={(e) => setSendCount(Math.max(1, parseInt(e.target.value) || 1))}
              className={cn(
                'w-32 border rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-500',
                isOverLimit ? 'border-orange-400 bg-orange-50' : 'border-neutral-300'
              )}
            />
            <span className="text-neutral-600">명</span>
            {isOverLimit && (
              <span className="text-sm text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                발송 가능 인원 초과
              </span>
            )}
          </div>
        </div>

        {/* 메시지 내용 입력 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              메시지 내용 입력{' '}
              <span className="text-neutral-400 font-normal">(단문/장문 자동 전환)</span>
            </h2>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`[태그히어] 4월 봄맞이 이벤트 안내\n\n안녕하세요!\n따뜻한 봄을 맞아 태그히어 강남본점에서 특별한 혜택을 준비했습니다.\n\n[이벤트 혜택]\n- 첫 방문 고객 10% 할인\n- 2인 이상 방문 시 음료 무료\n\n기간: 4/1 ~ 4/30\n\n많은 관심 부탁드립니다!`}
            rows={8}
            className="w-full border border-neutral-300 rounded-lg px-4 py-3 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-2">
            <span>
              {messageType} ({byteLength}byte)
            </span>
            <span>{content.length}자</span>
          </div>
        </div>

        {/* 이미지 첨부 (비활성화 - 외부 고객 SMS는 텍스트만) */}
        <div className="p-3 bg-neutral-50 rounded-lg">
          <div className="flex items-center gap-2 text-neutral-400">
            <Info className="w-4 h-4" />
            <span className="text-sm">
              외부 고객 SMS는 텍스트만 발송 가능합니다. (이미지 첨부 불가)
            </span>
          </div>
        </div>

        {/* 비용 요약 및 발송 버튼 */}
        <div className="border-t border-neutral-200 pt-4 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-neutral-600">예상 비용</p>
              <p className="text-xl font-bold text-neutral-900">
                {sendCount.toLocaleString()}명 × {COST_PER_MESSAGE}원 ={' '}
                <span className="text-brand-600">{estimatedCost.toLocaleString()}원</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-neutral-600">현재 잔액</p>
              <p className={cn('text-xl font-bold', canAfford ? 'text-green-600' : 'text-red-600')}>
                {walletBalance.toLocaleString()}원
              </p>
            </div>
          </div>

          {/* 테스트 발송 */}
          <div className="mb-4 p-3 bg-neutral-50 rounded-lg">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              테스트 발송 (선택)
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={handleTestSend}
                disabled={isTestSending || !content.trim() || !testPhone}
                className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTestSending ? '발송 중...' : '테스트 발송'}
              </button>
            </div>
          </div>

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors',
              canSend ? 'bg-brand-600 hover:bg-brand-700' : 'bg-neutral-300 cursor-not-allowed'
            )}
          >
            <Send className="w-5 h-5" />
            {isSending ? '발송 중...' : `메시지 발송하기`}
          </button>
        </div>
      </div>

      {/* Right Panel - iPhone Preview (Sticky) */}
      <div className="hidden lg:block flex-none w-[360px]">
        <div className="sticky top-6 bg-[#e2e8f0] rounded-3xl p-5">
          {/* iPhone Frame */}
          <div className="w-full h-[680px] bg-white rounded-[44px] border-[10px] border-[#1e293b] overflow-hidden flex flex-col shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative">
          {/* Dynamic Island */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90px] h-[28px] bg-[#1e293b] rounded-full z-20" />

          {/* Status Bar */}
          <div className="h-12 bg-white flex items-end justify-between px-6 pb-1 text-xs font-semibold">
            <span>12:30</span>
            <div className="flex items-center gap-1">
              <Wifi className="w-4 h-4" />
              <BatteryFull className="w-5 h-5" />
            </div>
          </div>

          {/* iOS Header */}
          <div className="h-[60px] bg-white flex items-center justify-between px-4 border-b border-[#e5e7eb]">
            <ChevronLeft className="w-6 h-6 text-[#007aff]" />
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#e5e7eb] flex items-center justify-center">
                <Users className="w-5 h-5 text-[#9ca3af]" />
              </div>
              <span className="text-[13px] font-semibold text-[#1e293b] mt-1">태그히어 CRM</span>
            </div>
            <div className="w-6" />
          </div>

          {/* Message Body */}
          <div className="flex-1 bg-white px-4 py-3 flex flex-col overflow-y-auto">
            <div className="text-center text-[12px] text-[#8e8e93] font-medium mb-4">
              문자 메시지
              <br />
              오늘 오후 12:30
            </div>
            <div className="flex justify-start">
              <div className="bg-[#e5e5ea] text-[#1e293b] py-3 px-4 rounded-[20px] rounded-bl-[6px] max-w-[85%] text-[15px] leading-[1.5]">
                {content ? (
                  <span className="whitespace-pre-wrap break-words">{content}</span>
                ) : (
                  <span className="text-[#94a3b8]">메시지 미리보기</span>
                )}
              </div>
            </div>
          </div>

          {/* Input Bar */}
          <div className="py-3 px-4 bg-white border-t border-[#e5e7eb] flex items-center gap-3">
            <Camera className="w-6 h-6 text-[#007aff]" />
            <span className="text-[17px] font-bold text-[#007aff]">A</span>
            <div className="flex-1 h-9 bg-[#f1f5f9] rounded-full px-4 flex items-center">
              <span className="text-[#94a3b8] text-[15px]">iMessage</span>
            </div>
            <div className="w-8 h-8 bg-[#007aff] rounded-full flex items-center justify-center">
              <ChevronUp className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Home Indicator */}
          <div className="h-8 bg-white flex items-center justify-center">
            <div className="w-32 h-1 bg-[#1e293b] rounded-full" />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
