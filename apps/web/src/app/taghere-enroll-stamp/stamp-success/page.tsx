'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { InlineBannerCarousel, BottomModal, type Banner } from '@/features/enroll/banners';
import { RewardPopupModal } from '@/features/enroll/RewardPopupModal';

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

  // 후불 주문 지연 적립 — 아직 적립 전이라 "결제 완료 후 반영" 안내로 바꾼다.
  const deferred = searchParams.get('deferred') === '1';

  // 당첨 보상 정보
  const drawnReward = searchParams.get('drawnReward') || '';
  const drawnRewardTier = parseInt(searchParams.get('drawnRewardTier') || '0');
  const urlFranchiseName = searchParams.get('franchiseName') || '';

  // URL 파라미터에서 모든 rewardN 패턴 동적 파싱 (1~50 지원)
  const urlRewardList: { count: number; desc: string; isRandom: boolean }[] = [];
  searchParams.forEach((value, key) => {
    const match = key.match(/^reward(\d+)$/);
    if (match && !key.endsWith('Random')) {
      const n = parseInt(match[1]);
      if (n >= 1 && n <= 50 && value) {
        urlRewardList.push({
          count: n,
          desc: value,
          isRandom: searchParams.get(`reward${n}Random`) === 'true',
        });
      }
    }
  });
  urlRewardList.sort((a, b) => a.count - b.count);

  // URL 파라미터가 유실되어도 보상이 항상 표시되도록 서버에서 스탬프 설정 조회 (서버가 원천 데이터)
  const [fetchedRewards, setFetchedRewards] = useState<{ count: number; desc: string; isRandom: boolean }[] | null>(null);
  const [fetchedFranchiseName, setFetchedFranchiseName] = useState('');

  useEffect(() => {
    if (!slug) return;
    const fetchStampInfo = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/taghere/stamp-info/${slug}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.rewards) && data.rewards.length > 0) {
          const list = data.rewards
            .map((r: any) => ({
              count: r.tier,
              desc: r.description || '',
              isRandom: !!(r.options && Array.isArray(r.options) && r.options.length > 1),
            }))
            .sort((a: any, b: any) => a.count - b.count);
          setFetchedRewards(list);
        }
        if (data.franchiseName) setFetchedFranchiseName(data.franchiseName);
      } catch (e) {
        console.error('Failed to fetch stamp info:', e);
      }
    };
    fetchStampInfo();
  }, [slug]);

  const rewardList = fetchedRewards && fetchedRewards.length > 0 ? fetchedRewards : urlRewardList;
  const franchiseName = urlFranchiseName || fetchedFranchiseName;

  // 스탬프 판 크기 = 최종 보상 티어 (보상 정보가 없으면 기존처럼 10칸)
  const maxTier = rewardList.length > 0 ? Math.max(...rewardList.map(r => r.count)) : 10;

  // stamps can exceed maxTier; show modulo position within current card
  const displayStamps = stamps % maxTier || (stamps > 0 && stamps % maxTier === 0 ? maxTier : 0);

  // 칸 수에 따라 줄이 고르게 나뉘는 열 수 선택 (Tailwind 정적 클래스 필요)
  const gridColsClass = (() => {
    if (maxTier <= 5) {
      return ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][maxTier - 1];
    }
    if (maxTier % 5 === 0) return 'grid-cols-5';
    if (maxTier % 4 === 0) return 'grid-cols-4';
    if (maxTier === 6) return 'grid-cols-3';
    if (maxTier === 7) return 'grid-cols-4';
    return 'grid-cols-5';
  })();

  const [menuLink, setMenuLink] = useState<string | null>(null);

  // 보상 당첨 시 팝업 자동 표시
  useEffect(() => {
    if (drawnReward && drawnRewardTier > 0) {
      setShowRewardPopup(true);
      trackEvent('reward_popup_show', { store_slug: slug, reward_tier: drawnRewardTier });
    }
  }, [drawnReward, drawnRewardTier]);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/banners/active?slug=${slug}`);
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
        const res = await fetch(`${API_BASE}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);
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
    trackEvent('completion_cta_click', { store_slug: slug, flow_type: 'stamp', has_menu_link: !!menuLink });
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
          <span className="text-lg font-bold text-[#1d2022]">{deferred ? '스탬프 적립 예약 완료' : '스탬프 적립 완료'}</span>
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
              {deferred
                ? '결제 완료 후 스탬프가 적립돼요'
                : (franchiseName ? `${franchiseName} 통합 스탬프 적립 완료` : '스탬프가 적립되었어요')}
            </h1>
            {storeName && (
              <p className="text-sm text-[#91949a] mt-1">{storeName}</p>
            )}
          </div>

          {/* 지연 적립 안내 — 아래 스탬프 판은 아직 반영 전 잔액이다. */}
          {deferred && (
            <p className="text-sm text-[#55595e] text-center bg-[#FFF4D6] rounded-[10px] px-4 py-3 mb-4">
              결제가 끝나면 자동으로 적립되고, 알림톡으로 알려드려요.
            </p>
          )}

          {/* Stamp Grid Card */}
          <div className="bg-[#f8f9fa] rounded-[12px] p-5 mb-4">
            <div className={`grid ${gridColsClass} gap-3 mb-4`}>
              {Array.from({ length: maxTier }, (_, i) => {
                const num = i + 1;
                const isFilled = num <= displayStamps;
                const hasReward = rewardList.some(r => r.count === num);

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
                    {hasReward && (
                      <span className="text-[10px] font-semibold text-[#FFB800]">보상</span>
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
          cardClassName="bg-[#FFF4D6] rounded-xl px-4 py-3 mb-4"
          buttonClassName="w-full py-3.5 bg-[#FFD541] text-[#1d2022] font-semibold text-base rounded-xl"
        />
      )}

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');
        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>

      {/* 바텀 모달 배너 — 후불 지연 적립(deferred)이면 아직 적립 전이므로 "적립 완료" 문구를 쓰면 안 된다. */}
      <BottomModal
        isOpen={showBottomModal}
        onClose={() => setShowBottomModal(false)}
        banners={banners}
        title={deferred ? '결제 완료 후 스탬프가 자동 적립돼요' : '스탬프가 적립되었어요'}
        subtitle={deferred ? '적립되면 알림톡으로 알려드릴게요' : '매장을 이용해주셔서 감사합니다'}
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
