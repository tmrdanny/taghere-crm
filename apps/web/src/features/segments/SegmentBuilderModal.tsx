'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { normalizeForSearch } from '@/lib/store-search';
import { cn } from '@/lib/utils';
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AGE_GROUP_LABELS,
  MenuCondition,
  SavedSegment,
  SEGMENT_PRESETS,
  SegmentConditions,
  describeConditions,
  hasAnyCondition,
} from './segment-conditions';

const PERIOD_OPTIONS = [
  { value: '', label: '전체 기간' },
  { value: '30', label: '최근 30일' },
  { value: '60', label: '최근 60일' },
  { value: '90', label: '최근 90일' },
  { value: '180', label: '최근 180일' },
  { value: '365', label: '최근 1년' },
];

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

function toNum(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function NumberInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(toNum(e.target.value))}
        placeholder={placeholder}
        className="h-9 w-24 text-[13px]"
      />
      {suffix && <span className="text-[12px] text-[#55595e] whitespace-nowrap">{suffix}</span>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-[12px] border transition-colors',
        active
          ? 'bg-[color:var(--ad-ink)] border-[color:var(--ad-ink)] text-white font-medium'
          : 'bg-white border-[#ebeced] text-[#383c40] hover:border-[#d1d3d6]'
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[] | undefined, item: T): T[] | undefined {
  const next = list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item];
  return next.length ? next : undefined;
}

// 메뉴 조건 한 줄 — 메뉴명 검색 + 다중 선택
function MenuConditionRow({
  value,
  menus,
  onChange,
  onRemove,
}: {
  value: MenuCondition;
  menus: Array<{ name: string; orderCount: number }>;
  onChange: (value: MenuCondition) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const suggestions = useMemo(() => {
    const q = normalizeForSearch(query);
    return menus
      .filter((m) => !value.names.includes(m.name) && (!q || normalizeForSearch(m.name).includes(q)))
      .slice(0, 8);
  }, [menus, query, value.names]);

  return (
    <div className="p-3 rounded-[10px] border border-[#ebeced] bg-[#f8f9fa] space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={value.withinDays ? String(value.withinDays) : ''}
          onChange={(e) => onChange({ ...value, withinDays: e.target.value ? Number(e.target.value) : undefined })}
          className="h-8 px-2 text-[12px] rounded-[8px] border border-[#d1d3d6] bg-white focus:border-[#131651] focus:outline-none"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-[12px] text-[#383c40]">아래 메뉴를</span>
        <select
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as 'ANY' | 'NONE', minOrders: undefined })}
          className="h-8 px-2 text-[12px] rounded-[8px] border border-[#d1d3d6] bg-white focus:border-[#131651] focus:outline-none"
        >
          <option value="ANY">주문한 고객</option>
          <option value="NONE">주문한 적 없는 고객</option>
        </select>
        {value.mode === 'ANY' && (
          <div className="flex items-center gap-1">
            <input
              inputMode="numeric"
              value={value.minOrders ?? ''}
              onChange={(e) => onChange({ ...value, minOrders: toNum(e.target.value) || undefined })}
              placeholder="1"
              className="h-8 w-12 px-2 text-[12px] rounded-[8px] border border-[#d1d3d6] bg-white focus:border-[#131651] focus:outline-none"
            />
            <span className="text-[12px] text-[#383c40]">회 이상</span>
          </div>
        )}
        <button type="button" onClick={onRemove} className="ml-auto p-1 text-[#91959a] hover:text-[#383c40]" aria-label="메뉴 조건 삭제">
          <X className="w-4 h-4" />
        </button>
      </div>

      {value.names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.names.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-white border border-[#ebeced] text-[12px]">
              {name}
              <button
                type="button"
                onClick={() => onChange({ ...value, names: value.names.filter((n) => n !== name) })}
                className="p-0.5 text-[#91959a] hover:text-[#383c40]"
                aria-label={`${name} 제거`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={menus.length ? '메뉴 검색 (여러 개 선택 시 하나라도 해당)' : '주문 메뉴 데이터가 없습니다'}
          className="h-8 text-[12px] bg-white"
          disabled={menus.length === 0}
        />
        {query && suggestions.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-[8px] border border-[#ebeced] bg-white divide-y divide-[#ebeced]">
            {suggestions.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => {
                  onChange({ ...value, names: [...value.names, m.name] });
                  setQuery('');
                }}
                className="w-full flex justify-between px-3 py-1.5 text-[12px] text-left hover:bg-[#f8f9fa]"
              >
                <span>{m.name}</span>
                <span className="text-[#91959a]">주문 {m.orderCount.toLocaleString()}건</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SegmentBuilderModal({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SavedSegment | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [cond, setCond] = useState<SegmentConditions>({});
  const [menus, setMenus] = useState<Array<{ name: string; orderCount: number }>>([]);
  const [counts, setCounts] = useState<{ total: number; reachable: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  // 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setCond(initial?.conditions ?? {});
    setError('');
    setCounts(null);
  }, [open, initial]);

  // 메뉴 목록 (최근 1년 주문 기준)
  useEffect(() => {
    if (!open || menus.length > 0) return;
    fetch(`${API_BASE}/api/segments/menus?days=365`, { headers: authHeader() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.menus && setMenus(data.menus))
      .catch(() => {});
  }, [open, menus.length]);

  // 조건 변경 시 대상 수 미리보기 (디바운스, 마지막 요청만 반영)
  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    setCounting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/segments/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ conditions: cond }),
        });
        const data = await res.json();
        if (seq === requestSeq.current && res.ok) setCounts({ total: data.total, reachable: data.reachable });
      } catch {
        // 미리보기 실패는 저장을 막지 않는다
      } finally {
        if (seq === requestSeq.current) setCounting(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [open, cond]);

  const set = (patch: Partial<SegmentConditions>) =>
    setCond((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(next) as Array<keyof SegmentConditions>) {
        if (next[key] === undefined) delete next[key];
      }
      return next;
    });

  const updateMenu = (index: number, value: MenuCondition) =>
    set({ menus: (cond.menus ?? []).map((m, i) => (i === index ? value : m)) });
  const removeMenu = (index: number) => {
    const next = (cond.menus ?? []).filter((_, i) => i !== index);
    set({ menus: next.length ? next : undefined });
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) return setError('세그먼트 이름을 입력해주세요.');
    const cleaned: SegmentConditions = {
      ...cond,
      menus: cond.menus?.filter((m) => m.names.length > 0),
    };
    if (!cleaned.menus?.length) delete cleaned.menus;
    if (!hasAnyCondition(cleaned)) return setError('조건을 하나 이상 설정해주세요.');

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/segments${initial ? `/${initial.id}` : ''}`, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ name: name.trim(), conditions: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const summary = describeConditions(cond);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-2xl">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">{initial ? '세그먼트 수정' : '세그먼트 만들기'}</ModalTitle>
        </ModalHeader>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[13px] font-medium text-[#383c40]">이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아메리카노 단골" className="mt-1.5" maxLength={50} />
          </div>

          {!initial && (
            <div>
              <p className="text-[13px] font-medium text-[#383c40] mb-1.5">빠른 시작</p>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setCond(p.conditions());
                      if (!name.trim()) setName(p.label);
                    }}
                    title={p.description}
                    className="px-3 py-1.5 rounded-full text-[12px] border border-[#ebeced] bg-white hover:border-[#91959a]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 방문 */}
          <section className="space-y-2">
            <p className="text-[13px] font-medium text-[#383c40]">방문</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-[#55595e] w-16">방문 횟수</span>
                <NumberInput value={cond.visitCountMin} onChange={(v) => set({ visitCountMin: v })} placeholder="최소" />
                <span className="text-[12px] text-[#91959a]">~</span>
                <NumberInput value={cond.visitCountMax} onChange={(v) => set({ visitCountMax: v })} placeholder="최대" suffix="회" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-[#55595e] w-16">최근 방문</span>
                <NumberInput value={cond.lastVisitWithinDays} onChange={(v) => set({ lastVisitWithinDays: v || undefined })} suffix="일 이내" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-[#55595e]">또는 마지막 방문 후</span>
                <NumberInput value={cond.lastVisitOverDays} onChange={(v) => set({ lastVisitOverDays: v || undefined })} suffix="일 이상 지남" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#55595e] w-16">등록일</span>
              <NumberInput value={cond.joinedWithinDays} onChange={(v) => set({ joinedWithinDays: v || undefined })} suffix="일 이내 등록" />
            </div>
          </section>

          {/* 결제 */}
          <section className="space-y-2">
            <p className="text-[13px] font-medium text-[#383c40]">결제</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#55595e] w-16">누적 결제</span>
              <NumberInput value={cond.totalSpentMin} onChange={(v) => set({ totalSpentMin: v })} placeholder="최소" />
              <span className="text-[12px] text-[#91959a]">~</span>
              <NumberInput value={cond.totalSpentMax} onChange={(v) => set({ totalSpentMax: v })} placeholder="최대" suffix="원" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#55595e] w-16">객단가</span>
              <NumberInput value={cond.avgSpendMin} onChange={(v) => set({ avgSpendMin: v })} suffix="원 이상" />
            </div>
          </section>

          {/* 주문 메뉴 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-[#383c40]">주문 메뉴</p>
              {(cond.menus?.length ?? 0) < 5 && (
                <button
                  type="button"
                  onClick={() => set({ menus: [...(cond.menus ?? []), { names: [], mode: 'ANY' }] })}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#2a2d62] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  메뉴 조건 추가
                </button>
              )}
            </div>
            {(cond.menus ?? []).map((m, i) => (
              <MenuConditionRow key={i} value={m} menus={menus} onChange={(v) => updateMenu(i, v)} onRemove={() => removeMenu(i)} />
            ))}
            {!cond.menus?.length && (
              <p className="text-[12px] text-[#91959a]">태그히어 주문 연동 매장은 주문한 메뉴로 고객을 나눌 수 있습니다.</p>
            )}
          </section>

          {/* 고객 정보 */}
          <section className="space-y-2">
            <p className="text-[13px] font-medium text-[#383c40]">고객 정보</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!!cond.genders?.includes('FEMALE')} onClick={() => set({ genders: toggle(cond.genders, 'FEMALE') })}>여성</Chip>
              <Chip active={!!cond.genders?.includes('MALE')} onClick={() => set({ genders: toggle(cond.genders, 'MALE') })}>남성</Chip>
              <span className="w-px bg-[#d1d3d6] mx-1" />
              {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
                <Chip key={value} active={!!cond.ageGroups?.includes(value)} onClick={() => set({ ageGroups: toggle(cond.ageGroups, value) })}>
                  {label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[12px] text-[#55595e] self-center mr-1">생일</span>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <Chip key={m} active={!!cond.birthdayMonths?.includes(m)} onClick={() => set({ birthdayMonths: toggle(cond.birthdayMonths, m) })}>
                  {m}월
                </Chip>
              ))}
            </div>
          </section>
        </div>

        {/* 미리보기 */}
        <div className="px-4 py-3 border-t border-[#ebeced] bg-[#f8f9fa]">
          <p className="text-[12px] text-[#55595e] min-h-[1rem]">{summary.length ? summary.join(' · ') : '조건을 선택하세요 (조건 없음 = 전체 고객)'}</p>
          <p className="mt-1 text-[13px] text-[#1d2022]">
            {counts ? (
              <>
                해당 고객 <b>{counts.total.toLocaleString()}명</b> · 발송 가능(수신 동의){' '}
                <b className="tabular-nums font-semibold text-[color:var(--ad-ink)]">{counts.reachable.toLocaleString()}명</b>
                {counting && <span className="ml-2 text-[12px] text-[#91959a]">계산 중...</span>}
              </>
            ) : (
              <span className="text-[#91959a]">계산 중...</span>
            )}
          </p>
          {error && <p className="mt-1 text-[12px] text-[#cc0832]">{error}</p>}
        </div>

        <ModalFooter className="flex-shrink-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
            {saving ? '저장 중...' : '저장'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
