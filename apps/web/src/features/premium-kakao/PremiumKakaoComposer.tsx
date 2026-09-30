'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn, formatNumber } from '@/lib/utils';
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { StaffVerifyField, StaffVerifyValue } from '@/features/marketing-performance/StaffVerifyField';
import { SAMPLES } from './samples';
import { SendTimePicker, SendTimeValue, defaultSendTime, formatSendTime, sendTimeError, sendTimeToIso } from '@/features/messages/SendTimePicker';
import {
  BubbleType,
  CouponKind,
  IMAGE_SLOT_SIZE,
  ImageSlot,
  LIMITS,
  PkButton,
  PkCard,
  PkCommerce,
  PkContent,
  PkImage,
  PkItem,
  SPEC,
  TYPE_SPECS,
  charLen,
  couponTitle,
  applySenderFooter,
  senderFooter,
  SENDER_FOOTER_ENABLED,
  emptyCard,
  emptyContent,
  validate,
} from './spec';

const inputCls =
  'w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none';

// 이미지 업로드 대상 — 사장님 / 프랜차이즈 API 경로
const ApiContext = createContext({ apiBase: '/api/premium-kakao', tokenKey: 'token' });

// 올린 사진을 형태에 맞는 비율로 가운데를 잘라 JPG 로 만든다 (카카오 비율 규격 자동 충족)
async function cropToSlot(file: File, slot: ImageSlot): Promise<Blob> {
  const { width, height } = IMAGE_SLOT_SIZE[slot];
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지를 읽을 수 없어요'));
      el.src = url;
    });
    const target = width / height;
    const srcRatio = img.naturalWidth / img.naturalHeight;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (srcRatio > target) sw = Math.round(sh * target);
    else sh = Math.round(sw / target);
    const sx = Math.round((img.naturalWidth - sw) / 2);
    const sy = Math.round((img.naturalHeight - sh) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들 수 없어요'))), 'image/jpeg', 0.9)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = charLen(value);
  return <span className={cn('font-mono text-[11px]', n > max ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-faint)]')}>{n}/{max}</span>;
}

function Field({ label, value, max, onChange, area, rows, placeholder, inputMode }: {
  label: string;
  value: string;
  max?: number;
  onChange: (v: string) => void;
  area?: boolean;
  rows?: number;
  placeholder?: string;
  inputMode?: 'numeric' | 'url';
}) {
  const over = max !== undefined && charLen(value) > max;
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">
        {label}
        {max !== undefined && <Counter value={value} max={max} />}
      </span>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows ?? 4} placeholder={placeholder} className={cn(inputCls, 'resize-y leading-[1.55]', over && 'border-[color:var(--ad-neg)]')} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className={cn(inputCls, over && 'border-[color:var(--ad-neg)]')} />
      )}
    </label>
  );
}

function ImageField({ label, slot, image, onChange }: { label: string; slot: ImageSlot; image: PkImage | null; onChange: (img: PkImage | null) => void }) {
  const api = useContext(ApiContext);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const size = IMAGE_SLOT_SIZE[slot];

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (!/\.(jpe?g|png)$/i.test(file.name)) return setError('JPG 또는 PNG만 올릴 수 있어요');
    if (file.size > 20 * 1024 * 1024) return setError('20MB 이하 사진을 올려 주세요');
    setUploading(true);
    try {
      const blob = await cropToSlot(file, slot);
      const form = new FormData();
      form.append('image', blob, 'image.jpg');
      form.append('slot', slot);
      const res = await fetch(`${API_BASE}${api.apiBase}/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(api.tokenKey) || ''}` }, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '이미지를 올리지 못했어요');
      onChange({ imageId: data.imageId, url: data.url });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="grid gap-1.5">
      <span className="flex items-center justify-between text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">
        {label}
        <span className="font-mono text-[11px] text-[color:var(--ad-faint)]">{size.label}</span>
      </span>
      <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-[color:var(--ad-line-strong)] p-2">
        <div className="h-12 w-20 flex-none overflow-hidden rounded-[6px] bg-[color:var(--ad-bg-alt)]" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_BASE}${image.url}`} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <p className="flex-1 text-[12px] leading-snug text-[color:var(--ad-muted)]">
          {uploading ? '올리는 중...' : image ? '비율에 맞게 잘라서 올렸어요' : 'JPG·PNG · 올리면 비율에 맞게 가운데를 잘라요'}
        </p>
        {image && !uploading && (
          <button type="button" onClick={() => onChange(null)} className="p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]" aria-label={`${label} 지우기`}>
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="adm-press inline-flex h-8 flex-none items-center gap-1 rounded-[8px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {image ? '바꾸기' : '올리기'}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p className="text-[12px] text-[color:var(--ad-neg)]">{error}</p>}
    </div>
  );
}

function ButtonsField({ buttons, max, min = 0, nameMax, onChange, label = '버튼' }: {
  buttons: PkButton[];
  max: number;
  min?: number;
  nameMax: number;
  onChange: (b: PkButton[]) => void;
  label?: string;
}) {
  const set = (i: number, patch: Partial<PkButton>) => onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="grid gap-2">
      <span className="flex items-center justify-between text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">
        {label}
        <span className="font-mono text-[11px] text-[color:var(--ad-faint)]">{buttons.length}/{max}</span>
      </span>
      {buttons.map((b, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2">
          <div className="relative">
            <input value={b.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="버튼 이름" className={cn(inputCls, charLen(b.name) > nameMax && 'border-[color:var(--ad-neg)]')} aria-label={`${label} ${i + 1} 이름`} />
            <span className="pointer-events-none absolute right-2 top-2.5"><Counter value={b.name} max={nameMax} /></span>
          </div>
          <input value={b.link} onChange={(e) => set(i, { link: e.target.value })} placeholder="https://" inputMode="url" className={inputCls} aria-label={`${label} ${i + 1} 연결 주소`} />
          <button
            type="button"
            onClick={() => onChange(buttons.filter((_, j) => j !== i))}
            disabled={buttons.length <= min}
            className="mt-1.5 p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] disabled:opacity-30"
            aria-label={`${label} ${i + 1} 삭제`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {buttons.length < max && (
        <button type="button" onClick={() => onChange([...buttons, { name: '', link: buttons[0]?.link ?? '' }])} className="inline-flex w-max items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)] hover:underline">
          <Plus className="h-3.5 w-3.5" /> {label} 추가
        </button>
      )}
    </div>
  );
}

function CommerceFields({ commerce, onChange, prefix = '' }: { commerce: PkCommerce; onChange: (c: PkCommerce) => void; prefix?: string }) {
  return (
    <>
      <Field label={`${prefix}상품명`} value={commerce.title} max={LIMITS.commerceTitle} onChange={(title) => onChange({ ...commerce, title })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="정가 (원)" value={commerce.regularPrice} inputMode="numeric" onChange={(v) => onChange({ ...commerce, regularPrice: v.replace(/[^\d]/g, '') })} />
        <Field label="할인가 (원, 선택)" value={commerce.discountPrice} inputMode="numeric" onChange={(v) => onChange({ ...commerce, discountPrice: v.replace(/[^\d]/g, '') })} />
      </div>
    </>
  );
}

const COUPON_KINDS: Array<{ kind: CouponKind; label: string; valueLabel: string }> = [
  { kind: 'WON', label: 'N원 할인', valueLabel: '할인 금액 (원)' },
  { kind: 'PCT', label: 'N% 할인', valueLabel: '할인율 (%)' },
  { kind: 'FREE', label: '메뉴 무료', valueLabel: '무료 메뉴 (7자)' },
  { kind: 'UP', label: '메뉴 업그레이드', valueLabel: '업그레이드 메뉴 (7자)' },
];

function CouponField({ content, descMax, onChange }: { content: PkContent; descMax: number; onChange: (c: PkContent) => void }) {
  const cp = content.coupon;
  const kind = COUPON_KINDS.find((k) => k.kind === cp?.kind) ?? COUPON_KINDS[0];
  return (
    <div className="grid gap-2">
      <label className="flex w-max cursor-pointer items-center gap-2 text-[13px] text-[color:var(--ad-ink-2)]">
        <input
          type="checkbox"
          checked={!!cp}
          onChange={(e) => {
            const on = e.target.checked;
            const buttons = on && content.buttons.length > 4 ? content.buttons.slice(0, 4) : content.buttons;
            onChange({ ...content, buttons, coupon: on ? { kind: 'WON', value: '2000', description: '' } : null });
          }}
          className="h-4 w-4 accent-[color:var(--ad-ink)]"
        />
        쿠폰 붙이기
      </label>
      {cp && (
        <div className="grid gap-3 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="쿠폰 종류">
            {COUPON_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={cp.kind === k.kind}
                onClick={() => onChange({ ...content, coupon: { ...cp, kind: k.kind, value: '' } })}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12px]',
                  cp.kind === k.kind ? 'border-[color:var(--ad-ink)] bg-[color:var(--ad-ink)] font-medium text-white' : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)]'
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={kind.valueLabel}
              value={cp.value}
              max={cp.kind === 'FREE' || cp.kind === 'UP' ? LIMITS.couponFreeMax : undefined}
              inputMode={cp.kind === 'WON' || cp.kind === 'PCT' ? 'numeric' : undefined}
              onChange={(v) => onChange({ ...content, coupon: { ...cp, value: cp.kind === 'WON' || cp.kind === 'PCT' ? v.replace(/[^\d]/g, '') : v.replace(/\s/g, '') } })}
            />
            <Field label="쿠폰 설명" value={cp.description} max={descMax} placeholder="예: 신메뉴 주문 시" onChange={(description) => onChange({ ...content, coupon: { ...cp, description } })} />
          </div>
          <p className="text-[12px] text-[color:var(--ad-muted)]">
            쿠폰 이름: <b className="font-semibold text-[color:var(--ad-ink)]">{couponTitle(cp)}</b> · 카카오가 정한 형식만 쓸 수 있어요
          </p>
        </div>
      )}
    </div>
  );
}

export interface PremiumTarget {
  targetType: string;
  customerIds?: string[];
  segmentId?: string;
  genderFilter?: string;
  ageGroups?: string[];
}

interface Estimate {
  targetCount: number;
  unitCost: number;
  totalCost: number;
  walletBalance: number;
  canSend: boolean;
  sendableNow: boolean;
  nextSendableAt: string | null;
}

export function PremiumKakaoComposer({
  type,
  onTypeChange,
  content,
  onContentChange,
  target,
  targetReady,
  showToast,
  onNeedCharge,
  onSent,
  staffVerify,
  onStaffVerifyChange,
  apiBase = '/api/premium-kakao',
  tokenKey = 'token',
  leadingType,
  defaultLink = '',
  onFooterName,
}: {
  type: BubbleType;
  onTypeChange: (t: BubbleType) => void;
  content: PkContent;
  onContentChange: (c: PkContent) => void;
  target: PremiumTarget;
  /** 대상 선택이 완료됐는지 (CUSTOM 인데 고객 없음, SEGMENT 인데 그룹 없음 등은 false) */
  targetReady: boolean;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onNeedCharge: (required: number, balance: number) => void;
  onSent: () => void;
  /** 직원 확인 — 카카오 쿠폰 “받기”를 고객별 직원 확인 화면으로 연결 */
  staffVerify: StaffVerifyValue;
  onStaffVerifyChange: (v: StaffVerifyValue) => void;
  /** 사장님: /api/premium-kakao, 프랜차이즈: /api/franchise/premium-kakao */
  apiBase?: string;
  tokenKey?: string;
  /**
   * 형태 목록 맨 앞에 붙는 형태 — “템플릿 기본형”(쿠폰 알림톡). 고르면 브랜드 메시지 편집 대신 content 를 보여준다.
   * 발송은 기존 알림톡 경로 그대로 (부모가 담당).
   */
  leadingType?: { name: string; tip: string; priceLabel: string; selected: boolean; onSelect: () => void; content: React.ReactNode };
  /** 샘플·버튼 링크 기본값 (매장 네이버 플레이스) */
  defaultLink?: string;
  /** 발송 매장 안내에 들어갈 매장명을 알게 되면 알려준다 (미리보기용) */
  onFooterName?: (name: string) => void;
}) {
  const [appliedSample, setAppliedSample] = useState<string | null>(null);
  // 발송 시간 — 발송 불가 시간이면 다음 오전 8시 예약으로 먼저 잡힌다
  const [sendTime, setSendTime] = useState<SendTimeValue>(defaultSendTime);
  // 샘플 적용 — 직원 확인이 켜져 있으면 버튼 자리를 하나 비워 둔다
  const applySample = (id: string | null, next: PkContent) => {
    const room = (s: number) => Math.max(0, s - (staffVerify.enabled ? 1 : 0));
    const sp = SPEC[type];
    const max = room(next.coupon && sp.buttonsMax === 5 ? 4 : sp.buttonsMax);
    onContentChange({
      ...next,
      buttons: next.buttons.slice(0, max),
      cards: next.cards.map((c) => ({ ...c, buttons: c.buttons.slice(0, room(2)) })),
    });
    setAppliedSample(id);
  };
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` });
  const apiValue = useMemo(() => ({ apiBase, tokenKey }), [apiBase, tokenKey]);
  useEffect(() => setAppliedSample(null), [type]);
  const spec = SPEC[type];
  const verifyOn = staffVerify.enabled;
  const [footerName, setFooterName] = useState('');
  // 발송 매장 안내(맨 아래 한 줄)까지 붙인 내용으로 검사한다
  const footered = useMemo(() => applySenderFooter(type, content, footerName || '매장'), [type, content, footerName]);
  const issues = useMemo(() => {
    const list = validate(type, footered.content, verifyOn);
    if (verifyOn && !staffVerify.couponContent.trim() && !content.coupon) list.push('직원 확인 쿠폰 내용을 입력해 주세요');
    return list;
  }, [type, content, footered, verifyOn, staffVerify.couponContent]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const targetKey = JSON.stringify(target);

  const fetchEstimate = useCallback(async () => {
    if (!targetReady) return setEstimate(null);
    try {
      const res = await fetch(`${API_BASE}${apiBase}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ bubbleType: type, ...target }),
      });
      if (res.ok) {
        const data = await res.json();
        setEstimate(data);
        if (data.footerName) {
          setFooterName(data.footerName);
          onFooterName?.(data.footerName);
        }
      }
    } catch {
      // 견적 실패는 발송 버튼에서 다시 확인한다
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, targetKey, targetReady]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 250);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  const set = (patch: Partial<PkContent>) => onContentChange({ ...content, ...patch });
  const setCard = (i: number, patch: Partial<PkCard>) => set({ cards: content.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setSub = (i: number, patch: Partial<PkItem>) => set({ subItems: content.subItems.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  // 직원 확인 버튼이 한 자리를 차지한다
  const buttonsMax = Math.max(0, (content.coupon && spec.buttonsMax === 5 ? 4 : spec.buttonsMax) - (verifyOn ? 1 : 0));

  const post = async (path: string, body: object) => {
    const res = await fetch(`${API_BASE}${apiBase}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했어요'), { data });
    return data;
  };

  const handleTest = async () => {
    setBusy('test');
    try {
      const data = await post('test-send', { bubbleType: type, content, phone: testPhone, staffVerify: verifyBody });
      showToast(`${testPhone}로 테스트를 보냈어요 (오늘 ${data.remaining}회 남음)`, 'success');
      setTestOpen(false);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    setBusy('send');
    try {
      const data = await post('send', { bubbleType: type, content, ...target, staffVerify: verifyBody, scheduledAt: sendTimeToIso(sendTime) });
      showToast(data.message, 'success');
      setConfirmOpen(false);
      onSent();
      fetchEstimate();
    } catch (e: any) {
      const d = e.data || {};
      if (d.requiredCost) onNeedCharge(d.requiredCost, d.walletBalance || 0);
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  // 직원 확인 — 모든 형태에 “직원 확인” 버튼(캐러셀은 카드마다)이 붙고, 쿠폰 “받기”도 같은 화면으로 열림
  const verifyBody = verifyOn ? { enabled: true, couponContent: staffVerify.couponContent.trim(), expiryDate: staffVerify.expiryDate } : undefined;
  const count = estimate?.targetCount ?? 0;
  const total = count * spec.price;
  const insufficient = estimate ? estimate.walletBalance < total : false;
  const canSend = targetReady && issues.length === 0 && count > 0 && !sendTimeError(sendTime, true);

  return (
    <ApiContext.Provider value={apiValue}>
      {/* 2. 형태 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">2. 어떤 형태로 보낼까요?</h2>
          <span className="text-[12px] text-[color:var(--ad-faint)]">부가세 포함</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="메시지 형태">
          {leadingType && (
            <button
              type="button"
              role="radio"
              aria-checked={leadingType.selected}
              onClick={leadingType.onSelect}
              className={cn(
                'grid gap-0.5 rounded-[12px] border bg-white p-3 text-left transition-[border-color,box-shadow]',
                leadingType.selected ? 'border-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-ink)]' : 'border-[color:var(--ad-line)] hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">{leadingType.name}</span>
              <span className="text-[11.5px] text-[color:var(--ad-faint)]">{leadingType.tip}</span>
              <span className="mt-1 text-[12px] font-medium text-[color:var(--ad-ink-2)] adm-tnum">{leadingType.priceLabel}</span>
            </button>
          )}
          {TYPE_SPECS.map((s) => (
            <button
              key={s.type}
              type="button"
              role="radio"
              aria-checked={!leadingType?.selected && type === s.type}
              onClick={() => onTypeChange(s.type)}
              className={cn(
                'grid gap-0.5 rounded-[12px] border bg-white p-3 text-left transition-[border-color,box-shadow]',
                !leadingType?.selected && type === s.type ? 'border-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-ink)]' : 'border-[color:var(--ad-line)] hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">{s.name}</span>
              <span className="text-[11.5px] text-[color:var(--ad-faint)]">{s.tip}</span>
              <span className="mt-1 text-[12px] font-medium text-[color:var(--ad-ink-2)] adm-tnum">건당 {s.price}원</span>
            </button>
          ))}
        </div>
      </div>

      {leadingType?.selected ? (
        leadingType.content
      ) : (
      <>
      {/* 샘플로 시작하기 — 기본형(빈 칸) + 형태별 샘플 3개 */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[color:var(--ad-ink)]">샘플로 시작하기</h3>
          <span className="text-[11.5px] text-[color:var(--ad-faint)]">고른 뒤 문구와 사진을 매장에 맞게 바꿔 보세요</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => applySample(null, emptyContent(type, defaultLink))}
            className={cn(
              'grid overflow-hidden rounded-[12px] border bg-white text-left transition-[border-color,box-shadow]',
              appliedSample === null ? 'border-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-ink)]' : 'border-[color:var(--ad-line)] hover:border-[color:var(--ad-line-strong)]'
            )}
          >
            <div className="grid aspect-[2/1] place-items-center bg-[color:var(--ad-bg-alt)] text-[color:var(--ad-faint)]">
              <Plus className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div className="grid gap-0.5 px-2.5 py-2">
              <span className="text-[12.5px] font-semibold leading-snug text-[color:var(--ad-ink)]">기본형</span>
              <span className="text-[11px] leading-snug text-[color:var(--ad-faint)] [word-break:keep-all]">빈 칸에서 직접 쓰기</span>
            </div>
          </button>
          {SAMPLES[type].map((sm) => (
            <button
              key={sm.id}
              type="button"
              onClick={() => applySample(sm.id, sm.build(defaultLink))}
              className={cn(
                'grid overflow-hidden rounded-[12px] border bg-white text-left transition-[border-color,box-shadow]',
                appliedSample === sm.id ? 'border-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-ink)]' : 'border-[color:var(--ad-line)] hover:border-[color:var(--ad-line-strong)]'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${API_BASE}/premium-stock/${sm.thumb}-w.jpg`} alt="" className="block aspect-[2/1] w-full object-cover" loading="lazy" />
              <div className="grid gap-0.5 px-2.5 py-2">
                <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[color:var(--ad-ink)] [word-break:keep-all]">{sm.name}</span>
                <span className="text-[11px] leading-snug text-[color:var(--ad-faint)]">{sm.tag}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. 내용 */}
      <div className="flex flex-col gap-4">
        <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">3. 내용을 채워 주세요</h2>

        {(type === 'IMAGE' || type === 'WIDE' || type === 'COMMERCE') && spec.imageSlot && (
          <ImageField label={type === 'COMMERCE' ? '상품 이미지' : '이미지'} slot={spec.imageSlot} image={content.image} onChange={(image) => set({ image })} />
        )}

        {(type === 'WIDE_ITEM_LIST' || type === 'PREMIUM_VIDEO') && (
          <Field label="헤더" value={content.header} max={spec.headerMax} onChange={(header) => set({ header })} placeholder={type === 'WIDE_ITEM_LIST' ? '예: 이번 주 사장님 추천' : '선택'} />
        )}

        {type === 'PREMIUM_VIDEO' && (
          <>
            <Field label="카카오TV 영상 주소" value={content.videoUrl} inputMode="url" placeholder="https://tv.kakao.com/v/..." onChange={(videoUrl) => set({ videoUrl })} />
            <ImageField label="썸네일 (선택)" slot="BMS" image={content.image} onChange={(image) => set({ image })} />
          </>
        )}

        {(type === 'TEXT' || type === 'IMAGE' || type === 'WIDE' || type === 'PREMIUM_VIDEO') && (
          <Field label="본문" value={content.content} max={spec.contentMax} area rows={type === 'TEXT' ? 7 : type === 'IMAGE' ? 4 : 2} onChange={(v) => set({ content: v })} />
        )}

        {type === 'COMMERCE' && (
          <>
            <CommerceFields commerce={content.commerce} onChange={(commerce) => set({ commerce })} />
            <Field label="부가 설명 (선택)" value={content.additionalContent} max={LIMITS.additionalContent} onChange={(additionalContent) => set({ additionalContent })} placeholder="예: 오후 3시까지 포장 주문만" />
          </>
        )}

        {type === 'WIDE_ITEM_LIST' && (
          <>
            <div className="grid gap-3 rounded-[12px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-3">
              <b className="text-[12.5px] font-semibold">대표 메뉴</b>
              <ImageField label="이미지" slot="BMS_WIDE_MAIN_ITEM_LIST" image={content.mainItem.image} onChange={(image) => set({ mainItem: { ...content.mainItem, image } })} />
              <Field label="제목" value={content.mainItem.title} max={LIMITS.mainItemTitle} onChange={(title) => set({ mainItem: { ...content.mainItem, title } })} />
              <Field label="연결 주소" value={content.mainItem.link} inputMode="url" placeholder="https://" onChange={(link) => set({ mainItem: { ...content.mainItem, link } })} />
            </div>
            {content.subItems.map((it, i) => (
              <div key={i} className="grid gap-3 rounded-[12px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-3">
                <b className="text-[12.5px] font-semibold">목록 {i + 1}</b>
                <ImageField label="이미지" slot="BMS_WIDE_SUB_ITEM_LIST" image={it.image} onChange={(image) => setSub(i, { image })} />
                <Field label="제목" value={it.title} max={LIMITS.subItemTitle} onChange={(title) => setSub(i, { title })} />
                <Field label="연결 주소" value={it.link} inputMode="url" placeholder="https://" onChange={(link) => setSub(i, { link })} />
              </div>
            ))}
          </>
        )}

        {(type === 'CAROUSEL_FEED' || type === 'CAROUSEL_COMMERCE') && spec.imageSlot && (
          <>
            {content.cards.map((card, i) => (
              <div key={i} className="grid gap-3 rounded-[12px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-3">
                <div className="flex items-center justify-between">
                  <b className="text-[12.5px] font-semibold">카드 {i + 1}</b>
                  {content.cards.length > LIMITS.cardsMin && (
                    <button type="button" onClick={() => set({ cards: content.cards.filter((_, j) => j !== i) })} className="text-[12px] text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]">
                      삭제
                    </button>
                  )}
                </div>
                <ImageField label="이미지" slot={spec.imageSlot!} image={card.image} onChange={(image) => setCard(i, { image })} />
                {type === 'CAROUSEL_FEED' ? (
                  <>
                    <Field label="제목" value={card.header} max={LIMITS.cardHeader} onChange={(header) => setCard(i, { header })} />
                    <Field label="설명" value={card.content} max={LIMITS.cardContent} area rows={2} onChange={(v) => setCard(i, { content: v })} />
                  </>
                ) : (
                  <>
                    <CommerceFields commerce={card.commerce} onChange={(commerce) => setCard(i, { commerce })} />
                    <Field label="부가 설명 (선택)" value={card.additionalContent} max={LIMITS.additionalContent} onChange={(additionalContent) => setCard(i, { additionalContent })} />
                  </>
                )}
                <ButtonsField buttons={card.buttons} min={verifyOn ? 0 : 1} max={verifyOn ? 1 : 2} nameMax={spec.buttonNameMax} onChange={(buttons) => setCard(i, { buttons })} />
              </div>
            ))}
            {content.cards.length < LIMITS.cardsMax && (
              <button
                type="button"
                onClick={() => set({ cards: [...content.cards, { ...emptyCard(), buttons: [{ name: type === 'CAROUSEL_COMMERCE' ? '주문' : '자세히', link: content.cards[0]?.buttons[0]?.link ?? '' }] }] })}
                className="inline-flex w-max items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> 카드 추가 ({content.cards.length}/{LIMITS.cardsMax})
              </button>
            )}
          </>
        )}

        {type !== 'CAROUSEL_FEED' && type !== 'CAROUSEL_COMMERCE' && (
          <ButtonsField buttons={content.buttons} min={Math.max(0, (spec.buttonsMin ?? 0) - (verifyOn ? 1 : 0))} max={buttonsMax} nameMax={spec.buttonNameMax} onChange={(buttons) => set({ buttons })} />
        )}

        {/* 발송 매장 안내 (SENDER_FOOTER_ENABLED 일 때만) */}
        {SENDER_FOOTER_ENABLED && <p className="rounded-[10px] bg-[color:var(--ad-bg-alt)] px-3 py-2.5 text-[12px] leading-[1.55] text-[color:var(--ad-muted)]">
          {footered.placement === 'additional'
            ? <>맨 아래 회색 작은 글씨(부가 설명)로 “<b className="font-medium text-[color:var(--ad-ink-2)]">{senderFooter(footerName || '매장')}</b>”가 자동으로 붙어요.</>
            : footered.placement === 'content'
              ? <>본문 맨 아래 줄에 “<b className="font-medium text-[color:var(--ad-ink-2)]">{senderFooter(footerName || '매장')}</b>”가 자동으로 붙어요. 카카오 규격상 본문과 같은 크기로 보여요.</>
              : type === 'WIDE_ITEM_LIST' || type === 'PREMIUM_VIDEO'
                ? '이 형태는 발송 매장 안내를 넣을 칸이 없어 붙지 않아요.'
                : '글자 수가 꽉 차서 발송 매장 안내가 붙지 않아요. 글을 조금 줄이면 붙어요.'}
        </p>}

        {spec.couponDescMax !== undefined && <CouponField content={content} descMax={spec.couponDescMax} onChange={onContentChange} />}
        <StaffVerifyField
          value={staffVerify}
          onChange={onStaffVerifyChange}
          label="직원 확인 버튼 붙이기"
          hint={`버튼 맨 끝에 “직원 확인” 버튼이 붙어요${type === 'CAROUSEL_FEED' || type === 'CAROUSEL_COMMERCE' ? ' (카드마다)' : ''}. 손님마다 다른 확인 화면이 열리고, 직원이 “사용 완료”를 누르면 마케팅 성과에서 몇 명이 쿠폰을 들고 왔는지 보여요.`}
          contentPlaceholder={content.coupon ? `비우면 “${couponTitle(content.coupon)}”로 보여요` : '예: 하이볼 1잔 무료'}
        />
      </div>

      {/* 4. 비용 · 발송 */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-4">
        <div className="flex items-baseline justify-between text-[13px] text-[color:var(--ad-muted)]">
          <span>
            받는 사람 <b className="font-semibold text-[color:var(--ad-ink)] adm-tnum">{formatNumber(count)}명</b> × {spec.price}원
          </span>
          <b className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--ad-ink)] adm-tnum">{formatNumber(total)}원</b>
        </div>
        {estimate && (
          <div className="flex items-center justify-between text-[12px] text-[color:var(--ad-muted)]">
            <span>충전금 잔액 <span className="adm-tnum">{formatNumber(estimate.walletBalance)}원</span></span>
            {insufficient && (
              <button type="button" onClick={() => onNeedCharge(total, estimate.walletBalance)} className="font-medium text-[color:var(--ad-ink)] underline">
                충전하기
              </button>
            )}
          </div>
        )}
        <SendTimePicker value={sendTime} onChange={setSendTime} />
        {issues.length > 0 && (
          <ul className="grid gap-0.5 text-[12px] text-[color:var(--ad-neg)]">
            {issues.slice(0, 4).map((m) => (
              <li key={m}>· {m}</li>
            ))}
            {issues.length > 4 && <li>· 외 {issues.length - 4}건</li>}
          </ul>
        )}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            disabled={issues.length > 0}
            className="adm-press h-11 rounded-[12px] bg-white px-4 text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
          >
            테스트
          </button>
          <button
            type="button"
            onClick={() => (insufficient && estimate ? onNeedCharge(total, estimate.walletBalance) : setConfirmOpen(true))}
            disabled={!canSend}
            className="adm-press h-11 rounded-[12px] bg-[color:var(--ad-ink)] text-[14px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            {issues.length > 0 ? '고칠 곳이 있어요' : insufficient ? '충전 후 보내기' : sendTime.mode === 'schedule' ? `${formatNumber(count)}명에게 예약하기` : `${formatNumber(count)}명에게 보내기`}
          </button>
        </div>
        <p className="text-center text-[11.5px] text-[color:var(--ad-faint)]">카카오톡을 쓰지 않거나 채널을 차단해 못 받은 건은 자동 환불돼요</p>
      </div>

      {/* 테스트 발송 */}
      <Modal open={testOpen} onOpenChange={setTestOpen}>
        <ModalContent className="rounded-[20px] border-0 sm:max-w-md">
          <ModalHeader>
            <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">내 폰으로 테스트</ModalTitle>
          </ModalHeader>
          <div className="grid gap-2 p-4">
            <Field label="받을 번호" value={testPhone} inputMode="numeric" placeholder="01012345678" onChange={(v) => setTestPhone(v.replace(/[^\d]/g, ''))} />
            <p className="text-[12px] text-[color:var(--ad-muted)]">실제 발송과 똑같이 “태그히어 플레이스”로 가요. 무료이고 하루 5번까지 보낼 수 있어요.</p>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setTestOpen(false)} className="adm-press h-10 flex-1 rounded-[12px] bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]">
              취소
            </button>
            <button type="button" onClick={handleTest} disabled={busy === 'test' || testPhone.length < 10} className="adm-press h-10 flex-1 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white disabled:opacity-40">
              {busy === 'test' ? '보내는 중...' : '테스트 보내기'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 발송 확인 */}
      <Modal open={confirmOpen} onOpenChange={setConfirmOpen}>
        <ModalContent className="rounded-[20px] border-0 sm:max-w-md">
          <ModalHeader>
            <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">{spec.name}으로 {sendTime.mode === 'schedule' ? '예약할까요?' : '보낼까요?'}</ModalTitle>
          </ModalHeader>
          <div className="grid gap-2 p-4 text-[13.5px] text-[color:var(--ad-ink-2)]">
            <div className="flex justify-between"><span>받는 사람</span><b className="adm-tnum">{formatNumber(count)}명</b></div>
            <div className="flex justify-between"><span>건당</span><b className="adm-tnum">{spec.price}원</b></div>
            <div className="flex justify-between border-t border-[color:var(--ad-line)] pt-2"><span>차감 예정</span><b className="adm-tnum text-[color:var(--ad-ink)]">{formatNumber(total)}원</b></div>
            <div className="flex justify-between"><span>발송 시간</span><b>{sendTime.mode === 'schedule' ? `${formatSendTime(sendTime)} 예약` : '지금 바로'}</b></div>
            <p className="text-[12px] text-[color:var(--ad-muted)]">카카오톡이 접수한 건만 차감되고, 끝내 못 받은 건은 환불돼요.</p>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setConfirmOpen(false)} className="adm-press h-10 flex-1 rounded-[12px] bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]">
              취소
            </button>
            <button type="button" onClick={handleSend} disabled={busy === 'send'} className="adm-press h-10 flex-1 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white disabled:opacity-40">
              {busy === 'send' ? '보내는 중...' : sendTime.mode === 'schedule' ? '예약하기' : '보내기'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      </>
      )}
    </ApiContext.Provider>
  );
}

export { emptyContent };
