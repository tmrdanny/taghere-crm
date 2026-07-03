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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="p-4 w-12">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300"
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
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  닉네임
                </th>
              )}
              {isColumnVisible('phone') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  전화번호
                </th>
              )}
              {isColumnVisible('points') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  적립 포인트
                </th>
              )}
              {isColumnVisible('stamps') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  스탬프
                </th>
              )}
              {isColumnVisible('birthday') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  생일 / 연령대
                </th>
              )}
              {isColumnVisible('memo') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  메모
                </th>
              )}
              {isColumnVisible('visitSource') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  방문 경로
                </th>
              )}
              {isColumnVisible('tableLabel') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  좌석
                </th>
              )}
              {isColumnVisible('visitCount') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  방문 횟수
                </th>
              )}
              {surveyQuestionLabels.map((sq) => (
                <th key={sq.id} className="p-4 text-left text-sm font-medium text-neutral-600">
                  {sq.label}
                </th>
              ))}
              {isColumnVisible('actions') && (
                <th className="p-4 text-left text-sm font-medium text-neutral-600">
                  액션
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-8 text-center text-neutral-500">
                  불러오는 중...
                </td>
              </tr>
            )}
            {!isLoading && error && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-8 text-center text-error">
                  {error}
                </td>
              </tr>
            )}
            {!isLoading && !error && customers.length === 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="p-8 text-center text-neutral-500">
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
                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer"
                    onClick={() => onRowClick(customer)}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300"
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
                      <td className="p-4">
                        <span className="font-medium text-neutral-900">
                          {maskNickname(customer.name)}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('phone') && (
                      <td className="p-4 text-neutral-600">
                        <div className="flex items-center gap-2">
                          <span>{formatPhone(customer.phone)}</span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('points') && (
                      <td className="p-4 font-medium text-neutral-900">
                        {formatNumber(customer.totalPoints)} p
                      </td>
                    )}
                    {isColumnVisible('stamps') && (
                      <td className="p-4 text-neutral-600">
                        {customer.totalStamps || 0}
                      </td>
                    )}
                    {isColumnVisible('birthday') && (
                      <td className="p-4 text-neutral-600">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatBirthdayMonth(customer.birthday)}</span>
                          <span className="text-xs text-neutral-500">{getAgeGroup(customer.birthYear)}</span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('memo') && (
                      <td className="p-4 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-600 truncate text-sm">
                            {customer.memo || '-'}
                          </span>
                          <button className="flex-shrink-0 p-1 hover:bg-neutral-100 rounded">
                            <Edit2 className="w-3.5 h-3.5 text-neutral-400" />
                          </button>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('visitSource') && (
                      <td className="p-4">
                        <span className="text-neutral-600 text-sm">
                          {customer.visitSource
                            ? visitSourceLabelMap[customer.visitSource] || customer.visitSource
                            : '-'}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('tableLabel') && (
                      <td className="p-4">
                        <span className="text-neutral-600 text-sm">
                          {customer.lastTableLabel || '-'}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('visitCount') && (
                      <td className="p-4">
                        <div>
                          <span className="font-medium text-neutral-900">
                            {customer.visitCount}회
                          </span>
                          <p className="text-xs text-neutral-500">
                            {getVisitDescription(customer)}
                          </p>
                        </div>
                      </td>
                    )}
                    {surveyQuestionLabels.map((sq) => {
                      const answer = customer.surveyAnswers?.find((a) => a.questionId === sq.id);
                      return (
                        <td key={sq.id} className="p-4">
                          <span className="text-neutral-600 text-sm">
                            {answer?.valueDate
                              ? new Date(answer.valueDate).toLocaleDateString('ko-KR')
                              : answer?.valueText || '-'}
                          </span>
                        </td>
                      );
                    })}
                    {isColumnVisible('actions') && (
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onUsePoints(customer)}
                          >
                            포인트 사용
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEarnPoints(customer)}
                          >
                            포인트 적립
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEarnStamps(customer)}
                          >
                            스탬프 적립
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-red-600"
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
      <div className="flex items-center justify-between p-4 border-t border-neutral-200">
        <span className="text-sm text-neutral-500">
          {formatNumber((page - 1) * pageSize + (customers.length ? 1 : 0))}-
          {formatNumber((page - 1) * pageSize + customers.length)} of{' '}
          {formatNumber(pagination.total)} customers
        </span>
        <div className="flex items-center gap-3">
          <select
            className="border border-neutral-200 rounded-md text-sm text-neutral-700 px-2 py-1 bg-white"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(parseInt(e.target.value, 10));
            }}
          >
            <option value={20}>20 / 페이지</option>
            <option value={50}>50 / 페이지</option>
          </select>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
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
