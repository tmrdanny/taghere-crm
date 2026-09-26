import { Button } from '@/components/ui/button';
import { ChevronDown, Check } from 'lucide-react';

// 고객 필터 바의 단일 선택 드롭다운 (성별/방문 횟수/마지막 방문 공통).
export function FilterSelectDropdown({
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
  menuClassName,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
  menuClassName: string;
}) {
  return (
    <div className="relative">
      <Button
        variant={value === 'all' ? 'outline' : 'secondary'}
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={
          value === 'all'
            ? 'ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
            : 'ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)] hover:bg-[color:var(--ad-bg-alt)]'
        }
      >
        {label} {options.find((o) => o.value === value)?.label}
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <div
          className={menuClassName}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((option) => (
            <button
              key={option.value}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
              onClick={() => onSelect(option.value)}
            >
              {option.label}
              {value === option.value && (
                <Check className="h-4 w-4 text-[color:var(--ad-ink)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
