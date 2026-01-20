'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  WaitingOperationStatus as OperationStatus,
  OPERATION_STATUS_LABELS,
  OPERATION_STATUS_COLORS,
} from './types';

interface WaitingOperationStatusProps {
  status: OperationStatus;
  onChange: (status: OperationStatus) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function WaitingOperationStatus({
  status,
  onChange,
  isLoading = false,
  disabled = false,
}: WaitingOperationStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const statuses: OperationStatus[] = ['ACCEPTING', 'WALK_IN', 'PAUSED', 'CLOSED'];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (newStatus: OperationStatus) => {
    if (newStatus !== status && !isLoading && !disabled) {
      onChange(newStatus);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 bg-white',
          'hover:bg-neutral-50 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'min-w-[140px]'
        )}
      >
        <span
          className={cn(
            'w-2.5 h-2.5 rounded-full',
            OPERATION_STATUS_COLORS[status]
          )}
        />
        <span className="font-medium text-neutral-900">
          {OPERATION_STATUS_LABELS[status]}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-neutral-500 transition-transform ml-auto',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2.5 text-left',
                'hover:bg-neutral-50 transition-colors',
                s === status && 'bg-brand-50'
              )}
            >
              <span
                className={cn(
                  'w-2.5 h-2.5 rounded-full',
                  OPERATION_STATUS_COLORS[s]
                )}
              />
              <span
                className={cn(
                  'font-medium',
                  s === status ? 'text-brand-800' : 'text-neutral-700'
                )}
              >
                {OPERATION_STATUS_LABELS[s]}
              </span>
              {s === status && (
                <Check className="w-4 h-4 text-brand-800 ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
