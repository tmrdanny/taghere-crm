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
        <div className="mb-3 flex-shrink-0 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-600">
              총 <span className="font-semibold text-neutral-900">{messageSummary.total}</span>건
            </span>
            <span className="text-green-600">
              성공 <span className="font-semibold">{messageSummary.sent}</span>건
            </span>
            {messageSummary.failed > 0 && (
              <span className="text-red-500">
                실패 <span className="font-semibold">{messageSummary.failed}</span>건
              </span>
            )}
          </div>
        </div>
      )}

      {loadingMessages && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          불러오는 중...
        </div>
      )}
      {!loadingMessages && messageHistory.length === 0 && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          발송 내역이 없습니다.
        </div>
      )}
      {!loadingMessages && messageHistory.length > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-neutral-200">
                  <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">발송일</th>
                  <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">상태</th>
                  <th className="py-2 px-2 text-left text-xs font-medium text-neutral-500">내용</th>
                </tr>
              </thead>
              <tbody>
                {messageHistory.map((msg) => (
                  <tr key={msg.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2 text-neutral-600 whitespace-nowrap">
                      <div className="text-xs">
                        {formatDate(msg.createdAt)}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {msg.status === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                          <Check className="w-3 h-3" />
                          성공
                        </span>
                      ) : msg.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                          <X className="w-3 h-3" />
                          실패
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                          대기
                        </span>
                      )}
                      {msg.failReason && (
                        <div className="text-xs text-red-400 mt-0.5 max-w-[100px] truncate" title={msg.failReason}>
                          {msg.failReason}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-neutral-700">
                      <div className="max-w-[200px] truncate" title={msg.content}>
                        {msg.content}
                      </div>
                      {msg.campaignTitle && (
                        <div className="text-xs text-neutral-400 mt-0.5 truncate">
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
