'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { normalizeForSearch } from '@/lib/store-search';
import { cn } from '@/lib/utils';
import { Modal, ModalContent, ModalTitle } from '@/components/ui/modal';
import {
  AGE_GROUP_LABELS,
  MenuCondition,
  SavedSegment,
  SEGMENT_PRESETS,
  SegmentConditions,
  describeConditions,
  filterOnly,
  hasAnyCondition,
} from './segment-conditions';

/**
 * 고객 그룹 만들기 / 수정 — 왼쪽 조건, 오른쪽 실시간 명단.
 * 그룹 = 조건에 맞는 손님 + 직접 추가(includeIds) − 직접 제외(excludeIds).
 * 명단에서 체크를 풀면 제외, "손님 찾아 추가"에서 체크하면 직접 추가된다.
 * 사장님(/api/segments)·프랜차이즈(/api/franchise/segments)가 함께 쓴다.
 */

const PERIOD_OPTIONS = [
  { value: '', label: '전체 기간' },
  { value: '30', label: '최근 30일' },
  { value: '60', label: '최근 60일' },
  { value: '90', label: '최근 90일' },
  { value: '180', label: '최근 180일' },
  { value: '365', label: '최근 1년' },
];

interface MemberRow {
  id: string;
  name: string | null;
  phone: string | null;
  storeName: string | null;
  gender: string | null;
  visitCount: number;
  totalStamps: number;
  totalPoints: number;
  visitSource: string | null;
  lastVisitAt: string | null;
  reachable: boolean;
  matched: boolean;
}

interface Summary {
  matched: number;
  pickedExtra: number;
  excludedMatched: number;
  total: number;
  reachable: number;
}

function toNum(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

const fieldCls =
  'h-9 w-full rounded-[9px] border border-[color:var(--ad-line-strong)] bg-white px-2.5 text-[13px] tabular-nums text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none';

function NumberField({ value, onChange, placeholder, ariaLabel }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; ariaLabel: string }) {
  return (
    <input
      inputMode="numeric"
      value={value === undefined ? '' : value.toLocaleString()}
      onChange={(e) => onChange(toNum(e.target.value))}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={fieldCls}
    />
  );
}

/** 라벨 | [최소] ~ [최대] 단위 */
function RangeRow({
  label,
  min,
  max,
  onMin,
  onMax,
  unit,
  maxless,
}: {
  label: string;
  min: number | undefined;
  max?: number | undefined;
  onMin: (v: number | undefined) => void;
  onMax?: (v: number | undefined) => void;
  unit: string;
  /** 최소만 받는 칸 (예: "N원 이상") */
  maxless?: boolean;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[12.5px] text-[color:var(--ad-ink-2)]">{label}</span>
      {maxless ? (
        <div className="flex items-center gap-1.5">
          <div className="w-28"><NumberField value={min} onChange={onMin} ariaLabel={`${label} 이상`} /></div>
          <span className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)]">{unit} 이상</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <NumberField value={min} onChange={onMin} placeholder="최소" ariaLabel={`${label} 최소`} />
          <span className="text-[12px] text-[color:var(--ad-faint)]">~</span>
          <NumberField value={max} onChange={onMax!} placeholder="최대" ariaLabel={`${label} 최대`} />
          <span className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)]">{unit}</span>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-full border px-3 text-[12.5px] transition-colors',
        active
          ? 'border-[color:var(--ad-ink)] bg-[color:var(--ad-ink)] font-medium text-white'
          : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-ink-2)]'
      )}
    >
      {children}
    </button>
  );
}

/** 접는 조건 묶음 — 설정된 조건 수를 제목 옆에 보여준다 */
function Section({ title, count, open, onToggle, children }: { title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">{title}</span>
        {count > 0 && (
          <span className="rounded-full bg-[color:var(--ad-ink)] px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums">{count}</span>
        )}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-[color:var(--ad-faint)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="grid gap-3 px-4 pb-4">{children}</div>}
    </section>
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
    return menus.filter((m) => !value.names.includes(m.name) && (!q || normalizeForSearch(m.name).includes(q))).slice(0, 8);
  }, [menus, query, value.names]);
  const selectCls = 'h-8 rounded-[8px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[12px] focus:border-[color:var(--ad-ink)] focus:outline-none';

  return (
    <div className="grid gap-2 rounded-[10px] bg-[color:var(--ad-bg-alt)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={value.withinDays ? String(value.withinDays) : ''} onChange={(e) => onChange({ ...value, withinDays: e.target.value ? Number(e.target.value) : undefined })} className={selectCls} aria-label="기간">
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as 'ANY' | 'NONE', minOrders: undefined })} className={selectCls} aria-label="주문 여부">
          <option value="ANY">주문한 손님</option>
          <option value="NONE">주문 안 한 손님</option>
        </select>
        {value.mode === 'ANY' && (
          <span className="flex items-center gap-1 text-[12px] text-[color:var(--ad-ink-2)]">
            <input
              inputMode="numeric"
              value={value.minOrders ?? ''}
              onChange={(e) => onChange({ ...value, minOrders: toNum(e.target.value) || undefined })}
              placeholder="1"
              aria-label="최소 주문 횟수"
              className="h-8 w-11 rounded-[8px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[12px] focus:border-[color:var(--ad-ink)] focus:outline-none"
            />
            회 이상
          </span>
        )}
        <button type="button" onClick={onRemove} className="ml-auto rounded p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]" aria-label="메뉴 조건 삭제">
          <X className="h-4 w-4" />
        </button>
      </div>
      {value.names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.names.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)]">
              {name}
              <button type="button" onClick={() => onChange({ ...value, names: value.names.filter((n) => n !== name) })} className="p-0.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]" aria-label={`${name} 빼기`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={menus.length ? '메뉴 검색 (여러 개면 하나라도 해당)' : '주문 메뉴 데이터가 없어요'}
          disabled={menus.length === 0}
          className={cn(fieldCls, 'h-8 text-[12.5px]')}
        />
        {query && suggestions.length > 0 && (
          <div className="absolute inset-x-0 top-9 z-10 max-h-44 overflow-y-auto rounded-[10px] bg-white shadow-[0_12px_30px_-12px_rgba(19,22,81,0.35),inset_0_0_0_1px_var(--ad-line)]">
            {suggestions.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => {
                  onChange({ ...value, names: [...value.names, m.name] });
                  setQuery('');
                }}
                className="flex w-full justify-between px-3 py-2 text-left text-[12.5px] hover:bg-[color:var(--ad-bg-alt)]"
              >
                <span className="truncate">{m.name}</span>
                <span className="ml-2 flex-none text-[color:var(--ad-faint)]">주문 {m.orderCount.toLocaleString()}건</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const lastVisitLabel = (iso: string | null) => {
  if (!iso) return '방문 없음';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return '오늘';
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
};

export function SegmentBuilderModal({
  open,
  onOpenChange,
  initial,
  draft,
  onSaved,
  apiPath = '/api/segments',
  tokenKey = 'token',
  scopeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SavedSegment | null;
  /** 새 그룹을 미리 채워 열 때 (고객 리스트의 필터·선택 손님 등) */
  draft?: { name?: string; conditions?: SegmentConditions } | null;
  /** 저장된 고객 그룹을 넘겨준다 (새로 만든 그룹을 바로 선택할 때 사용) */
  onSaved: (segment?: SavedSegment) => void;
  /** 사장님: /api/segments, 프랜차이즈: /api/franchise/segments */
  apiPath?: string;
  tokenKey?: string;
  /** 대상 범위 안내 (예: '전 가맹점 고객 기준') */
  scopeLabel?: string;
}) {
  const authHeader = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` }), [tokenKey]);
  const [name, setName] = useState('');
  const [cond, setCond] = useState<SegmentConditions>({});
  const [menus, setMenus] = useState<Array<{ name: string; orderCount: number }>>([]);
  const [sources, setSources] = useState<Array<{ value: string; label: string; count: number }>>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // 오른쪽 명단
  const [tab, setTab] = useState<'group' | 'search'>('group');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [multiStore, setMultiStore] = useState(false);
  const [mobilePane, setMobilePane] = useState<'conditions' | 'list'>('conditions');
  const summarySeq = useRef(0);
  const listSeq = useRef(0);

  // 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    const start = initial?.conditions ?? draft?.conditions ?? {};
    setName(initial?.name ?? draft?.name ?? '');
    setCond(start);
    setError('');
    setSummary(null);
    setQ('');
    setTab('group');
    setRows([]);
    setMobilePane(start.includeIds?.length ? 'list' : 'conditions');
    const f = filterOnly(start);
    setOpenSections({
      visit: !Object.keys(f).length || f.visitCountMin !== undefined || f.visitCountMax !== undefined || f.lastVisitWithinDays !== undefined || f.lastVisitOverDays !== undefined || f.joinedWithinDays !== undefined,
      reward: f.stampsMin !== undefined || f.stampsMax !== undefined || f.pointsMin !== undefined || f.pointsMax !== undefined || f.earnedPointsMin !== undefined,
      spend: f.totalSpentMin !== undefined || f.totalSpentMax !== undefined || f.avgSpendMin !== undefined,
      menu: !!f.menus?.length,
      profile: !!(f.genders?.length || f.ageGroups?.length || f.birthdayMonths?.length),
      source: !!f.visitSources?.length,
    });
  }, [open, initial, draft]);

  // 메뉴·방문 경로 선택지
  useEffect(() => {
    if (!open) return;
    if (menus.length === 0) {
      fetch(`${API_BASE}${apiPath}/menus?days=365`, { headers: authHeader() })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.menus && setMenus(data.menus))
        .catch(() => {});
    }
    if (sources.length === 0) {
      fetch(`${API_BASE}${apiPath}/visit-sources`, { headers: authHeader() })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.sources && setSources(data.sources))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiPath]);

  // 인원 요약 — 조건·추가·제외가 바뀔 때마다 (디바운스, 마지막 요청만 반영)
  useEffect(() => {
    if (!open) return;
    const seq = ++summarySeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}${apiPath}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ conditions: cond }),
        });
        const data = await res.json();
        if (seq === summarySeq.current && res.ok) setSummary(data);
      } catch {
        // 요약 실패는 저장을 막지 않는다
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [open, cond, apiPath, authHeader]);

  // 명단 — 조건(추가·제외 제외)·탭·검색어가 바뀔 때만 다시 불러온다 (체크할 때 목록이 튀지 않게)
  const filterKey = JSON.stringify(filterOnly(cond));
  const includeRef = useRef<string[] | undefined>(undefined);
  includeRef.current = cond.includeIds;
  const loadRows = useCallback(
    async (offset: number) => {
      const seq = ++listSeq.current;
      setListLoading(true);
      try {
        const res = await fetch(`${API_BASE}${apiPath}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ conditions: { ...JSON.parse(filterKey), includeIds: includeRef.current }, mode: tab, q, offset, limit: 50 }),
        });
        const data = await res.json();
        if (seq !== listSeq.current || !res.ok) return;
        setRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]));
        setHasMore(!!data.hasMore);
        setMultiStore(!!data.multiStore);
      } catch {
        // 명단을 못 불러와도 조건 저장은 할 수 있다
      } finally {
        if (seq === listSeq.current) setListLoading(false);
      }
    },
    [apiPath, authHeader, filterKey, tab, q]
  );
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => loadRows(0), 350);
    return () => clearTimeout(timer);
  }, [open, loadRows]);

  const set = (patch: Partial<SegmentConditions>) =>
    setCond((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(next) as Array<keyof SegmentConditions>) {
        if (next[key] === undefined) delete next[key];
      }
      return next;
    });

  const includeSet = useMemo(() => new Set(cond.includeIds ?? []), [cond.includeIds]);
  const excludeSet = useMemo(() => new Set(cond.excludeIds ?? []), [cond.excludeIds]);
  const isMember = (r: MemberRow) => includeSet.has(r.id) || (r.matched && !excludeSet.has(r.id));

  const toggleRow = (r: MemberRow) => {
    const include = new Set(includeSet);
    const exclude = new Set(excludeSet);
    if (isMember(r)) {
      if (include.has(r.id)) include.delete(r.id);
      if (r.matched) exclude.add(r.id);
    } else if (r.matched) {
      exclude.delete(r.id);
    } else {
      include.add(r.id);
    }
    set({ includeIds: include.size ? [...include] : undefined, excludeIds: exclude.size ? [...exclude] : undefined });
  };

  const updateMenu = (index: number, value: MenuCondition) => set({ menus: (cond.menus ?? []).map((m, i) => (i === index ? value : m)) });
  const removeMenu = (index: number) => {
    const next = (cond.menus ?? []).filter((_, i) => i !== index);
    set({ menus: next.length ? next : undefined });
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) return setError('그룹 이름을 입력해 주세요.');
    const cleaned: SegmentConditions = { ...cond, menus: cond.menus?.filter((m) => m.names.length > 0) };
    if (!cleaned.menus?.length) delete cleaned.menus;
    if (!hasAnyCondition(cleaned)) return setError('조건을 고르거나 손님을 직접 추가해 주세요.');

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}${apiPath}${initial ? `/${initial.id}` : ''}`, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ name: name.trim(), conditions: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.');
      onSaved(data.segment);
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const f = filterOnly(cond);
  const counts = {
    visit: ['visitCountMin', 'visitCountMax', 'lastVisitWithinDays', 'lastVisitOverDays', 'joinedWithinDays'].filter((k) => (f as any)[k] !== undefined).length,
    reward: ['stampsMin', 'stampsMax', 'pointsMin', 'pointsMax', 'earnedPointsMin'].filter((k) => (f as any)[k] !== undefined).length,
    spend: ['totalSpentMin', 'totalSpentMax', 'avgSpendMin'].filter((k) => (f as any)[k] !== undefined).length,
    menu: f.menus?.length ?? 0,
    profile: (f.genders?.length ? 1 : 0) + (f.ageGroups?.length ? 1 : 0) + (f.birthdayMonths?.length ? 1 : 0),
    source: f.visitSources?.length ? 1 : 0,
  };
  const toggleSection = (key: string) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  const hasFilter = Object.keys(f).length > 0;
  const described = describeConditions(f);
  const pickedCount = cond.includeIds?.length ?? 0;
  // 조건 248 + 직접 추가 2 − 제외 1
  const breakdown: string[] = [];
  if (summary) {
    if (hasFilter) breakdown.push(`조건 ${summary.matched.toLocaleString()}`);
    if (summary.pickedExtra > 0) breakdown.push(`${breakdown.length ? '+ ' : ''}직접 추가 ${summary.pickedExtra.toLocaleString()}`);
    if (summary.excludedMatched > 0) breakdown.push(`− 제외 ${summary.excludedMatched.toLocaleString()}`);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="flex h-[min(880px,94dvh)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-[22px] border-0 p-0 shadow-[0_32px_80px_-24px_rgba(19,22,81,0.45)] sm:max-w-[1120px]">
        {/* 헤더 — 제목 + 이름 */}
        <div className="flex flex-col gap-3 border-b border-[color:var(--ad-line)] px-5 pb-4 pt-5 pr-14 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
          <ModalTitle className="flex-none text-[17px] font-semibold tracking-[-0.3px] text-[color:var(--ad-ink)]">
            {initial ? '고객 그룹 수정' : '고객 그룹 만들기'}
          </ModalTitle>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="그룹 이름 (예: 아메리카노 단골, 두 달째 안 온 손님)"
            maxLength={50}
            aria-label="그룹 이름"
            className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3.5 text-[14px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none sm:max-w-[420px]"
          />
        </div>

        {/* 모바일: 조건 / 명단 전환 */}
        <div className="flex gap-1 border-b border-[color:var(--ad-line)] p-2 lg:hidden" role="tablist">
          {[
            { key: 'conditions' as const, label: `조건${hasFilter ? ` ${Object.keys(f).length}` : ''}` },
            { key: 'list' as const, label: `명단${summary ? ` ${summary.total.toLocaleString()}명` : ''}` },
          ].map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={mobilePane === t.key}
              onClick={() => setMobilePane(t.key)}
              className={cn('h-9 flex-1 rounded-[9px] text-[13px] font-medium', mobilePane === t.key ? 'bg-[color:var(--ad-ink)] text-white' : 'text-[color:var(--ad-muted)]')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* 왼쪽 — 조건 */}
          <div className={cn('min-h-0 overflow-y-auto bg-[color:var(--ad-bg-alt)] px-4 py-4 lg:block lg:border-r lg:border-[color:var(--ad-line)]', mobilePane === 'conditions' ? 'block' : 'hidden')}>
            <div className="grid gap-3">
              {!initial && (
                <div>
                  <p className="mb-2 text-[12px] font-medium text-[color:var(--ad-muted)]">빠른 시작</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGMENT_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCond((prev) => ({ ...p.conditions(), includeIds: prev.includeIds, excludeIds: prev.excludeIds }));
                          if (!name.trim()) setName(p.label);
                          setOpenSections((s) => ({ ...s, visit: true, spend: s.spend || p.label === '큰손', profile: s.profile || p.label === '이번 달 생일' }));
                        }}
                        title={p.description}
                        className="h-8 rounded-full bg-white px-3 text-[12.5px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ad-ink-2)]"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Section title="방문" count={counts.visit} open={!!openSections.visit} onToggle={() => toggleSection('visit')}>
                <RangeRow label="방문 횟수" min={cond.visitCountMin} max={cond.visitCountMax} onMin={(v) => set({ visitCountMin: v })} onMax={(v) => set({ visitCountMax: v })} unit="회" />
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                  <span className="text-[12.5px] text-[color:var(--ad-ink-2)]">최근 방문</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-20"><NumberField value={cond.lastVisitWithinDays} onChange={(v) => set({ lastVisitWithinDays: v || undefined })} ariaLabel="최근 N일 안에 방문" /></div>
                    <span className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)]">일 안에 방문</span>
                  </div>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                  <span className="text-[12.5px] text-[color:var(--ad-ink-2)]">미방문</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-20"><NumberField value={cond.lastVisitOverDays} onChange={(v) => set({ lastVisitOverDays: v || undefined })} ariaLabel="마지막 방문 후 N일 이상" /></div>
                    <span className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)]">일 넘게 안 옴</span>
                  </div>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                  <span className="text-[12.5px] text-[color:var(--ad-ink-2)]">등록</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-20"><NumberField value={cond.joinedWithinDays} onChange={(v) => set({ joinedWithinDays: v || undefined })} ariaLabel="최근 N일 안에 등록" /></div>
                    <span className="whitespace-nowrap text-[12px] text-[color:var(--ad-muted)]">일 안에 처음 옴</span>
                  </div>
                </div>
              </Section>

              <Section title="스탬프 · 포인트" count={counts.reward} open={!!openSections.reward} onToggle={() => toggleSection('reward')}>
                <RangeRow label="스탬프" min={cond.stampsMin} max={cond.stampsMax} onMin={(v) => set({ stampsMin: v })} onMax={(v) => set({ stampsMax: v })} unit="개" />
                <RangeRow label="보유 포인트" min={cond.pointsMin} max={cond.pointsMax} onMin={(v) => set({ pointsMin: v })} onMax={(v) => set({ pointsMax: v })} unit="P" />
                <RangeRow label="누적 적립" min={cond.earnedPointsMin} onMin={(v) => set({ earnedPointsMin: v })} unit="P" maxless />
              </Section>

              <Section title="결제" count={counts.spend} open={!!openSections.spend} onToggle={() => toggleSection('spend')}>
                <RangeRow label="누적 결제" min={cond.totalSpentMin} max={cond.totalSpentMax} onMin={(v) => set({ totalSpentMin: v })} onMax={(v) => set({ totalSpentMax: v })} unit="원" />
                <RangeRow label="객단가" min={cond.avgSpendMin} onMin={(v) => set({ avgSpendMin: v })} unit="원" maxless />
              </Section>

              <Section title="고객 정보" count={counts.profile} open={!!openSections.profile} onToggle={() => toggleSection('profile')}>
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={!!cond.genders?.includes('FEMALE')} onClick={() => set({ genders: toggle(cond.genders, 'FEMALE') })}>여성</Chip>
                  <Chip active={!!cond.genders?.includes('MALE')} onClick={() => set({ genders: toggle(cond.genders, 'MALE') })}>남성</Chip>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
                    <Chip key={value} active={!!cond.ageGroups?.includes(value)} onClick={() => set({ ageGroups: toggle(cond.ageGroups, value) })}>{label}</Chip>
                  ))}
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] text-[color:var(--ad-muted)]">생일</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <Chip key={m} active={!!cond.birthdayMonths?.includes(m)} onClick={() => set({ birthdayMonths: toggle(cond.birthdayMonths, m) })}>{m}월</Chip>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="방문 경로" count={counts.source} open={!!openSections.source} onToggle={() => toggleSection('source')}>
                {sources.length === 0 ? (
                  <p className="text-[12.5px] text-[color:var(--ad-faint)]">아직 방문 경로를 답한 손님이 없어요.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((s) => (
                      <Chip key={s.value} active={!!cond.visitSources?.includes(s.value)} onClick={() => set({ visitSources: toggle(cond.visitSources, s.value) })}>
                        {s.label} <span className={cn('ml-0.5 tabular-nums', cond.visitSources?.includes(s.value) ? 'text-white/70' : 'text-[color:var(--ad-faint)]')}>{s.count.toLocaleString()}</span>
                      </Chip>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="주문 메뉴" count={counts.menu} open={!!openSections.menu} onToggle={() => toggleSection('menu')}>
                {(cond.menus ?? []).map((m, i) => (
                  <MenuConditionRow key={i} value={m} menus={menus} onChange={(v) => updateMenu(i, v)} onRemove={() => removeMenu(i)} />
                ))}
                {(cond.menus?.length ?? 0) < 5 && (
                  <button
                    type="button"
                    onClick={() => set({ menus: [...(cond.menus ?? []), { names: [], mode: 'ANY' }] })}
                    className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-[10px] text-[12.5px] font-medium text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:text-[color:var(--ad-ink)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> 메뉴 조건 추가
                  </button>
                )}
                {!cond.menus?.length && <p className="text-[12px] text-[color:var(--ad-faint)]">태그히어 주문 연동 매장은 주문한 메뉴로 손님을 나눌 수 있어요.</p>}
              </Section>
            </div>
          </div>

          {/* 오른쪽 — 명단 */}
          <div className={cn('min-h-0 flex-col lg:flex', mobilePane === 'list' ? 'flex' : 'hidden')}>
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--ad-line)] px-4 py-3 sm:px-5">
              <div className="flex rounded-[10px] bg-[color:var(--ad-bg)] p-[3px]" role="tablist" aria-label="명단 보기">
                <button
                  role="tab"
                  aria-selected={tab === 'group'}
                  onClick={() => {
                    setTab('group');
                    setQ('');
                  }}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium', tab === 'group' ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
                >
                  <Users className="h-3.5 w-3.5" /> 그룹 명단
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'search'}
                  onClick={() => {
                    setTab('search');
                    setQ('');
                  }}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium', tab === 'search' ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
                >
                  <UserPlus className="h-3.5 w-3.5" /> 손님 찾아 추가
                </button>
              </div>
              <label className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ad-faint)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tab === 'search' ? '이름 또는 전화번호 뒤 4자리' : '명단에서 찾기'}
                  aria-label="손님 검색"
                  className={cn(fieldCls, 'pl-8')}
                />
              </label>
            </div>

            <p className="px-4 pt-2.5 text-[12px] text-[color:var(--ad-faint)] sm:px-5">
              {tab === 'group'
                ? '체크를 풀면 그룹에서 빠져요. 조건과 상관없이 넣고 싶은 손님은 "손님 찾아 추가"에서 골라요.'
                : '체크한 손님은 조건과 상관없이 그룹에 들어가요.'}
            </p>

            {/* 열 제목 */}
            <div
              className={cn(
                'mt-2 hidden items-center gap-3 border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] px-4 py-2 text-[11.5px] font-medium text-[color:var(--ad-muted)] sm:grid sm:px-5',
                'sm:grid-cols-[24px_minmax(0,1.6fr)_56px_56px_72px_minmax(0,1fr)_72px]'
              )}
            >
              <span />
              <span>손님</span>
              <span className="text-right">방문</span>
              <span className="text-right">스탬프</span>
              <span className="text-right">포인트</span>
              <span>방문 경로</span>
              <span className="text-right">마지막 방문</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 && listLoading ? (
                <div className="grid gap-px p-4 sm:px-5" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-[10px] bg-[color:var(--ad-bg-alt)]" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="grid place-items-center px-6 py-16 text-center">
                  <Users className="mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
                  <p className="text-[13.5px] font-medium text-[color:var(--ad-ink-2)]">
                    {tab === 'search' ? (q ? '찾는 손님이 없어요' : '이름이나 전화번호로 손님을 찾아보세요') : hasFilter ? '조건에 맞는 손님이 없어요' : '아직 그룹에 손님이 없어요'}
                  </p>
                  {tab === 'group' && (
                    <p className="mt-1 text-[12.5px] text-[color:var(--ad-faint)]">
                      {hasFilter ? '조건을 넓히거나 "손님 찾아 추가"로 직접 넣어보세요.' : '왼쪽에서 조건을 고르거나 "손님 찾아 추가"에서 직접 골라보세요.'}
                    </p>
                  )}
                </div>
              ) : (
                <ul className={cn('divide-y divide-[color:var(--ad-line)]', listLoading && 'opacity-60')}>
                  {rows.map((r) => {
                    const member = isMember(r);
                    const picked = includeSet.has(r.id);
                    const excluded = r.matched && excludeSet.has(r.id);
                    const sourceLabel = r.visitSource ? sources.find((s) => s.value === r.visitSource)?.label ?? r.visitSource : '-';
                    return (
                      <li key={r.id}>
                        <label
                          className={cn(
                            'grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--ad-bg-alt)] sm:px-5',
                            'sm:grid-cols-[24px_minmax(0,1.6fr)_56px_56px_72px_minmax(0,1fr)_72px]',
                            !member && 'text-[color:var(--ad-faint)]'
                          )}
                        >
                          <input type="checkbox" checked={member} onChange={() => toggleRow(r)} className="sr-only" aria-label={`${r.name ?? '이름 없음'} ${member ? '그룹에서 빼기' : '그룹에 넣기'}`} />
                          <span
                            aria-hidden
                            className={cn(
                              'grid h-[18px] w-[18px] place-items-center rounded-[5px] transition-colors',
                              member ? 'bg-[color:var(--ad-ink)] text-white' : 'bg-white shadow-[inset_0_0_0_1.5px_var(--ad-line-strong)]'
                            )}
                          >
                            {member && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className={cn('truncate text-[13.5px] font-medium', member ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]')}>{r.name || '이름 없음'}</span>
                              {picked && <span className="flex-none rounded-full bg-[#eaf3ff] px-1.5 text-[10.5px] font-semibold leading-[17px] text-[#2f6fd6]">직접 추가</span>}
                              {excluded && <span className="flex-none rounded-full bg-[color:var(--ad-bg)] px-1.5 text-[10.5px] font-semibold leading-[17px] text-[color:var(--ad-muted)]">제외됨</span>}
                              {!r.reachable && <span className="flex-none text-[10.5px] text-[color:var(--ad-faint)]" title="마케팅 수신 동의가 없거나 번호가 없어 메시지는 가지 않아요">수신 X</span>}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] tabular-nums text-[color:var(--ad-faint)]">
                              {r.phone ?? '번호 없음'}
                              {r.gender ? ` · ${r.gender === 'MALE' ? '남' : '여'}` : ''}
                              {multiStore && r.storeName ? ` · ${r.storeName}` : ''}
                              <span className="sm:hidden"> · 방문 {r.visitCount}회 · 스탬프 {r.totalStamps} · {r.totalPoints.toLocaleString()}P · {lastVisitLabel(r.lastVisitAt)}</span>
                            </span>
                          </span>
                          <span className="hidden text-right text-[13px] tabular-nums sm:block">{r.visitCount.toLocaleString()}</span>
                          <span className="hidden text-right text-[13px] tabular-nums sm:block">{r.totalStamps.toLocaleString()}</span>
                          <span className="hidden text-right text-[13px] tabular-nums sm:block">{r.totalPoints.toLocaleString()}</span>
                          <span className="hidden truncate text-[12.5px] sm:block">{sourceLabel}</span>
                          <span className="hidden text-right text-[12.5px] sm:block">{lastVisitLabel(r.lastVisitAt)}</span>
                        </label>
                      </li>
                    );
                  })}
                  {hasMore && (
                    <li className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => loadRows(rows.length)}
                        disabled={listLoading}
                        className="h-9 rounded-[10px] px-4 text-[12.5px] font-medium text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:text-[color:var(--ad-ink)] disabled:opacity-50"
                      >
                        {listLoading ? '불러오는 중...' : '더 보기'}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 하단 — 요약 + 저장 (항상 고정) */}
        <div className="flex flex-col gap-3 border-t border-[color:var(--ad-line)] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-[color:var(--ad-muted)]">
              {described.length ? described.join(' · ') : pickedCount ? '직접 고른 손님만' : '조건을 고르거나 손님을 직접 골라 주세요'}
              {scopeLabel && <span className="text-[color:var(--ad-faint)]"> · {scopeLabel}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] text-[color:var(--ad-ink-2)]">
              {summary ? (
                <>
                  <span className="text-[15px] font-semibold text-[color:var(--ad-ink)] tabular-nums">그룹 {summary.total.toLocaleString()}명</span>
                  <span className="tabular-nums">발송 가능 {summary.reachable.toLocaleString()}명</span>
                  {breakdown.length > 1 && <span className="text-[12px] text-[color:var(--ad-faint)] tabular-nums">{breakdown.join(' ')}</span>}
                </>
              ) : (
                <span className="text-[color:var(--ad-faint)]">계산 중...</span>
              )}
            </p>
            {error && <p className="mt-1 text-[12px] text-[color:var(--ad-neg)]">{error}</p>}
          </div>
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="adm-press h-10 flex-1 rounded-[12px] bg-white px-5 text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] sm:flex-none"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="adm-press h-10 flex-1 rounded-[12px] bg-[color:var(--ad-ink)] px-6 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40 sm:flex-none"
            >
              {saving ? '저장 중...' : initial ? '수정 저장' : '그룹 저장'}
            </button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
