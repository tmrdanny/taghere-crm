'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { SavedSegment, describeConditions } from './segment-conditions';
import { SegmentBuilderModal } from './SegmentBuilderModal';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

// 맞춤 세그먼트 — 저장·수정·삭제하고 메시지 발송 화면으로 넘긴다
export function CustomSegmentsSection() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [reachable, setReachable] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<SavedSegment | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/segments`, { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: SavedSegment[] = data.segments ?? [];
      setSegments(list);
      // 세그먼트별 현재 발송 가능 인원 (조건은 저장, 인원은 지금 시점 기준)
      setReachable(Object.fromEntries(list.map((s) => [s.id, null])));
      await Promise.all(
        list.map(async (s) => {
          try {
            const r = await fetch(`${API_BASE}/api/segments/${s.id}`, { headers: authHeader() });
            const d = await r.json();
            if (r.ok) setReachable((prev) => ({ ...prev, [s.id]: d.reachable }));
          } catch {
            // 개별 실패는 무시 (카드에 '-' 표시)
          }
        })
      );
    } catch {
      showToast('세그먼트를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (segment: SavedSegment) => {
    if (!confirm(`'${segment.name}' 세그먼트를 삭제할까요?`)) return;
    const res = await fetch(`${API_BASE}/api/segments/${segment.id}`, { method: 'DELETE', headers: authHeader() });
    if (res.ok) {
      showToast('삭제했습니다.', 'success');
      load();
    } else {
      showToast('삭제하지 못했습니다.', 'error');
    }
  };

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">맞춤 세그먼트</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">방문·결제·주문 메뉴·고객 정보를 조합해 고객을 나누고 바로 메시지를 보낼 수 있습니다.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setBuilderOpen(true);
          }}
          className="ad-press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          세그먼트 만들기
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      ) : segments.length === 0 ? (
        <Card className="ad-card border-0">
          <CardContent className="py-10 text-center">
            <p className="text-[13px] text-[color:var(--ad-ink-2)]">아직 만든 세그먼트가 없습니다.</p>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">예: 아메리카노를 3회 이상 주문했지만 60일 넘게 오지 않은 고객</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {segments.map((segment) => {
            const count = reachable[segment.id];
            return (
              <Card key={segment.id} className="ad-card border-0">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[color:var(--ad-ink)]">{segment.name}</p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-[color:var(--ad-muted)]">{describeConditions(segment.conditions).join(' · ')}</p>
                    </div>
                    <div className="flex shrink-0">
                      <button
                        onClick={() => {
                          setEditing(segment);
                          setBuilderOpen(true);
                        }}
                        className="rounded-[8px] p-1.5 text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]"
                        aria-label="수정"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(segment)} className="rounded-[8px] p-1.5 text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-neg)]" aria-label="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between border-t border-[color:var(--ad-line)] pt-3">
                    <div>
                      <p className="text-[12px] text-[color:var(--ad-muted)]">발송 가능</p>
                      <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{count === null || count === undefined ? '-' : `${count.toLocaleString()}명`}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ad-press h-8 gap-1 rounded-[10px] border-0 bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                      disabled={!count}
                      onClick={() => router.push(`/messages?segmentId=${segment.id}`)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      메시지 보내기
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[12px] text-[color:var(--ad-faint)]">
        발송 가능 인원은 마케팅 수신에 동의하고 전화번호가 있는 고객 수입니다. 조건은 저장되고, 대상은 발송할 때마다 다시 계산됩니다.
      </p>

      <SegmentBuilderModal open={builderOpen} onOpenChange={setBuilderOpen} initial={editing} onSaved={load} />
      {ToastComponent}
    </div>
  );
}
