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
    <Card className="p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            placeholder="이름, 전화번호, 메모 검색"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onResetFilters}>
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
            menuClassName="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50"
          />

          {/* Visit Count Filter Dropdown */}
          <FilterSelectDropdown
            label="방문 횟수"
            value={visitFilter}
            options={visitOptions}
            open={visitDropdownOpen}
            onToggle={onVisitToggle}
            onSelect={onVisitSelect}
            menuClassName="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50"
          />

          {/* Last Visit Filter Dropdown */}
          <FilterSelectDropdown
            label="마지막 방문"
            value={lastVisitFilter}
            options={lastVisitOptions}
            open={lastVisitDropdownOpen}
            onToggle={onLastVisitToggle}
            onSelect={onLastVisitSelect}
            menuClassName="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50"
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
              className="flex items-center gap-1"
            >
              <Calendar className="w-3.5 h-3.5" />
              {(startDate || endDate) ? (
                <span className="text-xs">
                  {startDate && endDate ? `${startDate.slice(5)} ~ ${endDate.slice(5)}` : startDate ? `${startDate.slice(5)} ~` : `~ ${endDate.slice(5)}`}
                </span>
              ) : (
                '기간'
              )}
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {dateRangeDropdownOpen && (
              <div
                className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[240px] z-50"
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
                      className="text-brand-800 focus:ring-brand-800"
                    />
                    <span className="text-sm text-neutral-700">마지막 방문일</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="radio"
                      name="dateType"
                      checked={dateFilterType === 'created'}
                      onChange={() => onDateFilterTypeChange('created')}
                      className="text-brand-800 focus:ring-brand-800"
                    />
                    <span className="text-sm text-neutral-700">가입일</span>
                  </label>
                </div>

                {/* Date inputs */}
                <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-12">시작일</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => onStartDateChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-12">종료일</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => onEndDateChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
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
                    className="flex-1 text-sm"
                  >
                    초기화
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDateRangeApply();
                    }}
                    className="flex-1 text-sm"
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
              className="flex items-center gap-1"
            >
              <Settings2 className="w-3.5 h-3.5" />
              컬럼
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {columnSettingsOpen && (
              <div
                className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-2 min-w-[180px] z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 pb-2 border-b border-neutral-100 mb-2">
                  <span className="text-xs font-medium text-neutral-500">표시할 컬럼</span>
                </div>
                {columnDefinitions.map((column) => (
                  <label
                    key={column.id}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-50 ${column.required ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.id)}
                      disabled={column.required}
                      onChange={() => onToggleColumn(column.id)}
                      className="rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-700">{column.label}</span>
                    {column.required && <span className="text-xs text-neutral-400">(필수)</span>}
                  </label>
                ))}
                <div className="px-3 pt-2 mt-2 border-t border-neutral-100">
                  <button
                    onClick={onResetColumns}
                    className="text-xs text-neutral-500 hover:text-neutral-700"
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
