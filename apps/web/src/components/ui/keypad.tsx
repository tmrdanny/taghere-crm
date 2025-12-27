'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Delete } from 'lucide-react';

interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  onSubmit?: () => void;
  submitLabel?: string;
  showReset?: boolean;
  className?: string;
}

export function Keypad({
  value,
  onChange,
  maxLength = 8,
  onSubmit,
  submitLabel = '적립',
  showReset = false,
  className,
}: KeypadProps) {
  const handleKeyPress = (key: string) => {
    if (value.length < maxLength) {
      onChange(value + key);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleReset = () => {
    onChange('');
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={cn('w-full', className)}>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKeyPress(key)}
            className="h-16 rounded-xl border border-neutral-200 bg-white text-2xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            {key}
          </button>
        ))}

        {/* Bottom row */}
        {showReset ? (
          <button
            type="button"
            onClick={handleReset}
            className="h-16 rounded-xl bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
          >
            초기화
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDelete}
            className="h-16 rounded-xl border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <Delete className="w-6 h-6" />
          </button>
        )}

        <button
          type="button"
          onClick={() => handleKeyPress('0')}
          className="h-16 rounded-xl border border-neutral-200 bg-white text-2xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
        >
          0
        </button>

        {showReset ? (
          <button
            type="button"
            onClick={handleDelete}
            className="h-16 rounded-xl border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            <Delete className="w-6 h-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value}
            className="h-16 rounded-xl bg-brand-800 text-white text-lg font-semibold hover:bg-brand-900 active:bg-brand-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Full-screen keypad variant (for POS/tablet)
export function KeypadFull({
  value,
  onChange,
  maxLength = 8,
  onSubmit,
  submitLabel = '적립 완료',
  className,
}: KeypadProps) {
  const handleKeyPress = (key: string) => {
    if (value.length < maxLength) {
      onChange(value + key);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleReset = () => {
    onChange('');
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKeyPress(key)}
            className="h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
          >
            {key}
          </button>
        ))}

        {/* Bottom row */}
        <button
          type="button"
          onClick={handleReset}
          className="h-20 rounded-xl bg-neutral-100 text-base font-medium text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
        >
          초기화
        </button>

        <button
          type="button"
          onClick={() => handleKeyPress('0')}
          className="h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="h-20 rounded-xl border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
        >
          <Delete className="w-8 h-8" />
        </button>
      </div>

      {/* Submit button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value}
        className="w-full h-16 mt-4 rounded-xl bg-brand-800 text-white text-xl font-semibold hover:bg-brand-900 active:bg-brand-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
}
