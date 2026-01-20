'use client';

import { WaitingItem } from './types';
import { WaitingTableRow } from './WaitingTableRow';
import { Users, Clock } from 'lucide-react';

interface WaitingTableProps {
  items: WaitingItem[];
  onCall: (id: string) => void;
  onRecall: (id: string) => void;
  onSeat: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (id: string) => void;
  loadingStates: {
    call: string | null;
    seat: string | null;
    cancel: string | null;
    restore: string | null;
  };
  maxCallCount: number;
  callTimeoutMinutes: number;
  emptyMessage?: string;
}

export function WaitingTable({
  items,
  onCall,
  onRecall,
  onSeat,
  onCancel,
  onRestore,
  loadingStates,
  maxCallCount,
  callTimeoutMinutes,
  emptyMessage = '웨이팅 내역이 없습니다.',
}: WaitingTableProps) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
        <Users className="w-12 h-12 mb-4" />
        <p className="text-lg font-medium">{emptyMessage}</p>
        <p className="text-sm mt-1">새로운 웨이팅 등록을 기다리고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px]">
        <thead>
          <tr className="bg-neutral-50 border-y border-neutral-200">
            <th className="py-3 px-4 text-center text-sm font-medium text-neutral-600 w-[60px]">
              순서
            </th>
            <th className="py-3 px-4 text-center text-sm font-medium text-neutral-600 w-[100px]">
              호출번호
            </th>
            <th className="py-3 px-4 text-left text-sm font-medium text-neutral-600 w-[120px]">
              웨이팅 정보
            </th>
            <th className="py-3 px-4 text-left text-sm font-medium text-neutral-600 w-[140px]">
              <div className="flex items-center gap-1">
                웨이팅상태
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-200 text-neutral-500 text-xs cursor-help" title="경과 시간 및 호출 상태가 표시됩니다.">
                  i
                </span>
              </div>
            </th>
            <th className="py-3 px-4 text-left text-sm font-medium text-neutral-600 w-[140px]">
              고객정보
            </th>
            <th className="py-3 px-4 text-left text-sm font-medium text-neutral-600">
              웨이팅 관리 기능
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <WaitingTableRow
              key={item.id}
              item={item}
              index={index}
              onCall={onCall}
              onRecall={onRecall}
              onSeat={onSeat}
              onCancel={onCancel}
              onRestore={onRestore}
              loadingStates={loadingStates}
              maxCallCount={maxCallCount}
              callTimeoutMinutes={callTimeoutMinutes}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
