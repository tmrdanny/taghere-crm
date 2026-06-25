'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Ticket, Store, Calendar, Phone, AlertCircle } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';


interface CouponInfo {
  code: string;
  storeName: string;
  couponContent: string;
  expiryDate: string;
  phone: string;
  isUsed: boolean;
  usedAt: string | null;
  usedBy: string | null;
  createdAt: string;
}

// 페이지 전체에 적용되는 Pretendard 글로벌 폰트 (enroll/table-link과 동일)
function PretendardStyle() {
  return (
    <style jsx global>{`
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');
      .font-pretendard {
        font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
      }
    `}</style>
  );
}

export default function CouponVerifyPage() {
  const params = useParams();
  const code = params.code as string;

  const [coupon, setCoupon] = useState<CouponInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsing, setIsUsing] = useState(false);
  const [staffName, setStaffName] = useState('');

  // 쿠폰 정보 조회
  const fetchCoupon = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/public/coupon/${code}`);

      if (!res.ok) {
        if (res.status === 404) {
          setError('존재하지 않는 쿠폰입니다.');
        } else {
          setError('쿠폰 정보를 불러올 수 없습니다.');
        }
        return;
      }

      const data = await res.json();
      setCoupon(data);
    } catch (err) {
      console.error('Failed to fetch coupon:', err);
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (code) {
      fetchCoupon();
    }
  }, [code, fetchCoupon]);

  // 쿠폰 사용 처리
  const handleUseCoupon = async () => {
    if (!staffName.trim()) {
      alert('직원명을 입력해주세요.');
      return;
    }

    try {
      setIsUsing(true);

      const res = await fetch(`${API_BASE}/api/public/coupon/${code}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName: staffName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '쿠폰 사용 처리에 실패했습니다.');
        return;
      }

      trackEvent('coupon_used', { store_name: coupon?.storeName ?? null, has_staff_name: staffName.trim().length > 0 });
      // 쿠폰 정보 새로고침
      await fetchCoupon();
    } catch (err) {
      console.error('Failed to use coupon:', err);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsUsing(false);
    }
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-[100dvh] flex flex-col items-center justify-center bg-white gap-4">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-400">쿠폰 정보를 불러오는 중...</p>
        </div>
        <PretendardStyle />
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="min-h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-[100dvh] flex flex-col items-center justify-center bg-white px-6 text-center">
          <div className="w-16 h-16 bg-[#fff0f3] rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-[#ff6b6b]" />
          </div>
          <h1 className="text-lg font-bold text-[#1d2022] mb-1">쿠폰 오류</h1>
          <p className="text-sm text-[#b1b5b8]">{error}</p>
        </div>
        <PretendardStyle />
      </div>
    );
  }

  // 쿠폰이 없는 경우
  if (!coupon) {
    return (
      <div className="min-h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-[100dvh] flex flex-col items-center justify-center bg-white px-6 text-center">
          <div className="w-16 h-16 bg-[#f8f9fa] rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-[#b1b5b8]" />
          </div>
          <h1 className="text-lg font-bold text-[#1d2022]">쿠폰을 찾을 수 없습니다</h1>
        </div>
        <PretendardStyle />
      </div>
    );
  }

  const isUsed = coupon.isUsed;

  // 정보 행 구성
  const infoRows = [
    { icon: Store, label: '매장', value: coupon.storeName },
    { icon: Ticket, label: '쿠폰 내용', value: coupon.couponContent },
    { icon: Calendar, label: '유효기간', value: coupon.expiryDate },
    { icon: Phone, label: '고객 연락처', value: coupon.phone },
  ];

  return (
    <div className="min-h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-y-auto">
      <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col bg-white">
        {/* Header */}
        <header className="flex-shrink-0 h-14 flex items-center justify-center border-b border-neutral-100">
          <h1 className="text-base font-bold text-[#1d2022]">쿠폰 확인</h1>
        </header>

        {/* Content */}
        <main className="flex-1 px-5 py-6">
          {/* 상태 배너 */}
          <div className={`rounded-2xl px-6 py-7 text-center ${isUsed ? 'bg-[#f8f9fa]' : 'bg-[#FFFBEB]'}`}>
            <div className="flex justify-center">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  isUsed ? 'bg-neutral-200' : 'bg-[#FFD541]'
                }`}
              >
                {isUsed ? (
                  <CheckCircle2 className="w-7 h-7 text-neutral-500" />
                ) : (
                  <Ticket className="w-7 h-7 text-[#1d2022]" />
                )}
              </div>
            </div>
            <h2 className={`mt-3 text-xl font-bold ${isUsed ? 'text-[#b1b5b8]' : 'text-[#1d2022]'}`}>
              {isUsed ? '사용 완료된 쿠폰' : '사용 가능한 쿠폰'}
            </h2>
            {isUsed && coupon.usedAt && (
              <p className="mt-1 text-sm text-[#b1b5b8]">
                {new Date(coupon.usedAt).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {coupon.usedBy && ` · ${coupon.usedBy}`}
              </p>
            )}
          </div>

          {/* 쿠폰 정보 */}
          <div className="mt-4 rounded-2xl bg-[#f8f9fa] overflow-hidden">
            {infoRows.map(({ icon: Icon, label, value }, idx) => (
              <div
                key={label}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  idx !== infoRows.length - 1 ? 'border-b border-neutral-200/60' : ''
                }`}
              >
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#55595e]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#b1b5b8]">{label}</p>
                  <p className="font-semibold text-[#1d2022] break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 사용 처리 영역 */}
          {!isUsed && (
            <div className="mt-6">
              <label htmlFor="staffName" className="block text-sm font-semibold text-[#1d2022] mb-2">
                직원명 입력
              </label>
              <input
                id="staffName"
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="직원 이름을 입력하세요"
                className="w-full h-12 px-4 bg-neutral-50 border border-neutral-200 rounded-xl text-[15px] text-[#1d2022] placeholder:text-[#b1b5b8] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
              />
              <button
                onClick={handleUseCoupon}
                disabled={isUsing || !staffName.trim()}
                className="mt-3 w-full py-4 font-semibold text-base rounded-xl transition-colors bg-[#FFD541] hover:bg-[#FFCA00] active:bg-[#F5C400] disabled:bg-[#FFE88A] disabled:text-[#b1b5b8] text-[#1d2022] flex items-center justify-center gap-2"
              >
                {isUsing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  '쿠폰 사용 완료'
                )}
              </button>
            </div>
          )}

          {/* 쿠폰 코드 */}
          <p className="mt-6 text-center text-xs text-[#b1b5b8]">쿠폰 코드: {coupon.code}</p>
        </main>
      </div>

      <PretendardStyle />
    </div>
  );
}
