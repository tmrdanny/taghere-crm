import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

interface CancellingItemInfo {
  name: string;
  price: number;
  totalQty: number;
  remainingQty: number;
  unitPrice: number;
}

// 주문 메뉴 취소 확인 모달. 닫기 시 부모가 관련 상태를 초기화한다(onClose).
export function CancelOrderItemModal({
  open,
  itemInfo,
  cancelQuantity,
  onQuantityChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  itemInfo: CancellingItemInfo | null;
  cancelQuantity: number;
  onQuantityChange: (qty: number) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-md">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">주문 취소 확인</ModalTitle>
        </ModalHeader>

        <div className="py-4">
          <p className="text-[13px] text-[#383c40] mb-4">
            다음 메뉴의 주문을 취소하시겠습니까?
          </p>
          {itemInfo && (
            <div className="p-3 bg-[#f8f9fa] rounded-[10px] space-y-3">
              <div>
                <p className="font-medium text-[#1d2022]">{itemInfo.name}</p>
                <p className="text-[13px] text-[#55595e] mt-1">
                  단가: {formatNumber(itemInfo.unitPrice)}원
                </p>
              </div>

              {/* 수량이 2개 이상일 때만 수량 선택 UI 표시 */}
              {itemInfo.remainingQty > 1 ? (
                <div className="pt-3 border-t border-[#ebeced]">
                  <p className="text-[13px] font-medium text-[#383c40] mb-2">
                    취소할 수량 (남은 수량: {itemInfo.remainingQty}개)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: itemInfo.remainingQty }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => onQuantityChange(num)}
                        className={`w-10 h-10 rounded-[10px] text-[13px] font-medium transition-colors ${
                          cancelQuantity === num
                            ? 'bg-[color:var(--ad-ink)] text-white'
                            : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="text-[13px] text-[#383c40] mt-3">
                    취소 금액: <span className="font-medium">{formatNumber(itemInfo.unitPrice * cancelQuantity)}원</span>
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-[#55595e]">
                  취소 금액: {formatNumber(itemInfo.price)}원
                </p>
              )}
            </div>
          )}
          <p className="text-[12px] text-[#cc0832] mt-3">
            ※ 해당 메뉴에 대한 적립 포인트가 자동으로 차감됩니다.
          </p>
        </div>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="flex-1 ad-press h-10 rounded-[12px] bg-[#cc0832] text-[13.5px] font-semibold text-white hover:bg-[#b0072b] disabled:opacity-50"
          >
            {itemInfo && itemInfo.remainingQty > 1
              ? `${cancelQuantity}개 취소`
              : '주문 취소'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
