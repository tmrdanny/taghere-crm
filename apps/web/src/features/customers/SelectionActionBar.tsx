'use client';

import { Minus, Plus, Send, Users, X } from 'lucide-react';
import { formatNumber, maskNickname } from '@/lib/utils';
import type { Customer } from './types';

// 고객 리스트 하단 선택 바 — 손님을 체크하면 화면 아래에 붙어서 뜬다.
// 한 명을 고르면 포인트(스탬프 매장은 스탬프) 적립·사용을 바로 할 수 있고,
// 여러 명이면 메시지 발송 · 그룹 만들기만 보인다. (포인트·스탬프는 한 명씩)
export function SelectionActionBar({
  selected,
  stampEnabled,
  onEarnPoints,
  onUsePoints,
  onEarnStamps,
  onDeductStamps,
  onSendMessage,
  onCreateGroup,
  onClear,
}: {
  /** 선택한 손님 (다른 페이지 손님 포함) */
  selected: Customer[];
  stampEnabled: boolean;
  onEarnPoints: (customer: Customer) => void;
  onUsePoints: (customer: Customer) => void;
  onEarnStamps: (customer: Customer) => void;
  onDeductStamps: (customer: Customer) => void;
  onSendMessage: () => void;
  onCreateGroup: () => void;
  onClear: () => void;
}) {
  if (selected.length === 0) return null;
  const single = selected.length === 1 ? selected[0] : null;

  const primaryBtn =
    'adm-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[11px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40]';
  const secondaryBtn =
    'adm-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[11px] bg-white px-3.5 text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]';

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
      <div
        role="region"
        aria-label="선택한 손님 작업"
        className="pointer-events-auto flex w-full max-w-[980px] flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] bg-white/95 px-4 py-3 shadow-[0_0_0_1px_var(--ad-line),0_18px_40px_-16px_rgba(19,22,81,0.35)] backdrop-blur sm:px-5"
      >
        {/* 누구를 골랐나 */}
        <div className="flex min-w-[150px] flex-1 items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--ad-ink)] text-[13px] font-semibold text-white adm-tnum">
            {selected.length > 99 ? '99+' : selected.length}
          </span>
          <div className="min-w-0">
            {single ? (
              <>
                <p className="truncate text-[14px] font-semibold text-[color:var(--ad-ink)]">{maskNickname(single.name)}</p>
                <p className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)] adm-tnum">
                  {stampEnabled ? `스탬프 ${formatNumber(single.totalStamps ?? 0)}개` : `보유 ${formatNumber(single.totalPoints ?? 0)}P`}
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold text-[color:var(--ad-ink)] adm-tnum">{formatNumber(selected.length)}명 선택됨</p>
                <p className="text-[12px] text-[color:var(--ad-muted)]">포인트·스탬프는 한 명만 골랐을 때 쓸 수 있어요</p>
              </>
            )}
          </div>
        </div>

        {/* 한 명일 때: 포인트 또는 스탬프 */}
        {single && (
          <div className="flex flex-wrap items-center gap-2">
            {stampEnabled ? (
              <>
                <button type="button" onClick={() => onEarnStamps(single)} className={primaryBtn}>
                  <Plus className="h-4 w-4" />
                  스탬프 적립
                </button>
                <button type="button" onClick={() => onDeductStamps(single)} className={secondaryBtn}>
                  <Minus className="h-4 w-4" />
                  스탬프 차감
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onEarnPoints(single)} className={primaryBtn}>
                  <Plus className="h-4 w-4" />
                  포인트 적립
                </button>
                <button type="button" onClick={() => onUsePoints(single)} className={secondaryBtn}>
                  <Minus className="h-4 w-4" />
                  포인트 사용
                </button>
              </>
            )}
          </div>
        )}

        {/* 공통: 메시지 · 그룹 · 해제 */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSendMessage} className={single ? secondaryBtn : primaryBtn}>
            <Send className="h-4 w-4" />
            메시지 보내기
          </button>
          <button type="button" onClick={onCreateGroup} className={secondaryBtn}>
            <Users className="h-4 w-4" />
            그룹 만들기
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="선택 해제"
            title="선택 해제"
            className="adm-press grid h-10 w-10 place-items-center rounded-[11px] text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
