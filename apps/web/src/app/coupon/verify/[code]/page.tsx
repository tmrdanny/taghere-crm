'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Ticket, Store, Calendar, AlertCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto" />
          <p className="mt-3 text-neutral-500 text-sm">쿠폰 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-neutral-900">쿠폰 오류</h1>
          <p className="mt-2 text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }

  // 쿠폰이 없는 경우
  if (!coupon) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-neutral-400" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-neutral-900">쿠폰을 찾을 수 없습니다</h1>
        </div>
      </div>
    );
  }

  const isUsed = coupon.isUsed;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-neutral-900 text-center">쿠폰 확인</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto p-4">
        {/* 상태 표시 */}
        <div className={`rounded-2xl p-6 mb-4 ${isUsed ? 'bg-neutral-100' : 'bg-emerald-50'}`}>
          <div className="flex items-center justify-center mb-3">
            {isUsed ? (
              <div className="w-14 h-14 bg-neutral-200 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-neutral-500" />
              </div>
            ) : (
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <Ticket className="w-7 h-7 text-emerald-600" />
              </div>
            )}
          </div>
          <h2 className={`text-center text-xl font-bold ${isUsed ? 'text-neutral-500' : 'text-emerald-700'}`}>
            {isUsed ? '사용 완료된 쿠폰' : '사용 가능한 쿠폰'}
          </h2>
          {isUsed && coupon.usedAt && (
            <p className="text-center text-sm text-neutral-500 mt-1">
              {new Date(coupon.usedAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {coupon.usedBy && ` (${coupon.usedBy})`}
            </p>
          )}
        </div>

        {/* 쿠폰 정보 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 매장명 */}
          <div className="p-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                <Store className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">매장</p>
                <p className="font-semibold text-neutral-900">{coupon.storeName}</p>
              </div>
            </div>
          </div>

          {/* 쿠폰 내용 */}
          <div className="p-4 border-b border-neutral-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Ticket className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">쿠폰 내용</p>
                <p className="font-semibold text-neutral-900">{coupon.couponContent}</p>
              </div>
            </div>
          </div>

          {/* 유효기간 */}
          <div className="p-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">유효기간</p>
                <p className="font-semibold text-neutral-900">{coupon.expiryDate}</p>
              </div>
            </div>
          </div>

          {/* 고객 전화번호 */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-neutral-500">고객 연락처</p>
                <p className="font-semibold text-neutral-900">{coupon.phone}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 사용 처리 영역 */}
        {!isUsed && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              직원명 입력
            </label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="직원 이름을 입력하세요"
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <button
              onClick={handleUseCoupon}
              disabled={isUsing || !staffName.trim()}
              className="mt-3 w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
        <div className="mt-4 text-center">
          <p className="text-xs text-neutral-400">쿠폰 코드: {coupon.code}</p>
        </div>
      </div>
    </div>
  );
}
