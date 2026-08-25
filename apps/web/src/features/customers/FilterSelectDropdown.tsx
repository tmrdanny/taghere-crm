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
        className="flex items-center gap-1"
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
              className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
              onClick={() => onSelect(option.value)}
            >
              {option.label}
              {value === option.value && (
                <Check className="w-4 h-4 text-brand-800" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
