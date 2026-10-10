import { Button } from '@/components/ui/button';
import { UserPlus, FileSpreadsheet, Users } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

// 고객 리스트 페이지 헤더: 타이틀 + 그룹 만들기/등록/대량등록.
// 체크한 손님으로 하는 일(포인트·스탬프·메시지·그룹)은 하단 선택 바(SelectionActionBar)에 모여 있다.
export function CustomerListHeader({
  total,
  onAddCustomer,
  onBulkUpload,
  onCreateGroup,
}: {
  total: number;
  onAddCustomer: () => void;
  onBulkUpload: () => void;
  /** 새 고객 그룹 만들기 (빈 상태로 열기) */
  onCreateGroup: () => void;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 리스트</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)] adm-tnum">
          전체 고객 {formatNumber(total)}명 · 손님을 체크하면 아래에서 포인트·스탬프를 바로 처리할 수 있어요
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onCreateGroup} className="adm-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
          <Users className="h-4 w-4" />
          고객 그룹 만들기
        </Button>
        <Button onClick={onAddCustomer} className="adm-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
          <UserPlus className="h-4 w-4" />
          고객 등록
        </Button>
        <Button variant="outline" onClick={onBulkUpload} className="adm-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
          <FileSpreadsheet className="h-4 w-4" />
          대량 등록
        </Button>
      </div>
    </div>
  );
}
