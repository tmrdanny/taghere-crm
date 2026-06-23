import { Button } from '@/components/ui/button';
import { Send, UserPlus, FileSpreadsheet } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

// 고객 리스트 페이지 헤더: 타이틀 + 선택 발송/등록/대량등록 액션.
export function CustomerListHeader({
  total,
  selectedCount,
  onSendToSelected,
  onAddCustomer,
  onBulkUpload,
}: {
  total: number;
  selectedCount: number;
  onSendToSelected: () => void;
  onAddCustomer: () => void;
  onBulkUpload: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">고객 리스트</h1>
        <p className="text-sm text-neutral-500 mt-1">
          전체 고객 {formatNumber(total)}명
        </p>
      </div>
      <div className="flex gap-3">
        {selectedCount > 0 && (
          <Button variant="outline" onClick={onSendToSelected}>
            <Send className="w-4 h-4 mr-2" />
            선택 고객에게 메시지 발송 ({selectedCount}명)
          </Button>
        )}
        <Button onClick={onAddCustomer}>
          <UserPlus className="w-4 h-4 mr-2" />
          고객 등록
        </Button>
        <Button variant="outline" onClick={onBulkUpload}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          대량 등록
        </Button>
      </div>
    </div>
  );
}
