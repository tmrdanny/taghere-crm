'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  autoSlide: boolean;
  slideInterval: number;
  mediaType?: 'IMAGE' | 'VIDEO';
}

function getFullImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  return `${apiUrl}${imageUrl}`;
}

function BannerMedia({ banner, onClick }: { banner: Banner; onClick: () => void }) {
  const isVideo = banner.mediaType === 'VIDEO';
  const mediaUrl = getFullImageUrl(banner.imageUrl);

  if (isVideo) {
    return (
      <div className="w-full flex-shrink-0 cursor-pointer" onClick={onClick}>
        <video
          src={mediaUrl}
          className="w-full aspect-[2/1] object-cover rounded-[12px]"
          autoPlay muted loop playsInline preload="auto"
        />
      </div>
    );
  }

  return (
    <div className="w-full flex-shrink-0 cursor-pointer" onClick={onClick}>
      <img src={mediaUrl} alt={banner.title} className="w-full aspect-[2/1] object-cover rounded-[12px]" />
    </div>
  );
}

function InlineBannerCarousel({ banners }: { banners: Banner[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const currentBanner = banners[currentIndex];
    if (!currentBanner?.autoSlide || currentBanner.mediaType === 'VIDEO') return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, currentBanner.slideInterval || 3000);
    return () => clearInterval(interval);
  }, [banners, currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => { setTouchEndX(null); setTouchStartX(e.touches[0].clientX); };
  const handleTouchMove = (e: React.TouchEvent) => { setTouchEndX(e.touches[0].clientX); };
  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    if (Math.abs(distance) > 30) {
      setCurrentIndex((prev) => distance > 0 ? (prev + 1) % banners.length : (prev - 1 + banners.length) % banners.length);
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  if (banners.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-[12px]" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {banners.map((banner) => (
            <BannerMedia key={banner.id} banner={banner} onClick={() => banner.linkUrl && window.open(banner.linkUrl, '_blank')} />
          ))}
        </div>
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
            {banners.map((_, index) => (
              <button key={index} onClick={(e) => { e.stopPropagation(); setCurrentIndex(index); }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${index === currentIndex ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RewardPopupModal({ reward, tier, onClose }: { reward: string; tier: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
        {/* Gift Box Image */}
        <div className="w-20 h-20 flex items-center justify-center mx-auto mb-4">
          <img src="/images/gold-box.webp" alt="보상 상자" className="w-full h-full object-contain" />
        </div>

        <h2 className="text-lg font-bold text-[#1d2022] mb-1">
          축하합니다!
        </h2>
        <p className="text-sm text-[#91949a] mb-4">
          {tier}개 달성 보상
        </p>

        {/* Reward Card */}
        <div className="bg-[#FFF4D6] rounded-xl px-4 py-3 mb-4">
          <p className="text-base font-bold text-[#1d2022]">{reward}</p>
        </div>

        <p className="text-sm text-[#55595e] mb-5">
          직원에게 현재 화면을 보여주세요.
        </p>

        <button
          onClick={onClose}
          className="w-full py-3.5 bg-[#FFD541] text-[#1d2022] font-semibold text-base rounded-xl"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// 바텀 모달 컴포넌트
function BottomModal({
  isOpen,
  onClose,
  banners,
}: {
  isOpen: boolean;
  onClose: () => void;
  banners: Banner[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || banners.length <= 1) return;
    const currentBanner = banners[currentIndex];
    if (!currentBanner?.autoSlide || currentBanner.mediaType === 'VIDEO') return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, currentBanner.slideInterval || 3000);
    return () => clearInterval(interval);
  }, [isOpen, banners, currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => { setTouchEndX(null); setTouchStartX(e.touches[0].clientX); };
  const handleTouchMove = (e: React.TouchEvent) => { setTouchEndX(e.touches[0].clientX); };
  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    if (Math.abs(distance) > 30) {
      setCurrentIndex((prev) => distance > 0 ? (prev + 1) % banners.length : (prev - 1 + banners.length) % banners.length);
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
        <div className="w-full max-w-md bg-white rounded-t-[10px] overflow-hidden animate-slide-up">
          <div className="flex justify-center pt-2 pb-4">
            <div className="w-10 h-1 bg-[#f2f3f4] rounded-full" />
          </div>
          <div className="px-5 pb-4 text-center">
            <h2 className="text-xl font-bold text-black leading-[1.3] tracking-[-0.08px]">
              스탬프가 적립되었어요
            </h2>
            <p className="text-base text-[#91949a] mt-2 leading-[1.5]">
              매장을 이용해주셔서 감사합니다
            </p>
          </div>
          {banners.length > 0 && (
            <div className="px-5 pt-5">
              <div className="relative overflow-hidden rounded-[12px]" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
                  {banners.map((banner) => (
                    <BannerMedia key={banner.id} banner={banner} onClick={() => banner.linkUrl && window.open(banner.linkUrl, '_blank')} />
                  ))}
                </div>
                {banners.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
                    {banners.map((_, index) => (
                      <button key={index} onClick={(e) => { e.stopPropagation(); setCurrentIndex(index); }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${index === currentIndex ? 'bg-white' : 'bg-white/50'}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="px-5 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
            <button onClick={onClose} className="w-full py-4 bg-[#ffd541] text-[#030404] font-semibold text-base rounded-[10px] leading-[1.3]">
              확인했어요
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

function StampSuccessContent() {
  const searchParams = useSearchParams();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [showRewardPopup, setShowRewardPopup] = useState(false);
  const [showBottomModal, setShowBottomModal] = useState(false);

  const slug = searchParams.get('slug') || '';
  const stamps = parseInt(searchParams.get('stamps') || '0');
  const storeName = searchParams.get('storeName') || '';
  const rawOrderId = searchParams.get('ordersheetId') || searchParams.get('orderId');
  const ordersheetId = rawOrderId && /^\{.+\}$/.test(rawOrderId) ? null : rawOrderId;
  const hasOrder = Boolean(ordersheetId);

  // 당첨 보상 정보
  const drawnReward = searchParams.get('drawnReward') || '';
  const drawnRewardTier = parseInt(searchParams.get('drawnRewardTier') || '0');
  const franchiseName = searchParams.get('franchiseName') || '';

  // URL 파라미터에서 모든 rewardN 패턴 동적 파싱 (1~50 지원)
  const rewardList: { count: number; desc: string; isRandom: boolean }[] = [];
  searchParams.forEach((value, key) => {
    const match = key.match(/^reward(\d+)$/);
    if (match && !key.endsWith('Random')) {
      const n = parseInt(match[1]);
      if (n >= 1 && n <= 50 && value) {
        rewardList.push({
          count: n,
          desc: value,
          isRandom: searchParams.get(`reward${n}Random`) === 'true',
        });
      }
    }
  });
  rewardList.sort((a, b) => a.count - b.count);

  // stamps can exceed 10; show modulo position within current card of 10
  const displayStamps = stamps % 10 || (stamps > 0 && stamps % 10 === 0 ? 10 : 0);

  const [menuLink, setMenuLink] = useState<string | null>(null);

  // 보상 당첨 시 팝업 자동 표시
  useEffect(() => {
    if (drawnReward && drawnRewardTier > 0) {
      setShowRewardPopup(true);
    }
  }, [drawnReward, drawnRewardTier]);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/admin/banners/active?slug=${slug}`);
        if (res.ok) {
          const data = await res.json();
          setBanners(data);
          if (data.length > 0) setShowBottomModal(true);
        }
      } catch (e) {
        console.error('Failed to fetch banners:', e);
      }
    };
    if (slug) fetchBanners();
  }, [slug]);

  // ordersheetId가 있으면 메뉴판 링크 조회
  useEffect(() => {
    if (!ordersheetId || !slug) return;
    const fetchMenuLink = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);
        if (res.ok) {
          const data = await res.json();
          if (data.menuLink) setMenuLink(data.menuLink);
        }
      } catch (e) {
        console.error('Failed to fetch menu link:', e);
      }
    };
    fetchMenuLink();
  }, [ordersheetId, slug]);

  const handleConfirm = () => {
    if (hasOrder && menuLink) {
      // ordersheetId 있고 메뉴링크 있으면 메뉴판으로
      window.location.href = menuLink;
    } else if (hasOrder) {
      // ordersheetId 있지만 메뉴링크 없으면 뒤로가기
      window.history.back();
    } else {
      // ordersheetId 없으면 스탬프 적립 초기 화면으로
      window.location.href = `/taghere-enroll-stamp/${slug}`;
    }
  };

  return (
    <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col relative">
        {/* Header */}
        <div className="flex-shrink-0 h-[54px] border-b border-[#ebeced] flex items-center justify-center">
          <span className="text-lg font-bold text-[#1d2022]">스탬프 적립 완료</span>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-24">
          {/* Success Icon & Message */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#61EB49] flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#1d2022] mt-4 tracking-tight">
              {franchiseName ? `${franchiseName} 통합 스탬프 적립 완료` : '스탬프가 적립되었어요'}
            </h1>
            {storeName && (
              <p className="text-sm text-[#91949a] mt-1">{storeName}</p>
            )}
          </div>

          {/* Stamp Grid Card */}
          <div className="bg-[#f8f9fa] rounded-[12px] p-5 mb-4">
            <div className="grid grid-cols-5 gap-3 mb-4">
              {Array.from({ length: 10 }, (_, i) => {
                const num = i + 1;
                const isFilled = num <= displayStamps;
                const isMilestone = num === 5 || num === 10;

                return (
                  <div key={num} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isFilled
                          ? 'bg-[#FFD541] shadow-sm'
                          : 'border-2 border-[#d1d5db] bg-white'
                        }`}
                    >
                      {isFilled ? (
                        <svg className="w-5 h-5 text-[#1d2022]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-sm font-medium text-[#b1b5b8]">{num}</span>
                      )}
                    </div>
                    {isMilestone && (
                      <span className="text-[10px] font-semibold text-[#FFB800]">
                        {num === 5 ? '보상' : '보상'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-center">
              <p className="text-base text-[#55595e]">
                현재 <span className="font-bold text-[#1d2022]">{stamps}개</span> 적립
              </p>
            </div>
          </div>

          {/* Reward Info Card */}
          {rewardList.length > 0 && (
            <div className="rounded-[10px] border border-[#ebeced] overflow-hidden mb-4">
              {rewardList.map((reward, idx) => (
                <div
                  key={reward.count}
                  className={`px-5 py-4 flex items-center gap-3 ${idx < rewardList.length - 1 ? 'border-b border-[#ebeced]' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#FFF4D6] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold">{reward.count}</span>
                  </div>
                  <div>
                    <p className="text-xs text-[#b1b5b8] font-medium">{reward.count}개 달성 보상</p>
                    <p className="text-sm font-semibold text-[#1d2022]">
                      {reward.isRandom ? '랜덤 박스!' : reward.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Banner Carousel */}
          <InlineBannerCarousel banners={banners} />
        </div>

        {/* Bottom CTA */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#d1d3d6] px-5 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
          <button
            onClick={handleConfirm}
            className="w-full py-4 bg-[#FFD541] text-[#1d2022] font-semibold text-base rounded-[10px]"
          >
            {hasOrder ? '메뉴판 돌아가기' : '확인'}
          </button>
        </div>
      </div>

      {/* Reward Popup Modal */}
      {showRewardPopup && drawnReward && (
        <RewardPopupModal
          reward={drawnReward}
          tier={drawnRewardTier}
          onClose={() => setShowRewardPopup(false)}
        />
      )}

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');
        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>

      {/* 바텀 모달 배너 */}
      <BottomModal
        isOpen={showBottomModal}
        onClose={() => setShowBottomModal(false)}
        banners={banners}
      />
    </div>
  );
}

export default function StampSuccessPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-white flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <StampSuccessContent />
    </Suspense>
  );
}
