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
    <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 리스트</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)] ad-tnum">
          전체 고객 {formatNumber(total)}명
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedCount > 0 && (
          <Button variant="outline" onClick={onSendToSelected} className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
            <Send className="h-4 w-4" />
            선택 고객에게 메시지 발송 ({selectedCount}명)
          </Button>
        )}
        <Button onClick={onAddCustomer} className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
          <UserPlus className="h-4 w-4" />
          고객 등록
        </Button>
        <Button variant="outline" onClick={onBulkUpload} className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
          <FileSpreadsheet className="h-4 w-4" />
          대량 등록
        </Button>
      </div>
    </div>
  );
}
