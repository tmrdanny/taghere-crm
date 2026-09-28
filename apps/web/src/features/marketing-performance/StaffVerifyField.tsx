'use client';

import { cn } from '@/lib/utils';

// 직원 확인 쿠폰 — 손님이 매장에서 쿠폰 화면을 보여주면 직원이 “사용 완료”를 눌러
// 몇 명이 메시지를 보고 왔는지 마케팅 성과에서 셀 수 있게 한다. (자동 마케팅과 같은 확인 화면)
export interface StaffVerifyValue {
  enabled: boolean;
  couponContent: string;
  expiryDate: string; // YYYY-MM-DD
}

export const defaultExpiry = (days = 14) => {
  const d = new Date(Date.now() + days * 86400000 + 9 * 3600000);
  return d.toISOString().slice(0, 10);
};

export const emptyStaffVerify = (): StaffVerifyValue => ({ enabled: false, couponContent: '', expiryDate: defaultExpiry() });

const inputCls =
  'w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none';

export function StaffVerifyField({
  value,
  onChange,
  withContent = true,
  hint,
  label = '직원 확인 쿠폰 붙이기',
  contentPlaceholder = '예: 하이볼 1잔 무료',
}: {
  value: StaffVerifyValue;
  onChange: (v: StaffVerifyValue) => void;
  /** 쿠폰 내용 입력 칸 (프리미엄 카카오톡은 카카오 쿠폰 이름을 그대로 써서 숨김) */
  withContent?: boolean;
  hint?: string;
  label?: string;
  contentPlaceholder?: string;
}) {
  return (
    <div className={cn('grid gap-3 rounded-[12px] border p-3.5 transition-colors', value.enabled ? 'border-[color:var(--ad-ink)]' : 'border-[color:var(--ad-line)]')}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[color:var(--ad-ink)]"
        />
        <span className="grid gap-0.5">
          <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{label}</span>
          <span className="text-[12px] leading-snug text-[color:var(--ad-muted)]">
            {hint ?? '손님마다 쿠폰 링크가 붙어요. 매장에서 직원이 “사용 완료”를 누르면 마케팅 성과에서 몇 명이 쿠폰을 들고 왔는지 보여요.'}
          </span>
        </span>
      </label>
      {value.enabled && (
        <div className={cn('grid gap-2', withContent ? 'sm:grid-cols-[minmax(0,1fr)_160px]' : 'sm:grid-cols-[160px]')}>
          {withContent && (
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">쿠폰 내용</span>
              <input
                value={value.couponContent}
                maxLength={60}
                onChange={(e) => onChange({ ...value, couponContent: e.target.value })}
                placeholder={contentPlaceholder}
                className={inputCls}
              />
            </label>
          )}
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">유효기간</span>
            <input type="date" value={value.expiryDate} min={defaultExpiry(0)} onChange={(e) => onChange({ ...value, expiryDate: e.target.value })} className={inputCls} />
          </label>
        </div>
      )}
    </div>
  );
}

/** 문자 미리보기에 붙는 쿠폰 안내 (실제로는 손님마다 다른 링크) */
export function smsCouponPreview(v: StaffVerifyValue): string {
  if (!v.enabled) return '';
  return `\n\n[쿠폰] ${v.couponContent || '쿠폰 내용'}\n유효기간 ${v.expiryDate}까지\n매장에서 직원에게 보여주세요\n${typeof window !== 'undefined' ? window.location.origin : ''}/coupon/verify/A1B2C3D4E5`;
}

/** 발송 요청 본문용 (꺼져 있으면 undefined) */
export function staffVerifyPayload(v: StaffVerifyValue, requireContent = true) {
  if (!v.enabled) return undefined;
  if (requireContent && !v.couponContent.trim()) return undefined;
  return { enabled: true, couponContent: v.couponContent.trim(), expiryDate: v.expiryDate };
}
