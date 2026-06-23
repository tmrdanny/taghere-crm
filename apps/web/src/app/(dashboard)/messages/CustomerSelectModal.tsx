import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatNumber, formatPhone, maskNickname } from '@/lib/utils';
import { Search, Loader2, Users, Check } from 'lucide-react';
import { CustomerListItem, SelectedCustomer } from './types';

// 발송 대상 고객 직접 선택 모달.
export function CustomerSelectModal({
  open,
  onOpenChange,
  customerSearch,
  onSearchChange,
  customerList,
  tempSelectedCustomers,
  isLoadingCustomers,
  isSelectingAll,
  onSelectAll,
  onDeselectAll,
  onToggle,
  customerPage,
  customerTotalPages,
  onPageChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerSearch: string;
  onSearchChange: (value: string) => void;
  customerList: CustomerListItem[];
  tempSelectedCustomers: SelectedCustomer[];
  isLoadingCustomers: boolean;
  isSelectingAll: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggle: (customer: CustomerListItem) => void;
  customerPage: number;
  customerTotalPages: number;
  onPageChange: (page: number) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <ModalHeader>
          <ModalTitle>고객 선택</ModalTitle>
        </ModalHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="이름 또는 전화번호로 검색..."
              className="w-full pl-10 pr-4 py-2.5 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
            />
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onSelectAll}
                disabled={customerList.length === 0 || isSelectingAll}
              >
                {isSelectingAll ? '전체 선택 중...' : '전체 선택'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDeselectAll}
                disabled={tempSelectedCustomers.length === 0}
              >
                전체 해제
              </Button>
            </div>
            <span className="text-sm text-[#64748b]">
              {tempSelectedCustomers.length}명 선택됨
            </span>
          </div>

          {/* Customer list */}
          <div className="flex-1 overflow-y-auto border border-[#e5e7eb] rounded-xl min-h-[300px]">
            {isLoadingCustomers ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-[#3b82f6]" />
              </div>
            ) : customerList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#94a3b8]">
                <Users className="w-12 h-12 mb-2" />
                <p>검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {customerList.map((customer) => {
                  const isSelected = tempSelectedCustomers.some(c => c.id === customer.id);
                  return (
                    <button
                      key={customer.id}
                      onClick={() => onToggle(customer)}
                      className={cn(
                        'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                        isSelected ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                        isSelected
                          ? 'bg-[#3b82f6] border-[#3b82f6]'
                          : 'border-[#d1d5db]'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1e293b]">
                            {maskNickname(customer.name)}
                          </span>
                          {customer.gender && (
                            <Badge variant="secondary" className="text-xs">
                              {customer.gender === 'MALE' ? '남' : '여'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-[#64748b]">
                          {customer.phone ? formatPhone(customer.phone) : ''}
                        </div>
                      </div>
                      <div className="text-right text-sm flex-shrink-0">
                        <div className="text-[#64748b]">
                          방문 {customer.visitCount}회
                          {(customer.messageCount || 0) > 0 && (
                            <span className="ml-1 text-green-600">· 수신 {customer.messageCount}회</span>
                          )}
                        </div>
                        <div className="text-[#3b82f6] font-medium">{formatNumber(customer.totalPoints)}P</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {customerTotalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-2">
              <button
                onClick={() => onPageChange(Math.max(1, customerPage - 1))}
                disabled={customerPage <= 1 || isLoadingCustomers}
                className="px-3 py-1.5 text-sm rounded-lg border border-[#e5e7eb] disabled:opacity-40 hover:bg-[#f8fafc] transition-colors"
              >
                이전
              </button>
              <span className="text-sm text-[#64748b]">
                {customerPage} / {customerTotalPages}
              </span>
              <button
                onClick={() => onPageChange(Math.min(customerTotalPages, customerPage + 1))}
                disabled={customerPage >= customerTotalPages || isLoadingCustomers}
                className="px-3 py-1.5 text-sm rounded-lg border border-[#e5e7eb] disabled:opacity-40 hover:bg-[#f8fafc] transition-colors"
              >
                다음
              </button>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onConfirm}
            disabled={tempSelectedCustomers.length === 0}
          >
            <Users className="w-4 h-4 mr-2" />
            {tempSelectedCustomers.length}명 선택 완료
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
