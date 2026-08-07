'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

function getFullImageUrl(imageUrl: string | null): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  return `${API_BASE}${imageUrl}`;
}

function LoadingSpinner() {
  return (
    <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col items-center justify-center bg-white gap-4">
        <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

interface Booth {
  id: string;
  nameKo: string;
  nameEn: string | null;
  categoryKo: string | null;
  categoryEn: string | null;
  imageUrl: string | null;
  available: boolean;
}

interface FoodCourtInfo {
  storeName: string;
  customerTitle: string;
  customerSubtitle: string;
  noticeText: string | null;
  noticeLogoUrl: string | null;
  tableNumber: string;
  stores: Booth[];
}

function FoodCourtContent() {
  const params = useParams();
  const slug = params.slug as string;
  const table = params.table as string;
  const apiUrl = API_BASE;

  const [info, setInfo] = useState<FoodCourtInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 탭한 즉시 해당 매장으로 이동한다. 이동 요청 중인 부스 id를 담아 로딩 표시/중복 탭 방지에 쓴다.
  const [redirectingId, setRedirectingId] = useState<string | null>(null);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/taghere/food-court/${slug}/${encodeURIComponent(table)}`);
        if (res.ok) {
          const data = await res.json();
          setInfo(data);
        } else if (res.status === 404) {
          const errorData = await res.json().catch(() => ({}));
          setError(errorData.error || '존재하지 않는 매장입니다.');
        } else {
          const errorData = await res.json().catch(() => ({}));
          setError(errorData.error || '정보를 불러오는데 실패했습니다.');
        }
      } catch (e) {
        console.error('Failed to fetch food court info:', e);
        setError('정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchInfo();
  }, [apiUrl, slug, table]);

  const handleSelectBooth = async (booth: Booth) => {
    if (!booth.available || redirectingId) return;

    setRedirectingId(booth.id);
    setRedirectError(null);

    try {
      const res = await fetch(
        `${apiUrl}/api/taghere/food-court/${slug}/${encodeURIComponent(table)}/redirect/${booth.id}`
      );
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setRedirectError(errorData.error || '주문 링크를 찾을 수 없습니다.');
        setRedirectingId(null);
      }
    } catch (e) {
      console.error('Failed to redirect:', e);
      setRedirectError('연결 중 오류가 발생했습니다.');
      setRedirectingId(null);
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
          <h1 className="text-lg font-semibold text-neutral-900 mb-2 text-center">{error}</h1>
        </div>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-[100dvh] bg-neutral-100 font-pretendard flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col bg-neutral-100 relative">
        {/* Scrollable content — 부스를 탭하면 바로 이동하므로 하단 CTA 없음 */}
        <div className="flex-1 overflow-y-auto px-5 pt-12 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Header */}
          <h1 className="text-[26px] leading-[1.3] font-bold text-[#1d2022] whitespace-pre-line mb-6">
            {info.customerTitle}
          </h1>

          {/* Notice banner */}
          {info.noticeText && (
            <div className="bg-[#1d2022] rounded-2xl p-5 mb-5">
              {info.noticeLogoUrl && (
                <div className="flex justify-center mb-4">
                  <img
                    src={getFullImageUrl(info.noticeLogoUrl)}
                    alt="logo"
                    className="h-9 object-contain"
                  />
                </div>
              )}
              <div className="bg-white rounded-xl px-4 py-3.5">
                <p className="text-[14px] leading-[1.6] text-[#1d2022] whitespace-pre-line">
                  {info.noticeText}
                </p>
              </div>
            </div>
          )}

          {/* Booth list */}
          <div className="space-y-3">
            {info.stores.map((booth) => {
              const isRedirecting = booth.id === redirectingId;
              // 이동 요청 중에는 다른 부스 탭을 막는다 (중복 요청·오이동 방지)
              const disabled = !booth.available || (!!redirectingId && !isRedirecting);
              return (
                <button
                  key={booth.id}
                  onClick={() => handleSelectBooth(booth)}
                  disabled={disabled || isRedirecting}
                  className={`w-full text-left bg-white rounded-2xl p-3 flex items-center gap-4 transition-all ${
                    isRedirecting ? 'ring-2 ring-[#1d2022]' : 'ring-1 ring-transparent'
                  } ${!booth.available || disabled ? 'opacity-40' : 'active:scale-[0.99]'}`}
                >
                  <div className="w-[88px] h-[88px] rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0 relative">
                    {booth.imageUrl ? (
                      <img
                        src={getFullImageUrl(booth.imageUrl)}
                        alt={booth.nameKo}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[24px] font-bold">
                        {booth.nameKo.charAt(0)}
                      </div>
                    )}
                    {isRedirecting && (
                      <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {(booth.categoryKo || booth.categoryEn) && (
                      <p className="text-[14px] text-[#b1b5b8] leading-[1.35] mb-1">
                        {booth.categoryKo}
                        {booth.categoryEn && (
                          <>
                            <br />
                            {booth.categoryEn}
                          </>
                        )}
                      </p>
                    )}
                    <p className="text-[19px] font-bold text-[#1d2022] leading-[1.3] truncate">
                      {booth.nameKo}
                    </p>
                    {booth.nameEn && (
                      <p className="text-[19px] font-bold text-[#1d2022] leading-[1.3] truncate">
                        {booth.nameEn}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

        </div>

        {/* 이동 실패 안내 — 목록 어디를 탭했든 보이도록 화면 하단에 고정 */}
        {redirectError && (
          <div className="fixed bottom-0 left-0 right-0 flex justify-center px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pointer-events-none">
            <p className="w-full max-w-[390px] text-center text-[14px] font-medium text-white bg-[#1d2022] rounded-xl px-4 py-3 shadow-lg">
              {redirectError}
            </p>
          </div>
        )}

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

export default function FoodCourtPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <FoodCourtContent />
    </Suspense>
  );
}
