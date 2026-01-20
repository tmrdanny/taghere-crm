'use client';

import { cn } from '@/lib/utils';
import { WaitingType } from './types';

interface WaitingTypeTabsProps {
  types: WaitingType[];
  selectedTypeId: string | null; // null means "all"
  counts: Record<string, number>; // typeId -> count
  totalCount: number;
  onSelect: (typeId: string | null) => void;
}

export function WaitingTypeTabs({
  types,
  selectedTypeId,
  counts,
  totalCount,
  onSelect,
}: WaitingTypeTabsProps) {
  const activeTypes = (types || []).filter((t) => t.isActive);

  return (
    <div className="flex flex-wrap gap-2">
      {/* All Tab */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          selectedTypeId === null
            ? 'bg-brand-800 text-white'
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        )}
      >
        전체
        <span
          className={cn(
            'ml-2 px-1.5 py-0.5 rounded text-xs',
            selectedTypeId === null
              ? 'bg-white/20 text-white'
              : 'bg-neutral-200 text-neutral-700'
          )}
        >
          {totalCount}
        </span>
      </button>

      {/* Type Tabs */}
      {activeTypes.map((type) => {
        const count = counts[type.id] || 0;
        const isSelected = selectedTypeId === type.id;

        return (
          <button
            key={type.id}
            type="button"
            onClick={() => onSelect(type.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              isSelected
                ? 'bg-brand-800 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            )}
          >
            {type.name}
            <span
              className={cn(
                'ml-2 px-1.5 py-0.5 rounded text-xs',
                isSelected
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-200 text-neutral-700'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
