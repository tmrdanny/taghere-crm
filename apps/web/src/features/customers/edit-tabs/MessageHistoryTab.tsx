import { formatDate } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import { MessageHistoryEntry } from '../types';

// 고객 상세 모달의 발송 내역 탭.
export function MessageHistoryTab({
  messageHistory,
  messageSummary,
  loadingMessages,
}: {
  messageHistory: MessageHistoryEntry[];
  messageSummary: { total: number; sent: number; failed: number };
  loadingMessages: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col mt-3">
      {/* Summary */}
      {messageSummary.total > 0 && (
        <div className="mb-3 flex-shrink-0 p-2 bg-[#f8f9fa] rounded-[10px] border border-[#ebeced]">
          <div className="flex items-center gap-4 text-[13px]">
            <span className="text-[#383c40]">
              총 <span className="font-medium text-[color:var(--ad-ink)]">{messageSummary.total}</span>건
            </span>
            <span className="text-[color:var(--ad-muted)]">
              성공 <span className="font-medium text-[color:var(--ad-ink)]">{messageSummary.sent}</span>건
            </span>
            {messageSummary.failed > 0 && (
              <span className="text-[color:var(--ad-neg)]">
                실패 <span className="font-medium">{messageSummary.failed}</span>건
              </span>
            )}
          </div>
        </div>
      )}

      {loadingMessages && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          불러오는 중...
        </div>
      )}
      {!loadingMessages && messageHistory.length === 0 && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          발송 내역이 없습니다.
        </div>
      )}
      {!loadingMessages && messageHistory.length > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#ebeced]">
                  <th className="py-2 px-2 text-left text-[12px] font-medium text-[#55595e]">발송일</th>
                  <th className="py-2 px-2 text-left text-[12px] font-medium text-[#55595e]">상태</th>
                  <th className="py-2 px-2 text-left text-[12px] font-medium text-[#55595e]">내용</th>
                </tr>
              </thead>
              <tbody>
                {messageHistory.map((msg) => (
                  <tr key={msg.id} className="border-b border-[#ebeced] hover:bg-[#f8f9fa]">
                    <td className="py-2 px-2 text-[#383c40] whitespace-nowrap">
                      <div className="text-[12px]">
                        {formatDate(msg.createdAt)}
                      </div>
                      <div className="text-[12px] text-[#91959a]">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {msg.status === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          <Check className="w-3 h-3" />
                          성공
                        </span>
                      ) : msg.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-neg)]">
                          <X className="w-3 h-3" />
                          실패
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          대기
                        </span>
                      )}
                      {msg.failReason && (
                        <div className="text-[12px] text-[color:var(--ad-neg)] mt-0.5 max-w-[100px] truncate" title={msg.failReason}>
                          {msg.failReason}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[#383c40]">
                      <div className="max-w-[200px] truncate" title={msg.content}>
                        {msg.content}
                      </div>
                      {msg.campaignTitle && (
                        <div className="text-[12px] text-[#91959a] mt-0.5 truncate">
                          {msg.campaignTitle}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Scroll indicator gradient */}
          <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  );
}
