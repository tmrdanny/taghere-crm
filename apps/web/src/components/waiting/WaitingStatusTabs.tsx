'use client';

import { cn } from '@/lib/utils';
import { WaitingStatus } from './types';

type StatusFilter = 'WAITING' | 'SEATED' | 'CANCELLED';

interface WaitingStatusTabsProps {
  selectedStatus: StatusFilter;
  counts: {
    waiting: number;
    seated: number;
    cancelled: number;
  };
  onSelect: (status: StatusFilter) => void;
}

const STATUS_CONFIG: { key: StatusFilter; label: string }[] = [
  { key: 'WAITING', label: '웨이팅 중' },
  { key: 'SEATED', label: '착석' },
  { key: 'CANCELLED', label: '취소' },
];

export function WaitingStatusTabs({
  selectedStatus,
  counts,
  onSelect,
}: WaitingStatusTabsProps) {
  const getCount = (status: StatusFilter) => {
    switch (status) {
      case 'WAITING':
        return counts.waiting;
      case 'SEATED':
        return counts.seated;
      case 'CANCELLED':
        return counts.cancelled;
      default:
        return 0;
    }
  };

  return (
    <div className="flex border-b border-neutral-200">
      {STATUS_CONFIG.map((config) => {
        const isSelected = selectedStatus === config.key;
        const count = getCount(config.key);

        return (
          <button
            key={config.key}
            type="button"
            onClick={() => onSelect(config.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors relative',
              isSelected
                ? 'text-brand-800'
                : 'text-neutral-500 hover:text-neutral-700'
            )}
          >
            {config.label}
            <span
              className={cn(
                'ml-2 px-1.5 py-0.5 rounded text-xs',
                isSelected
                  ? 'bg-brand-100 text-brand-800'
                  : 'bg-neutral-100 text-neutral-600'
              )}
            >
              {count}
            </span>
            {isSelected && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-800" />
            )}
          </button>
        );
      })}
    </div>
  );
}
