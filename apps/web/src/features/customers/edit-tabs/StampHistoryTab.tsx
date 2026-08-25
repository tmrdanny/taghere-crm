import { formatDate } from '@/lib/utils';
import { StampLedgerEntry } from '../types';

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
        <div className="text-center py-4 text-neutral-500 text-sm">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (stampHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          스탬프 내역이 없습니다.
        </div>
      )}
      {!loadingHistory && (stampHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-4 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-xs font-medium text-neutral-400 mb-1.5">{group.label}</p>
                <div className="space-y-2">
                  {group.entries.map((entry) => {
                    let displayReason = entry.reason;
                    if (!displayReason) {
                      displayReason = entry.delta > 0 ? '스탬프 적립' : '스탬프 사용';
                    }

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-semibold ${
                                entry.delta > 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {entry.delta > 0 ? '+' : ''}{entry.delta}개
                            </span>
                            <span className="text-xs text-neutral-400">
                              잔액 {entry.balance}개
                            </span>
                            {entry.tableLabel && (
                              <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                                {entry.tableLabel}
                              </span>
                            )}
                            {entry.drawnReward && (
                              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                🎁 {entry.drawnReward}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {displayReason}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-neutral-400">
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
