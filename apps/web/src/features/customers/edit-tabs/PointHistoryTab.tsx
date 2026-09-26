import { formatNumber, formatDate } from '@/lib/utils';
import { PointLedgerEntry } from '../types';

// 고객 상세 모달의 포인트 내역 탭.
export function PointHistoryTab({
  pointHistory,
  loadingHistory,
}: {
  pointHistory: PointLedgerEntry[];
  loadingHistory: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col mt-3">
      {loadingHistory && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (pointHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          포인트 내역이 없습니다.
        </div>
      )}
      {!loadingHistory && (pointHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-2 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {(pointHistory || []).map((entry) => {
              // ordersheetId가 포함된 reason을 필터링하여 표시
              let displayReason = entry.reason;
              if (displayReason && displayReason.includes('ordersheetId')) {
                // "TagHere 주문 적립 (ordersheetId: xxx)" -> "TagHere 주문 적립"
                displayReason = displayReason.replace(/\s*\(ordersheetId:.*?\)/gi, '').trim();
              }
              if (!displayReason) {
                displayReason = entry.type === 'EARN' ? '포인트 적립' : entry.type === 'USE' ? '포인트 사용' : entry.type;
              }

              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[13px] font-medium ad-tnum ${
                          entry.delta > 0 ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'
                        }`}
                      >
                        {entry.delta > 0 ? '+' : ''}{formatNumber(entry.delta)} P
                      </span>
                      <span className="text-[12px] text-[#91959a]">
                        잔액 {formatNumber(entry.balance)} P
                      </span>
                      {entry.tableLabel && (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          {entry.tableLabel}
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
          {/* Scroll indicator gradient */}
          <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  );
}
