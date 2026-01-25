'use client';

import { WaitingItem } from './types';
import { WaitingTableRow } from './WaitingTableRow';
import { Users } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
          <Users className="w-8 h-8" />
        </div>
        <p className="text-base font-medium text-neutral-600">{emptyMessage}</p>
        <p className="text-sm mt-1.5 text-neutral-400">새로운 웨이팅 등록을 기다리고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed">
        <thead>
          <tr className="bg-neutral-50/80 border-y border-neutral-200">
            <th className="py-3 px-4 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              순서
            </th>
            <th className="py-3 px-4 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              번호
            </th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              정보
            </th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              상태
            </th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              고객
            </th>
            <th className="py-3 px-4 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/6">
              관리
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
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
