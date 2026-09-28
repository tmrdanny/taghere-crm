import { RefObject } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, Calendar, Settings2 } from 'lucide-react';
import { FilterSelectDropdown } from './FilterSelectDropdown';

// 고객 목록 상단의 검색 + 필터 바.
// 필터 상태/드롭다운 열림 상태/핸들러는 모두 부모에서 관리하고 props로 전달 (동작 보존).
export function CustomerFilters({
  searchInput,
  onSearchInputChange,
  onResetFilters,
  genderFilter,
  genderOptions,
  genderDropdownOpen,
  onGenderToggle,
  onGenderSelect,
  visitFilter,
  visitOptions,
  visitDropdownOpen,
  onVisitToggle,
  onVisitSelect,
  lastVisitFilter,
  lastVisitOptions,
  lastVisitDropdownOpen,
  onLastVisitToggle,
  onLastVisitSelect,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  dateFilterType,
  onDateFilterTypeChange,
  dateRangeDropdownOpen,
  onDateRangeToggle,
  dateRangeDropdownRef,
  onDateRangeReset,
  onDateRangeApply,
  columnSettingsOpen,
  onColumnSettingsToggle,
  columnSettingsRef,
  columnDefinitions,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}: {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onResetFilters: () => void;
  genderFilter: string;
  genderOptions: { value: string; label: string }[];
  genderDropdownOpen: boolean;
  onGenderToggle: () => void;
  onGenderSelect: (value: string) => void;
  visitFilter: string;
  visitOptions: { value: string; label: string }[];
  visitDropdownOpen: boolean;
  onVisitToggle: () => void;
  onVisitSelect: (value: string) => void;
  lastVisitFilter: string;
  lastVisitOptions: { value: string; label: string }[];
  lastVisitDropdownOpen: boolean;
  onLastVisitToggle: () => void;
  onLastVisitSelect: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  dateFilterType: 'lastVisit' | 'created';
  onDateFilterTypeChange: (value: 'lastVisit' | 'created') => void;
  dateRangeDropdownOpen: boolean;
  onDateRangeToggle: () => void;
  dateRangeDropdownRef: RefObject<HTMLDivElement>;
  onDateRangeReset: () => void;
  onDateRangeApply: () => void;
  columnSettingsOpen: boolean;
  onColumnSettingsToggle: () => void;
  columnSettingsRef: RefObject<HTMLDivElement>;
  columnDefinitions: ReadonlyArray<{ id: string; label: string; required: boolean }>;
  visibleColumns: string[];
  onToggleColumn: (id: string) => void;
  onResetColumns: () => void;
}) {
  return (
    <Card className="ad-card mb-4 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ad-faint)]" />
          <Input
            placeholder="이름, 전화번호, 메모 검색"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            className="h-10 rounded-[10px] border-[color:var(--ad-line-strong)] pl-10 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus-visible:ring-0"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onResetFilters} className="ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
            전체 보기
          </Button>

          {/* Gender Filter Dropdown */}
          <FilterSelectDropdown
            label="성별"
            value={genderFilter}
            options={genderOptions}
            open={genderDropdownOpen}
            onToggle={onGenderToggle}
            onSelect={onGenderSelect}
            menuClassName="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] z-50 min-w-[120px]"
          />

          {/* Visit Count Filter Dropdown */}
          <FilterSelectDropdown
            label="방문 횟수"
            value={visitFilter}
            options={visitOptions}
            open={visitDropdownOpen}
            onToggle={onVisitToggle}
            onSelect={onVisitSelect}
            menuClassName="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] z-50 min-w-[140px]"
          />

          {/* Last Visit Filter Dropdown */}
          <FilterSelectDropdown
            label="마지막 방문"
            value={lastVisitFilter}
            options={lastVisitOptions}
            open={lastVisitDropdownOpen}
            onToggle={onLastVisitToggle}
            onSelect={onLastVisitSelect}
            menuClassName="absolute top-full left-0 mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] z-50 min-w-[140px]"
          />

          {/* Date Range Filter Dropdown */}
          <div className="relative" ref={dateRangeDropdownRef}>
            <Button
              variant={(startDate || endDate) ? 'secondary' : 'outline'}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDateRangeToggle();
              }}
              className={(startDate || endDate)
                ? 'ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-ink)] hover:bg-[color:var(--ad-bg-alt)]'
                : 'ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'}
            >
              <Calendar className="w-3.5 h-3.5" />
              {(startDate || endDate) ? (
                <span className="ad-tnum text-[12.5px]">
                  {startDate && endDate ? `${startDate.slice(5)} ~ ${endDate.slice(5)}` : startDate ? `${startDate.slice(5)} ~` : `~ ${endDate.slice(5)}`}
                </span>
              ) : (
                '기간'
              )}
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {dateRangeDropdownOpen && (
              <div
                className="absolute top-full right-0 z-50 mt-1 min-w-[240px] rounded-[12px] border border-[color:var(--ad-line)] bg-white p-3 shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Date type selector */}
                <div className="mb-3 space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      name="dateType"
                      checked={dateFilterType === 'lastVisit'}
                      onChange={() => onDateFilterTypeChange('lastVisit')}
                      className="accent-[#131651]"
                    />
                    <span className="text-[13px] text-[color:var(--ad-ink-2)]">마지막 방문일</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      name="dateType"
                      checked={dateFilterType === 'created'}
                      onChange={() => onDateFilterTypeChange('created')}
                      className="accent-[#131651]"
                    />
                    <span className="text-[13px] text-[color:var(--ad-ink-2)]">가입일</span>
                  </label>
                </div>

                {/* Date inputs */}
                <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-[12px] text-[color:var(--ad-muted)]">시작일</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => onStartDateChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="h-9 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px] focus:border-[color:var(--ad-navy)] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-[12px] text-[color:var(--ad-muted)]">종료일</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => onEndDateChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="h-9 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px] focus:border-[color:var(--ad-navy)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDateRangeReset();
                    }}
                    className="ad-press h-9 flex-1 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                  >
                    초기화
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDateRangeApply();
                    }}
                    className="ad-press h-9 flex-1 rounded-[10px] bg-[color:var(--ad-ink)] text-[13px] font-semibold text-white hover:bg-[#383c40]"
                  >
                    적용
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Column Settings Dropdown */}
          <div className="relative" ref={columnSettingsRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onColumnSettingsToggle();
              }}
              className="ad-press flex h-9 items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-[13px] font-normal text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              <Settings2 className="w-3.5 h-3.5" />
              컬럼
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {columnSettingsOpen && (
              <div
                className="absolute top-full right-0 z-50 mt-1 min-w-[180px] rounded-[12px] border border-[color:var(--ad-line)] bg-white py-2 shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 border-b border-[color:var(--ad-line)] px-3 pb-2">
                  <span className="text-[11.5px] font-medium text-[color:var(--ad-muted)]">표시할 컬럼</span>
                </div>
                {columnDefinitions.map((column) => (
                  <label
                    key={column.id}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[color:var(--ad-bg-alt)] ${column.required ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.id)}
                      disabled={column.required}
                      onChange={() => onToggleColumn(column.id)}
                      className="rounded border-[color:var(--ad-line-strong)] accent-[#131651]"
                    />
                    <span className="text-[13px] text-[color:var(--ad-ink-2)]">{column.label}</span>
                    {column.required && <span className="text-[11px] text-[color:var(--ad-faint)]">(필수)</span>}
                  </label>
                ))}
                <div className="mt-2 border-t border-[color:var(--ad-line)] px-3 pt-2">
                  <button
                    onClick={onResetColumns}
                    className="text-[12px] font-medium text-[color:var(--ad-link)] hover:underline"
                  >
                    기본값으로 초기화
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
