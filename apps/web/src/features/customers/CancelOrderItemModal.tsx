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
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <ModalTitle>주문 취소 확인</ModalTitle>
        </ModalHeader>

        <div className="py-4">
          <p className="text-sm text-neutral-700 mb-4">
            다음 메뉴의 주문을 취소하시겠습니까?
          </p>
          {itemInfo && (
            <div className="p-3 bg-neutral-50 rounded-lg space-y-3">
              <div>
                <p className="font-medium text-neutral-900">{itemInfo.name}</p>
                <p className="text-sm text-neutral-500 mt-1">
                  단가: {formatNumber(itemInfo.unitPrice)}원
                </p>
              </div>

              {/* 수량이 2개 이상일 때만 수량 선택 UI 표시 */}
              {itemInfo.remainingQty > 1 ? (
                <div className="pt-3 border-t border-neutral-200">
                  <p className="text-sm font-medium text-neutral-700 mb-2">
                    취소할 수량 (남은 수량: {itemInfo.remainingQty}개)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: itemInfo.remainingQty }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => onQuantityChange(num)}
                        className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                          cancelQuantity === num
                            ? 'bg-red-500 text-white'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-neutral-600 mt-3">
                    취소 금액: <span className="font-medium">{formatNumber(itemInfo.unitPrice * cancelQuantity)}원</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  취소 금액: {formatNumber(itemInfo.price)}원
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-red-500 mt-3">
            ※ 해당 메뉴에 대한 적립 포인트가 자동으로 차감됩니다.
          </p>
        </div>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="flex-1"
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
