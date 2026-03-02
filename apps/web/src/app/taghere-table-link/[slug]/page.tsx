'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

function LoadingSpinner() {
  return (
    <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col items-center justify-center bg-white gap-4">
        <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

interface StoreInfo {
  storeName: string;
  customerTitle: string | null;
  customerSubtitle: string | null;
  tableNumbers: string[];
}

function TableLinkContent() {
  const params = useParams();
  const slug = params.slug as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStoreInfo = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/taghere/table-link/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setStoreInfo(data);
        } else if (res.status === 404) {
          setError('존재하지 않는 매장입니다.');
        } else {
          const errorData = await res.json().catch(() => ({}));
          setError(errorData.error || '정보를 불러오는데 실패했습니다.');
        }
      } catch (e) {
        console.error('Failed to fetch store info:', e);
        setError('정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchStoreInfo();
  }, [apiUrl, slug]);

  const handleKeyPress = (key: string) => {
    setRedirectError(null);
    if (key === 'C') {
      setTableNumber('');
    } else if (key === 'back') {
      setTableNumber(prev => prev.slice(0, -1));
    } else {
      if (tableNumber.length < 3) {
        setTableNumber(prev => prev + key);
      }
    }
  };

  const handleConfirm = async () => {
    if (!tableNumber) return;

    setIsRedirecting(true);
    setRedirectError(null);

    try {
      const res = await fetch(`${apiUrl}/api/taghere/table-link/${slug}/redirect/${tableNumber}`);
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setRedirectError(errorData.error || '테이블을 찾을 수 없습니다.');
        setIsRedirecting(false);
      }
    } catch (e) {
      console.error('Failed to redirect:', e);
      setRedirectError('연결 중 오류가 발생했습니다.');
      setIsRedirecting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-full flex flex-col items-center justify-center bg-white p-6">
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">{error}</h1>
        </div>
      </div>
    );
  }

  if (!storeInfo) return null;

  const title = storeInfo.customerTitle || `${storeInfo.storeName} 모바일 주문`;
  const subtitle = storeInfo.customerSubtitle || '테이블 번호를 입력해주세요';

  return (
    <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col bg-white relative">
        {/* Top section - Store name & instructions */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 pt-8">
          <p className="text-[13px] text-[#55595e] mb-1">{storeInfo.storeName}</p>
          <h1 className="text-[22px] font-bold text-[#1d2022] mb-1 text-center">{title}</h1>
          <p className="text-[14px] text-[#55595e]">{subtitle}</p>

          {/* Table number display */}
          <div className="mt-8 mb-4 w-full max-w-[280px]">
            <div className="bg-[#f8f9fa] rounded-2xl py-6 px-4 flex items-center justify-center min-h-[80px]">
              {tableNumber ? (
                <span className="text-[48px] font-bold text-[#1d2022] tracking-[8px]">
                  {tableNumber}
                </span>
              ) : (
                <span className="text-[32px] font-medium text-[#b1b5b8]">-</span>
              )}
            </div>
            {redirectError && (
              <p className="text-center text-[13px] text-[#ff6b6b] mt-2">{redirectError}</p>
            )}
          </div>
        </div>

        {/* Bottom section - Keypad & Confirm */}
        <div className="px-5 pb-8">
          {/* Numeric keypad */}
          <div className="grid grid-cols-3 gap-2 mb-4 max-w-[320px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'].map((key) => (
              <button
                key={key}
                onClick={() => handleKeyPress(key)}
                disabled={isRedirecting}
                className={`
                  h-[56px] rounded-xl text-[20px] font-semibold transition-colors
                  ${key === 'C'
                    ? 'bg-[#f0f0f0] text-[#55595e] hover:bg-[#e5e5e5] text-[16px]'
                    : key === 'back'
                    ? 'bg-[#f0f0f0] text-[#55595e] hover:bg-[#e5e5e5]'
                    : 'bg-[#f8f9fa] text-[#1d2022] hover:bg-[#f0f0f0] active:bg-[#e5e5e5]'
                  }
                  disabled:opacity-50
                `}
              >
                {key === 'back' ? (
                  <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l-7-7 7-7M19 12H5" />
                  </svg>
                ) : (
                  key
                )}
              </button>
            ))}
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            disabled={!tableNumber || isRedirecting}
            className="w-full py-4 font-semibold text-[16px] rounded-xl transition-colors bg-[#FFD541] hover:bg-[#FFCA00] active:bg-[#F5C400] disabled:bg-[#FFE88A] disabled:text-[#b1b5b8] text-[#1d2022]"
          >
            {isRedirecting ? '이동 중...' : '확인'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');
        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;
        }
      `}</style>
    </div>
  );
}

export default function TableLinkPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TableLinkContent />
    </Suspense>
  );
}
