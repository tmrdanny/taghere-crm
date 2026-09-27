'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn } from '@/lib/utils';
import { SegmentBuilderModal } from './SegmentBuilderModal';
import type { SavedSegment } from './segment-conditions';

export interface PickedSegment {
  id: string;
  name: string;
  reachable: number;
}

/**
 * 발송 화면의 "고객 그룹으로 보내기" — 저장된 그룹을 칩으로 고르고, 없으면 그 자리에서 바로 만든다.
 * 사장님(/api/segments)과 프랜차이즈(/api/franchise/segments)가 함께 쓴다.
 */
export function SegmentPicker({
  active,
  selected,
  onSelect,
  apiPath = '/api/segments',
  tokenKey = 'token',
  scopeLabel,
  manageHref,
}: {
  /** 현재 발송 대상이 고객 그룹인지 */
  active: boolean;
  selected: PickedSegment | null;
  /** 그룹 id 로 선택 ('' 이면 선택 해제). 발송 가능 인원 조회는 부모가 한다 */
  onSelect: (segmentId: string) => void;
  apiPath?: string;
  tokenKey?: string;
  scopeLabel?: string;
  /** 그룹 관리 화면 링크 (사장님만) */
  manageHref?: string;
}) {
  const [segments, setSegments] = useState<SavedSegment[] | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${apiPath}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` },
      });
      const data = res.ok ? await res.json() : null;
      setSegments(data?.segments ?? []);
    } catch {
      setSegments([]);
    }
  }, [apiPath, tokenKey]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedId = active && selected ? selected.id : '';

  return (
    <div
      className={cn(
        'mt-3 rounded-[12px] border bg-white p-4 transition-[border-color,box-shadow]',
        active ? 'border-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-ink)]' : 'border-[color:var(--ad-line)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[color:var(--ad-ink)]">고객 그룹으로 보내기</p>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
            {active && selected ? (
              <>
                <span className="text-[color:var(--ad-ink-2)]">{selected.name}</span> · 발송 가능{' '}
                <span className="ad-tnum font-semibold text-[color:var(--ad-ink)]">{selected.reachable.toLocaleString()}명</span>
              </>
            ) : (
              '단골, 한동안 안 온 손님처럼 조건으로 묶어 둔 손님에게 보내요'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {manageHref && segments && segments.length > 0 && (
            <Link href={manageHref} className="text-[12.5px] text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]">
              관리
            </Link>
          )}
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            새 그룹
          </button>
        </div>
      </div>

      {segments === null ? (
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[64, 88, 72].map((w) => (
            <span key={w} className="h-8 animate-pulse rounded-full bg-[color:var(--ad-bg)]" style={{ width: w }} />
          ))}
        </div>
      ) : segments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="고객 그룹">
          {segments.map((sg) => {
            const on = sg.id === selectedId;
            return (
              <button
                key={sg.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(on ? '' : sg.id)}
                className={cn(
                  'ad-press h-8 max-w-full truncate rounded-full border px-3.5 text-[12.5px] transition-colors',
                  on
                    ? 'border-[color:var(--ad-ink)] bg-[color:var(--ad-ink)] font-medium text-white'
                    : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-faint)]'
                )}
              >
                {sg.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {active && selected && (
        <p className="mt-3 text-[12px] text-[color:var(--ad-faint)]">
          마케팅 수신 동의 고객에게만 발송돼요. 성별·연령대 필터 대신 그룹 조건이 적용돼요.
        </p>
      )}

      <SegmentBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        initial={null}
        apiPath={apiPath}
        tokenKey={tokenKey}
        scopeLabel={scopeLabel}
        onSaved={(segment) => {
          load();
          if (segment?.id) onSelect(segment.id);
        }}
      />
    </div>
  );
}
