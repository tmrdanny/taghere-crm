// 스탬프 보상 당첨 팝업 — 색상 테마(기본/하이트진로)는 클래스 문자열 그대로 전달한다.
export function RewardPopupModal({
  reward,
  tier,
  onClose,
  cardClassName,
  buttonClassName,
}: {
  reward: string;
  tier: number;
  onClose: () => void;
  cardClassName: string;
  buttonClassName: string;
}) {
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
        <div className={cardClassName}>
          <p className="text-base font-bold text-[#1d2022]">{reward}</p>
        </div>

        <p className="text-sm text-[#55595e] mb-5">
          직원에게 현재 화면을 보여주세요.
        </p>

        <button
          onClick={onClose}
          className={buttonClassName}
        >
          확인
        </button>
      </div>
    </div>
  );
}
