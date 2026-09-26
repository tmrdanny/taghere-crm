import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPhone, formatNumber, maskNickname, formatBirthdayMonth, getAgeGroup } from '@/lib/utils';
import { Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Customer } from './types';

// 고객 목록 테이블 + 페이지네이션.
// 컬럼 표시 여부·선택·액션·페이지 상태는 부모에서 관리하고 props로 전달.
export function CustomerTable({
  customers,
  isLoading,
  error,
  selectedCustomers,
  onSelectedChange,
  isColumnVisible,
  visibleColumnCount,
  surveyQuestionLabels,
  visitSourceLabelMap,
  getVisitDescription,
  onRowClick,
  stampEnabled,
  onUsePoints,
  onEarnPoints,
  onEarnStamps,
  onDeductStamps,
  page,
  pageSize,
  pagination,
  onPageSizeChange,
  onPageChange,
}: {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  selectedCustomers: string[];
  onSelectedChange: (ids: string[]) => void;
  isColumnVisible: (id: string) => boolean;
  visibleColumnCount: number;
  surveyQuestionLabels: { id: string; label: string }[];
  visitSourceLabelMap: Record<string, string>;
  getVisitDescription: (customer: Customer) => string;
  onRowClick: (customer: Customer) => void;
  stampEnabled?: boolean;
  onUsePoints: (customer: Customer) => void;
  onEarnPoints: (customer: Customer) => void;
  onEarnStamps: (customer: Customer) => void;
  onDeductStamps: (customer: Customer) => void;
  page: number;
  pageSize: number;
  pagination: { total: number; totalPages: number };
  onPageSizeChange: (size: number) => void;
  onPageChange: (updater: (p: number) => number) => void;
}) {
  return (
    <Card className="ad-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
              <th className="w-12 px-4 py-2.5">
                <input
                  type="checkbox"
                  className="rounded border-[color:var(--ad-line-strong)] accent-[#131651]"
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectedChange(customers.map((c) => c.id));
                    } else {
                      onSelectedChange([]);
                    }
                  }}
                />
              </th>
              {isColumnVisible('nickname') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  닉네임
                </th>
              )}
              {isColumnVisible('phone') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  전화번호
                </th>
              )}
              {isColumnVisible('points') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  적립 포인트
                </th>
              )}
              {isColumnVisible('stamps') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  스탬프
                </th>
              )}
              {isColumnVisible('birthday') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  생일 / 연령대
                </th>
              )}
              {isColumnVisible('memo') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  메모
                </th>
              )}
              {isColumnVisible('visitSource') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  방문 경로
                </th>
              )}
              {isColumnVisible('tableLabel') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  좌석
                </th>
              )}
              {isColumnVisible('visitCount') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  방문 횟수
                </th>
              )}
              {surveyQuestionLabels.map((sq) => (
                <th key={sq.id} className="px-4 py-2.5 text-left font-medium">
                  {sq.label}
                </th>
              ))}
              {isColumnVisible('actions') && (
                <th className="px-4 py-2.5 text-left font-medium">
                  액션
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ad-line)]">
            {isLoading && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                  불러오는 중...
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-10 text-center text-[13px] text-[color:var(--ad-neg)]">
                  {error}
                </td>
              </tr>
            )}
            {!isLoading && !error && customers.length === 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                  결과가 없습니다.
                </td>
              </tr>
            )}
            {!isLoading &&
              !error &&
              customers.map((customer) => {
                return (
                  <tr
                    key={customer.id}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                    onClick={() => onRowClick(customer)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-[color:var(--ad-line-strong)] accent-[#131651]"
                        checked={selectedCustomers.includes(customer.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onSelectedChange([...selectedCustomers, customer.id]);
                          } else {
                            onSelectedChange(
                              selectedCustomers.filter((id) => id !== customer.id)
                            );
                          }
                        }}
                      />
                    </td>
                    {isColumnVisible('nickname') && (
                      <td className="px-4 py-3">
                        <span className="font-medium text-[color:var(--ad-ink)]">
                          {maskNickname(customer.name)}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('phone') && (
                      <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                        <div className="flex items-center gap-2">
                          <span>{formatPhone(customer.phone)}</span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('points') && (
                      <td className="ad-tnum px-4 py-3 font-medium text-[color:var(--ad-ink)]">
                        {formatNumber(customer.totalPoints)} p
                      </td>
                    )}
                    {isColumnVisible('stamps') && (
                      <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                        {customer.totalStamps || 0}
                      </td>
                    )}
                    {isColumnVisible('birthday') && (
                      <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatBirthdayMonth(customer.birthday)}</span>
                          <span className="text-[11.5px] text-[color:var(--ad-faint)]">{getAgeGroup(customer.birthYear)}</span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('memo') && (
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[color:var(--ad-ink-2)]">
                            {customer.memo || '-'}
                          </span>
                          <button className="flex-shrink-0 rounded-[6px] p-1 hover:bg-[color:var(--ad-bg)]">
                            <Edit2 className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" />
                          </button>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('visitSource') && (
                      <td className="px-4 py-3">
                        <span className="text-[color:var(--ad-ink-2)]">
                          {customer.visitSource
                            ? visitSourceLabelMap[customer.visitSource] || customer.visitSource
                            : '-'}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('tableLabel') && (
                      <td className="px-4 py-3">
                        <span className="text-[color:var(--ad-ink-2)]">
                          {customer.lastTableLabel || '-'}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('visitCount') && (
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-[color:var(--ad-ink)]">
                            {customer.visitCount}회
                          </span>
                          <p className="text-[11.5px] text-[color:var(--ad-faint)]">
                            {getVisitDescription(customer)}
                          </p>
                        </div>
                      </td>
                    )}
                    {surveyQuestionLabels.map((sq) => {
                      const answer = customer.surveyAnswers?.find((a) => a.questionId === sq.id);
                      return (
                        <td key={sq.id} className="px-4 py-3">
                          <span className="text-[color:var(--ad-ink-2)]">
                            {answer?.valueDate
                              ? new Date(answer.valueDate).toLocaleDateString('ko-KR')
                              : answer?.valueText || '-'}
                          </span>
                        </td>
                      );
                    })}
                    {isColumnVisible('actions') && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5">
                          {!stampEnabled && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 rounded-[8px] border-0 text-[12px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                                onClick={() => onUsePoints(customer)}
                              >
                                포인트 사용
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 rounded-[8px] border-0 text-[12px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                                onClick={() => onEarnPoints(customer)}
                              >
                                포인트 적립
                              </Button>
                            </>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 rounded-[8px] border-0 text-[12px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                            onClick={() => onEarnStamps(customer)}
                          >
                            스탬프 적립
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 rounded-[8px] border-0 text-[12px] text-[color:var(--ad-neg)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                            onClick={() => onDeductStamps(customer)}
                          >
                            스탬프 차감
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
        <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
          {formatNumber((page - 1) * pageSize + (customers.length ? 1 : 0))}-
          {formatNumber((page - 1) * pageSize + customers.length)} of{' '}
          {formatNumber(pagination.total)} customers
        </span>
        <div className="flex items-center gap-3">
          <select
            className="h-8 rounded-[8px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[12.5px] text-[color:var(--ad-ink-2)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(parseInt(e.target.value, 10));
            }}
          >
            <option value={20}>20 / 페이지</option>
            <option value={50}>50 / 페이지</option>
          </select>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
              disabled={page <= 1}
              onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
              disabled={page >= pagination.totalPages}
              onClick={() => onPageChange((p) => Math.min(pagination.totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
