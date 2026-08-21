import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

// enroll 계열 완료 페이지(order-success/stamp-success) 공용 배너 컴포넌트.

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  autoSlide: boolean;
  slideInterval: number;
  mediaType?: 'IMAGE' | 'VIDEO';
}

// 이미지 URL을 전체 경로로 변환
export function getFullImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  // 이미 전체 URL이면 그대로 반환
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  // 상대 경로면 API URL 붙이기
  return `${API_BASE}${imageUrl}`;
}

// 배너 미디어 렌더링 컴포넌트
export function BannerMedia({ banner, onClick }: { banner: Banner; onClick: () => void }) {
  const isVideo = banner.mediaType === 'VIDEO';
  const mediaUrl = getFullImageUrl(banner.imageUrl);

  if (isVideo) {
    return (
      <div
        className="w-full flex-shrink-0 cursor-pointer"
        onClick={onClick}
      >
        <video
          src={mediaUrl}
          className="w-full aspect-[2/1] object-cover rounded-[12px]"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </div>
    );
  }

  return (
    <div
      className="w-full flex-shrink-0 cursor-pointer"
      onClick={onClick}
    >
      <img
        src={mediaUrl}
        alt={banner.title}
        className="w-full aspect-[2/1] object-cover rounded-[12px]"
      />
    </div>
  );
}

// 인라인 배너 캐러셀 컴포넌트
export function InlineBannerCarousel({ banners }: { banners: Banner[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // 자동 슬라이드 - 영상인 경우 자동 슬라이드 비활성화
  useEffect(() => {
    if (banners.length <= 1) return;

    const currentBanner = banners[currentIndex];
    // 영상 배너는 자동 슬라이드 하지 않음
    if (!currentBanner?.autoSlide || currentBanner.mediaType === 'VIDEO') return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, currentBanner.slideInterval || 3000);

    return () => clearInterval(interval);
  }, [banners, currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;

    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 30;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }

    setTouchStartX(null);
    setTouchEndX(null);
  };

  const handleBannerClick = (banner: Banner) => {
    trackEvent('banner_click', { banner_id: banner.id, link_url: banner.linkUrl ?? null });
    if (banner.linkUrl) {
      window.open(banner.linkUrl, '_blank');
    }
  };

  if (banners.length === 0) return null;

  return (
    <div className="mt-4">
      <div
        className="relative overflow-hidden rounded-[12px]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {banners.map((banner) => (
            <BannerMedia
              key={banner.id}
              banner={banner}
              onClick={() => handleBannerClick(banner)}
            />
          ))}
        </div>

        {/* Indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
            {banners.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 바텀 모달 컴포넌트 — 헤드라인/서브 문구는 페이지별로 다르므로 title/subtitle로 전달한다.
export function BottomModal({
  isOpen,
  onClose,
  banners,
  title,
  subtitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  banners: Banner[];
  title: ReactNode;
  subtitle: ReactNode;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // 자동 슬라이드 - 영상인 경우 자동 슬라이드 비활성화
  useEffect(() => {
    if (!isOpen || banners.length <= 1) return;

    const currentBanner = banners[currentIndex];
    // 영상 배너는 자동 슬라이드 하지 않음
    if (!currentBanner?.autoSlide || currentBanner.mediaType === 'VIDEO') return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, currentBanner.slideInterval || 3000);

    return () => clearInterval(interval);
  }, [isOpen, banners, currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;

    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 30; // 더 민감하게

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // 왼쪽으로 스와이프 -> 다음
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else {
        // 오른쪽으로 스와이프 -> 이전
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }

    setTouchStartX(null);
    setTouchEndX(null);
  };

  const handleBannerClick = (banner: Banner) => {
    trackEvent('banner_click', { banner_id: banner.id, link_url: banner.linkUrl ?? null });
    if (banner.linkUrl) {
      window.open(banner.linkUrl, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div className="w-full max-w-md bg-white rounded-t-[10px] overflow-hidden animate-slide-up">
          {/* Handle */}
          <div className="flex justify-center pt-2 pb-4">
            <div className="w-10 h-1 bg-[#f2f3f4] rounded-full" />
          </div>

          {/* Content */}
          <div className="px-5 pb-4 text-center">
            <h2 className="text-xl font-bold text-black leading-[1.3] tracking-[-0.08px]">
              {title}
            </h2>
            <p className="text-base text-[#91949a] mt-2 leading-[1.5]">
              {subtitle}
            </p>
          </div>

          {/* Banner Carousel */}
          {banners.length > 0 && (
            <div className="px-5 pt-5">
              <div
                className="relative overflow-hidden rounded-[12px]"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div
                  className="flex transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                >
                  {banners.map((banner) => (
                    <BannerMedia
                      key={banner.id}
                      banner={banner}
                      onClick={() => handleBannerClick(banner)}
                    />
                  ))}
                </div>

                {/* Indicators */}
                {banners.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
                    {banners.map((_, index) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentIndex(index);
                        }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          index === currentIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Button */}
          <div className="px-5 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
            <button
              onClick={onClose}
              className="w-full py-4 bg-[#ffd541] text-[#030404] font-semibold text-base rounded-[10px] leading-[1.3]"
            >
              확인했어요
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
