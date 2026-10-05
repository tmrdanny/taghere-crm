'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  consumeTokenFromHash,
  currentToken,
  customerFetch,
  CustomerAuthError,
  loginErrorMessage,
  logoutCustomer,
  startKakaoLogin,
  startNaverLogin,
  takePendingWithdraw,
} from './_lib/customer-session';
import StoreMap, { CATEGORY_LABELS, benefitLabel } from './_components/StoreMap';
import MyInfo from './_components/MyInfo';

// ─── 타입 ───────────────────────────────────

interface StampReward {
  tier: number;
  description: string;
  isRandom: boolean;
}

interface NextReward {
  tier: number;
  description: string;
  remaining: number;
}

interface HistoryEntry {
  id: string;
  type: string;
  delta: number;
  balance: number;
  reason?: string | null;
  drawnReward?: string | null;
  drawnRewardTier?: number | null;
  storeName?: string;
  createdAt: string;
}

interface Coupon {
  id: string;
  code: string;
  couponContent: string;
  expiryDate: string;
}

interface StoreData {
  storeId: string;
  storeName: string;
  category: string | null;
  address: string | null;
  enrollmentMode: string;
  pointRatePercent: number;
  naverPlaceUrl: string | null;
  franchiseName: string | null;
  totalPoints: number | null;
  pointSource: 'CRM' | 'METACITY' | 'METACITY_UNAVAILABLE';
  totalStamps: number | null;
  stampManagedByFranchise: boolean;
  visitCount: number;
  lastVisitAt: string | null;
  stampEnabled: boolean;
  stampRewards: StampReward[];
  nextReward: NextReward | null;
  coupons: Coupon[];
  recentPointHistory: HistoryEntry[];
  recentStampHistory: HistoryEntry[];
}

interface StoreBreakdown {
  storeId: string;
  storeName: string;
  stamps: number;
}

interface FranchiseData {
  franchiseId: string;
  franchiseName: string;
  totalStamps: number;
  totalPoints: number;
  visitCount: number;
  lastVisitAt: string | null;
  selfClaimEnabled: boolean;
  stampRewards: StampReward[];
  nextReward: NextReward | null;
  storeBreakdown: StoreBreakdown[];
  recentStampHistory: HistoryEntry[];
  recentPointHistory: HistoryEntry[];
}

interface MyPageData {
  customer: { name: string | null; phone: string | null; provider: 'kakao' | 'naver'; hasPhone: boolean };
  franchises: FranchiseData[];
  stores: StoreData[];
}

type Tab = 'wallet' | 'map' | 'info';

// ─── 유틸 ───────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    EARN: '적립',
    USE: '사용',
    USE_5: '5개 보상 사용',
    USE_10: '10개 보상 사용',
    USE_15: '15개 보상 사용',
    USE_20: '20개 보상 사용',
    USE_25: '25개 보상 사용',
    USE_30: '30개 보상 사용',
    ADMIN_ADD: '관리자 추가',
    ADMIN_REMOVE: '관리자 차감',
    MANUAL_EARN: '수동 적립',
  };
  return map[type] || type;
}

// ─── 스탬프 그리드 컴포넌트 ─────────────────

function StampGrid({ totalStamps, rewards }: { totalStamps: number; rewards: StampReward[] }) {
  // 최대 보상 tier 기준으로 그리드 크기 결정
  const maxTier = rewards.length > 0
    ? Math.max(...rewards.map(r => r.tier))
    : 10;
  const gridSize = Math.max(10, maxTier);
  const displayStamps = Math.min(totalStamps, gridSize);

  // 5열 그리드로 표시 (최대 50개까지)
  const displayCount = Math.min(gridSize, 50);
  const rewardTiers = new Set(rewards.map(r => r.tier));

  return (
    <div className="bg-[#f8f9fa] rounded-[12px] p-5">
      <div className="grid grid-cols-5 gap-2.5 mb-4">
        {Array.from({ length: displayCount }, (_, i) => {
          const num = i + 1;
          const isFilled = num <= displayStamps;
          const isMilestone = rewardTiers.has(num);

          return (
            <div key={num} className="flex flex-col items-center gap-0.5">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isFilled
                    ? 'bg-[#FFD541] shadow-sm'
                    : 'border-2 border-[#d1d5db] bg-white'
                }`}
              >
                {isFilled ? (
                  <svg className="w-4.5 h-4.5 text-[#1d2022]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xs font-medium text-[#b1b5b8]">{num}</span>
                )}
              </div>
              {isMilestone && (
                <span className="text-[9px] font-semibold text-[#FFB800]">
                  보상
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center">
        <p className="text-sm text-[#55595e]">
          현재 <span className="font-bold text-[#1d2022]">{totalStamps}개</span> 적립
        </p>
      </div>
    </div>
  );
}

// ─── 보상 목록 컴포넌트 ─────────────────────

function RewardList({
  rewards,
  totalStamps,
  selfClaimEnabled,
  claimingTier,
  onClaim,
}: {
  rewards: StampReward[];
  totalStamps?: number;
  selfClaimEnabled?: boolean;
  claimingTier?: number | null;
  onClaim?: (tier: number, description: string) => void;
}) {
  if (rewards.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-[#ebeced] overflow-hidden">
      {rewards.map((reward, idx) => {
        const canClaim = selfClaimEnabled && totalStamps != null && totalStamps >= reward.tier;
        const isClaiming = claimingTier === reward.tier;

        return (
          <div
            key={reward.tier}
            className={`px-4 py-3 flex items-center gap-3 ${
              idx < rewards.length - 1 ? 'border-b border-[#ebeced]' : ''
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-[#FFF4D6] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">{reward.tier}</span>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-[#b1b5b8] font-medium">{reward.tier}개 달성 보상</p>
              <p className="text-sm font-semibold text-[#1d2022]">
                {reward.isRandom ? '랜덤 보상' : reward.description}
              </p>
            </div>
            {selfClaimEnabled && onClaim && (
              <button
                onClick={() => canClaim && onClaim(reward.tier, reward.description)}
                disabled={!canClaim || !!claimingTier}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  canClaim && !claimingTier
                    ? 'bg-[#FFD541] text-[#1d2022] active:scale-95'
                    : 'bg-[#f0f1f2] text-[#b1b5b8] cursor-not-allowed'
                }`}
              >
                {isClaiming ? '처리중...' : canClaim ? '신청' : `${reward.tier}개 필요`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 접이식 내역 컴포넌트 ───────────────────

function CollapsibleHistory({
  title,
  entries,
  showStoreName,
}: {
  title: string;
  entries: HistoryEntry[];
  showStoreName?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-sm text-[#55595e]"
      >
        <span className="font-medium">{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="space-y-0">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between py-2 border-b border-[#f0f1f2] last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#91949a]">{formatDate(entry.createdAt)}</span>
                  {showStoreName && entry.storeName && (
                    <span className="text-xs text-[#b1b5b8]">{entry.storeName}</span>
                  )}
                </div>
                <p className="text-sm text-[#1d2022]">
                  {typeLabel(entry.type)}
                  {entry.drawnReward && (
                    <span className="text-[#FFB800] ml-1">({entry.drawnReward})</span>
                  )}
                  {entry.reason && (
                    <span className="text-[#91949a] ml-1 text-xs">· {entry.reason}</span>
                  )}
                </p>
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${
                entry.delta > 0 ? 'text-[#2563eb]' : 'text-[#ef4444]'
              }`}>
                {entry.delta > 0 ? '+' : ''}{entry.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 다음 보상 안내 ─────────────────────────

function NextRewardBanner({ next }: { next: NextReward | null }) {
  if (!next) return null;
  return (
    <div className="bg-[#FFF8E1] rounded-[10px] px-4 py-2.5">
      <p className="text-sm text-[#1d2022]">
        <span className="font-bold">{next.remaining}개</span> 더 모으면 <span className="font-bold">{next.description}</span>
      </p>
    </div>
  );
}

// ─── 프랜차이즈 섹션 ────────────────────────

function FranchiseSection({
  franchise,
  onStampsUpdated,
  onAuthExpired,
}: {
  franchise: FranchiseData;
  onStampsUpdated: (franchiseId: string, newStamps: number) => void;
  onAuthExpired: () => void;
}) {
  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ tier: number; description: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClaimRequest = (tier: number, description: string) => {
    setConfirmModal({ tier, description });
  };

  const handleConfirmClaim = async () => {
    if (!confirmModal) return;
    const { tier, description } = confirmModal;
    setConfirmModal(null);
    setClaimingTier(tier);
    setErrorMessage(null);

    try {
      const res = await customerFetch('/api/my-page/reward-claim', {
        method: 'POST',
        body: JSON.stringify({ franchiseId: franchise.franchiseId, tier }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || '보상 신청에 실패했습니다.');
        return;
      }

      onStampsUpdated(franchise.franchiseId, data.currentStamps);
      setSuccessMessage(`${description} 보상 신청이 완료되었습니다.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (e) {
      if (e instanceof CustomerAuthError) return onAuthExpired();
      setErrorMessage('보상 신청 중 오류가 발생했습니다.');
    } finally {
      setClaimingTier(null);
    }
  };

  return (
    <div className="mb-5">
      {/* 프랜차이즈 헤더 배너 */}
      <div className="bg-[#FFD541] rounded-t-[12px] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">&#11088;</span>
          <span className="text-sm font-bold text-[#1d2022]">
            {franchise.franchiseName} 통합 스탬프
          </span>
        </div>
      </div>

      <div className="border border-t-0 border-[#ebeced] rounded-b-[12px] p-4 space-y-4">
        {successMessage && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[10px] px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#22c55e] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-[#15803d]">{successMessage}</p>
          </div>
        )}
        {errorMessage && <p className="text-sm text-[#ef4444]">{errorMessage}</p>}

        {franchise.stampRewards.length > 0 && (
          <StampGrid totalStamps={franchise.totalStamps} rewards={franchise.stampRewards} />
        )}

        <NextRewardBanner next={franchise.nextReward} />

        {franchise.totalPoints > 0 && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm text-[#91949a]">통합 포인트</span>
            <span className="text-sm font-bold text-[#1d2022]">{franchise.totalPoints.toLocaleString()}P</span>
          </div>
        )}

        <RewardList
          rewards={franchise.stampRewards}
          totalStamps={franchise.totalStamps}
          selfClaimEnabled={franchise.selfClaimEnabled}
          claimingTier={claimingTier}
          onClaim={handleClaimRequest}
        />

        {franchise.storeBreakdown.length > 0 && (
          <div className="bg-[#f8f9fa] rounded-[10px] px-4 py-3">
            <p className="text-xs font-medium text-[#91949a] mb-2">매장별 적립</p>
            {franchise.storeBreakdown.map((store) => (
              <div key={store.storeId} className="flex items-center justify-between py-1">
                <span className="text-sm text-[#1d2022]">{store.storeName}</span>
                <span className="text-sm font-semibold text-[#1d2022]">{store.stamps}개</span>
              </div>
            ))}
          </div>
        )}

        <CollapsibleHistory title="최근 스탬프 내역" entries={franchise.recentStampHistory} showStoreName />
        <CollapsibleHistory title="최근 포인트 내역" entries={franchise.recentPointHistory} showStoreName />
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="w-14 h-14 rounded-full bg-[#FFF4D6] flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">&#127873;</span>
            </div>
            <h2 className="text-base font-bold text-[#1d2022] mb-2">보상 수령 신청</h2>
            <p className="text-sm text-[#55595e] mb-1">
              스탬프 <span className="font-bold">{confirmModal.tier}개</span>를 사용하여
            </p>
            <div className="bg-[#FFF4D6] rounded-xl px-4 py-2.5 mb-4">
              <p className="text-sm font-bold text-[#1d2022]">{confirmModal.description}</p>
            </div>
            <p className="text-xs text-[#91949a] mb-5">신청 후 매장에서 보상을 수령해주세요.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 bg-[#f0f1f2] text-[#55595e] font-semibold text-sm rounded-xl">
                취소
              </button>
              <button onClick={handleConfirmClaim} className="flex-1 py-3 bg-[#FFD541] text-[#1d2022] font-semibold text-sm rounded-xl">
                신청하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 매장 섹션 ──────────────────────────────

function StoreSection({ store }: { store: StoreData }) {
  const stamps = store.totalStamps ?? 0;
  const hasStamps = store.stampEnabled && stamps > 0;
  const showPoints = store.pointSource !== 'CRM' || (store.totalPoints ?? 0) > 0;

  return (
    <div className="mb-4 border border-[#ebeced] rounded-[12px] p-4 space-y-3">
      {/* 매장 헤더 */}
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-[#f0f1f2] flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-[#91949a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1d2022]">
            {store.storeName}
            {store.category && (
              <span className="ml-1.5 text-[11px] font-normal text-[#91949a]">{CATEGORY_LABELS[store.category] ?? ''}</span>
            )}
          </p>
          {store.lastVisitAt && (
            <p className="text-[11px] text-[#b1b5b8]">최근 방문 {formatDate(store.lastVisitAt)}</p>
          )}
        </div>
      </div>

      {/* 포인트/스탬프 잔액 */}
      <div className="flex gap-3">
        {showPoints && (
          <div className="flex-1 bg-[#f8f9fa] rounded-[10px] px-4 py-3 text-center">
            <p className="text-[11px] text-[#91949a] mb-0.5">포인트</p>
            {store.pointSource === 'METACITY_UNAVAILABLE' ? (
              <p className="text-xs font-medium text-[#55595e] py-0.5">포스에서 확인해 주세요</p>
            ) : (
              <p className="text-base font-bold text-[#1d2022]">{(store.totalPoints ?? 0).toLocaleString()}P</p>
            )}
          </div>
        )}
        {hasStamps && (
          <div className="flex-1 bg-[#f8f9fa] rounded-[10px] px-4 py-3 text-center">
            <p className="text-[11px] text-[#91949a] mb-0.5">스탬프</p>
            <p className="text-base font-bold text-[#1d2022]">{stamps}개</p>
          </div>
        )}
        {!showPoints && !hasStamps && (
          <div className="flex-1 bg-[#f8f9fa] rounded-[10px] px-4 py-3 text-center">
            <p className="text-[11px] text-[#91949a] mb-0.5">방문</p>
            <p className="text-base font-bold text-[#1d2022]">{store.visitCount}회</p>
          </div>
        )}
      </div>

      {store.stampManagedByFranchise && (
        <p className="text-xs text-[#91949a]">
          스탬프는 위의 {store.franchiseName ?? '브랜드'} 통합 스탬프에서 확인할 수 있어요.
        </p>
      )}

      {/* 스탬프 그리드 (보상이 있을 때) */}
      {hasStamps && store.stampRewards.length > 0 && (
        <>
          <StampGrid totalStamps={stamps} rewards={store.stampRewards} />
          <NextRewardBanner next={store.nextReward} />
          <RewardList rewards={store.stampRewards} />
        </>
      )}

      {/* 쿠폰함 */}
      {store.coupons.length > 0 && (
        <div className="rounded-[10px] border border-dashed border-[#FFD541] px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[#FFB800]">보유 쿠폰 {store.coupons.length}장</p>
          {store.coupons.map((coupon) => (
            <div key={coupon.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1d2022]">{coupon.couponContent}</p>
                <p className="text-[11px] text-[#91949a]">{coupon.expiryDate} · 코드 {coupon.code}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 매장 기본 정보 */}
      <div className="text-xs text-[#91949a] space-y-0.5">
        {store.address && <p>{store.address}</p>}
        <p>
          {benefitLabel(store)}
          {store.naverPlaceUrl && (
            <>
              {' · '}
              <a href={store.naverPlaceUrl} target="_blank" rel="noopener noreferrer" className="text-[#03A94D] font-medium">
                네이버 플레이스
              </a>
            </>
          )}
        </p>
      </div>

      <CollapsibleHistory title="최근 스탬프 내역" entries={store.recentStampHistory} />
      <CollapsibleHistory title="최근 포인트 내역" entries={store.recentPointHistory} />
    </div>
  );
}

// ─── 로그인 화면 ────────────────────────────

function LoginScreen({ errorMessage, notice }: { errorMessage: string | null; notice?: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-16 h-16 rounded-full bg-[#FFF4D6] flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-[#FFB800]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-[#1d2022] mb-2 tracking-tight">내 멤버십</h1>
      <p className="text-sm text-[#91949a] mb-8 text-center">
        로그인하면 태그히어 매장에 쌓인<br />포인트와 스탬프를 한눈에 볼 수 있어요
      </p>
      {notice && <p className="text-sm text-[#55595e] mb-4 text-center">{notice}</p>}
      {errorMessage && <p className="text-sm text-[#ef4444] mb-4 text-center">{errorMessage}</p>}
      <button
        onClick={startKakaoLogin}
        className="w-full py-4 bg-[#FEE500] text-[#191919] font-semibold text-base rounded-[10px] flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 1C4.58 1 1 3.8 1 7.2c0 2.2 1.46 4.13 3.65 5.23-.16.58-.58 2.1-.66 2.43-.1.41.15.4.31.29.13-.08 2.04-1.38 2.87-1.94.6.09 1.21.13 1.83.13 4.42 0 8-2.8 8-6.14S13.42 1 9 1z" fill="#191919" />
        </svg>
        카카오로 시작하기
      </button>
      <button
        onClick={startNaverLogin}
        className="w-full mt-2.5 py-4 bg-[#03C75A] text-white font-semibold text-base rounded-[10px] flex items-center justify-center gap-2"
      >
        <span className="font-black text-lg leading-none">N</span>
        네이버로 시작하기
      </button>
    </div>
  );
}

// ─── 메인 컨텐츠 ────────────────────────────

function MyPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('wallet');
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [data, setData] = useState<MyPageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [openWithdraw, setOpenWithdraw] = useState(false);

  // 1. 로그인 증표 확보 (콜백 해시 → 저장소). 예전 ?kakaoId= 링크는 무시한다
  useEffect(() => {
    const fromHash = consumeTokenFromHash();
    const errorCode = searchParams.get('error');
    if (errorCode) {
      // 재로그인 후 탈퇴하려다 로그인이 취소·실패했으면 탈퇴 예약도 지운다 (다음 로그인 때 갑자기 뜨지 않게)
      takePendingWithdraw();
      setLoginError(loginErrorMessage(errorCode));
      window.history.replaceState({}, '', window.location.pathname);
    } else if (searchParams.get('kakaoId')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (fromHash && takePendingWithdraw()) {
      setTab('info');
      setOpenWithdraw(true);
    }
    setHasToken(!!currentToken());
  }, [searchParams]);

  const handleAuthExpired = useCallback(() => {
    logoutCustomer();
    setOpenWithdraw(false);
    setData(null);
    setHasToken(false);
    setLoginError('로그인이 만료되었습니다. 다시 로그인해주세요.');
  }, []);

  // 2. 데이터 조회
  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    customerFetch('/api/my-page')
      .then(async (res) => {
        if (!res.ok) throw new Error('API error');
        const result: MyPageData = await res.json();
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof CustomerAuthError) return handleAuthExpired();
        setError('데이터를 불러오는데 실패했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken, handleAuthExpired]);

  const handleLogout = () => {
    logoutCustomer();
    setOpenWithdraw(false);
    setData(null);
    setHasToken(false);
    setLoginError(null);
    setTab('wallet');
  };

  const handleWithdrawn = () => {
    logoutCustomer();
    setOpenWithdraw(false);
    setData(null);
    setHasToken(false);
    setTab('wallet');
    setLoginError(null);
    setLoginNotice('탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.');
  };

  const renderWallet = () => {
    if (!hasToken) return <LoginScreen errorMessage={loginError} notice={loginNotice} />;
    if (loading || !data) {
      if (error) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <p className="text-sm text-[#ef4444] mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#f0f1f2] text-[#1d2022] font-semibold text-sm rounded-[10px]">
              다시 시도
            </button>
          </div>
        );
      }
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (data.franchises.length === 0 && data.stores.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-14 h-14 rounded-full bg-[#f8f9fa] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#b1b5b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#1d2022] mb-1">아직 적립 내역이 없어요</p>
          <p className="text-sm text-[#91949a] text-center">
            매장에서 포인트나 스탬프를 적립하면<br />여기에서 확인할 수 있어요
          </p>
          {!data.customer.hasPhone && (
            <p className="text-xs text-[#91949a] text-center mt-4">
              휴대폰 번호 제공에 동의하면 더 많은 매장이 보여요.
            </p>
          )}
          <button onClick={() => setTab('map')} className="mt-6 px-5 py-2.5 bg-[#FFD541] text-[#1d2022] text-sm font-semibold rounded-[10px]">
            태그히어 매장 둘러보기
          </button>
        </div>
      );
    }

    const totalStoreCount = data.franchises.length + data.stores.length;
    return (
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-[#1d2022]">{data.customer.name ? `${data.customer.name} 님` : '내 지갑'}</h2>
          <p className="text-sm text-[#91949a] mt-0.5">방문 매장 {totalStoreCount}개</p>
          {!data.customer.hasPhone && (
            <p className="text-xs text-[#91949a] mt-1">휴대폰 번호 제공에 동의하면 더 많은 매장이 보여요.</p>
          )}
        </div>

        {data.franchises.map((franchise) => (
          <FranchiseSection
            key={franchise.franchiseId}
            franchise={franchise}
            onAuthExpired={handleAuthExpired}
            onStampsUpdated={(franchiseId, newStamps) => {
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      franchises: prev.franchises.map((f) =>
                        f.franchiseId === franchiseId ? { ...f, totalStamps: newStamps } : f
                      ),
                    }
                  : prev
              );
            }}
          />
        ))}

        {data.stores.length > 0 && (
          <div>
            {data.franchises.length > 0 && <h3 className="text-sm font-semibold text-[#91949a] mb-3 mt-2">매장별 내역</h3>}
            {data.stores.map((store) => (
              <StoreSection key={store.storeId} store={store} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderInfo = () => {
    if (!hasToken) return <LoginScreen errorMessage={loginError} notice={loginNotice} />;
    if (!data && error) {
      // 내 정보를 못 불러와도 로그아웃은 할 수 있어야 한다
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <p className="text-sm text-[#ef4444] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#f0f1f2] text-[#1d2022] font-semibold text-sm rounded-[10px]">
            다시 시도
          </button>
          <button onClick={handleLogout} className="mt-4 text-sm text-[#55595e] underline underline-offset-2">
            로그아웃
          </button>
        </div>
      );
    }
    if (!data) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <MyInfo
        customer={data.customer}
        openWithdrawOnMount={openWithdraw}
        onWithdrawPromptShown={() => setOpenWithdraw(false)}
        onLogout={handleLogout}
        onWithdrawn={handleWithdrawn}
        onAuthExpired={handleAuthExpired}
      />
    );
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'wallet', label: '내 지갑' },
    { key: 'map', label: '매장 지도' },
    { key: 'info', label: '내 정보' },
  ];
  const titles: Record<Tab, string> = { wallet: '내 멤버십', map: '태그히어 매장', info: '내 정보' };

  return (
    <div className="h-[100dvh] bg-white flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col relative">
        <div className="flex-shrink-0 h-[54px] border-b border-[#ebeced] flex items-center justify-center">
          <span className="text-lg font-bold text-[#1d2022]">{titles[tab]}</span>
        </div>

        {hasToken === null ? (
          <div className="flex-1" />
        ) : tab === 'wallet' ? (
          renderWallet()
        ) : tab === 'map' ? (
          <StoreMap />
        ) : (
          renderInfo()
        )}

        <nav className="flex-shrink-0 border-t border-[#ebeced] grid grid-cols-3 pb-[env(safe-area-inset-bottom,0px)]">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`py-3 text-sm font-semibold ${tab === key ? 'text-[#1d2022]' : 'text-[#b1b5b8]'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

// ─── 페이지 ─────────────────────────────────

export default function MyPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MyPageContent />
    </Suspense>
  );
}
