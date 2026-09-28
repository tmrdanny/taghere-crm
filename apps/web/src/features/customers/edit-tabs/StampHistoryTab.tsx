import { formatDate } from '@/lib/utils';
import { StampLedgerEntry } from '../types';
import { Gift } from 'lucide-react';

function formatDay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 고객 상세 모달의 스탬프 내역 탭. 일자별로 그룹핑하여 표시.
export function StampHistoryTab({
  stampHistory,
  loadingHistory,
}: {
  stampHistory: StampLedgerEntry[];
  loadingHistory: boolean;
}) {
  const groups: { key: string; label: string; entries: StampLedgerEntry[] }[] = [];
  for (const entry of stampHistory || []) {
    const key = dayKey(entry.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.entries.push(entry);
    } else {
      groups.push({ key, label: formatDay(entry.createdAt), entries: [entry] });
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col mt-3">
      {loadingHistory && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (stampHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          스탬프 내역이 없습니다.
        </div>
      )}
      {!loadingHistory && (stampHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-4 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-[12px] font-medium text-[#91959a] mb-1.5">{group.label}</p>
                <div className="space-y-2">
                  {group.entries.map((entry) => {
                    let displayReason = entry.reason;
                    if (!displayReason) {
                      displayReason = entry.delta > 0 ? '스탬프 적립' : '스탬프 사용';
                    }

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[13px] font-medium ad-tnum ${
                                entry.delta > 0 ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'
                              }`}
                            >
                              {entry.delta > 0 ? '+' : ''}{entry.delta}개
                            </span>
                            <span className="text-[12px] text-[#91959a]">
                              잔액 {entry.balance}개
                            </span>
                            {entry.tableLabel && (
                              <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                                {entry.tableLabel}
                              </span>
                            )}
                            {entry.drawnReward && (
                              <span className="inline-flex items-center rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                                <Gift className="mr-1 inline h-3 w-3 align-[-1px]" strokeWidth={1.8} />
                                {entry.drawnReward}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#55595e] mt-0.5">
                            {displayReason}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[12px] text-[#91959a]">
                            {formatDate(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Scroll indicator gradient */}
          <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  );
}
