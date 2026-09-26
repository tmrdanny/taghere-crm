import { Button } from '@/components/ui/button';
import { formatNumber, formatDate } from '@/lib/utils';
import { Calendar, X } from 'lucide-react';
import { OrderItem, VisitOrOrderEntry, getOrderItems, formatOrderItemOption } from '../types';

// 고객 상세 모달의 주문 내역 탭. (날짜 필터 + 적립 취소 모드)
export function OrderHistoryTab({
  orderHistory,
  loadingHistory,
  showDateFilter,
  onToggleDateFilter,
  cancelMode,
  onToggleCancelMode,
  orderStartDate,
  onStartDateChange,
  orderEndDate,
  onEndDateChange,
  onApplyFilter,
  onResetFilter,
  onCancelItem,
}: {
  orderHistory: VisitOrOrderEntry[];
  loadingHistory: boolean;
  showDateFilter: boolean;
  onToggleDateFilter: () => void;
  cancelMode: boolean;
  onToggleCancelMode: () => void;
  orderStartDate: string;
  onStartDateChange: (value: string) => void;
  orderEndDate: string;
  onEndDateChange: (value: string) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onCancelItem: (orderId: string, itemIndex: number, menuName: string, itemPrice: number, qty: number, cancelledQty: number) => void;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col mt-3">
      {/* Action Buttons - Tablet Friendly */}
      <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0">
        <Button
          variant={showDateFilter ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleDateFilter}
          className={showDateFilter ? 'ad-press inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-[color:var(--ad-ink)] px-3 text-[12.5px] font-medium text-white hover:bg-[#383c40]' : 'ad-press inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'}
        >
          <Calendar className="w-3.5 h-3.5" />
          날짜 조회
        </Button>
        <Button
          variant={cancelMode ? 'destructive' : 'secondary'}
          size="sm"
          onClick={onToggleCancelMode}
          className={cancelMode ? 'ad-press inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-[color:var(--ad-ink)] px-3 text-[12.5px] font-medium text-white hover:bg-[#383c40]' : 'ad-press inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'}
        >
          <X className="w-3.5 h-3.5" />
          적립 취소
        </Button>
      </div>

      {/* Date Filter - Conditional */}
      {showDateFilter && (
        <div className="mb-3 flex-shrink-0 p-3 bg-[#f8f9fa] rounded-[10px] border border-[#ebeced] space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={orderStartDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#d1d3d6] bg-white px-2 text-[13px] focus:border-[#131651] focus:outline-none"
            />
            <span className="text-[#91959a] text-[13px]">~</span>
            <input
              type="date"
              value={orderEndDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#d1d3d6] bg-white px-2 text-[13px] focus:border-[#131651] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onApplyFilter}
              disabled={loadingHistory}
              className="ad-press inline-flex h-9 flex-1 items-center justify-center rounded-[10px] border-0 bg-white px-4 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
            >
              조회
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilter}
              className="ad-press inline-flex h-9 flex-1 items-center justify-center rounded-[10px] border-0 bg-transparent px-4 text-[13px] font-medium text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink)]"
            >
              초기화
            </Button>
          </div>
        </div>
      )}

      {loadingHistory && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (orderHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-[#55595e] text-[13px]">
          주문 내역이 없습니다.
        </div>
      )}
      {!loadingHistory && (orderHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-3 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {(orderHistory || []).map((order) => (
              <div
                key={order.id}
                className="p-3 bg-[#f8f9fa] rounded-[10px] border border-[#ebeced]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#1d2022]">
                      {order.totalAmount ? `${formatNumber(order.totalAmount)}원` : '금액 미입력'}
                    </span>
                    {order.tableNumber && (
                      <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                        {order.tableNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-[12px] text-[#91959a]">
                    {formatDate(order.visitedAt)} {new Date(order.visitedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </div>
                {getOrderItems(order.items).length > 0 ? (
                  <div className="space-y-1.5 pt-1 border-t border-[#ebeced] mt-2">
                    {getOrderItems(order.items).map((item: OrderItem, idx: number) => {
                      const menuName = item.label || item.name || item.menuName || item.productName || item.title || '(메뉴명 없음)';
                      const qty = item.count || item.quantity || item.qty || 1;
                      const itemPrice = typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.amount || item.totalPrice || 0);
                      const cancelledQty = item.cancelledQuantity || 0;
                      const isFullyCancelled = item.cancelled === true || cancelledQty >= qty;
                      const isPartlyCancelled = cancelledQty > 0 && cancelledQty < qty;
                      const remainingQty = qty - cancelledQty;
                      const optionText = formatOrderItemOption(item.option);

                      return (
                        <div key={idx} className={`flex items-center justify-between text-[13px] py-0.5 group ${isFullyCancelled ? 'opacity-50' : ''}`}>
                          <div className={`flex-1 pr-2 ${isFullyCancelled ? 'text-[#91959a] line-through' : 'text-[#383c40]'}`}>
                            <span className="truncate">
                              {menuName}
                              {qty > 1 && (
                                <span className="text-[#91959a] ml-1">x{qty}</span>
                              )}
                              {isFullyCancelled && (
                                <span className="ml-2 text-[12px] text-[color:var(--ad-muted)]">(취소됨)</span>
                              )}
                              {isPartlyCancelled && (
                                <span className="ml-2 text-[12px] text-[color:var(--ad-muted)]">({cancelledQty}개 취소)</span>
                              )}
                            </span>
                            {optionText && (
                              <div className="text-[12px] text-[#91959a] mt-0.5">{optionText}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {itemPrice > 0 && (
                              <span className={`${isFullyCancelled ? 'text-[#91959a] line-through' : 'text-[#55595e]'}`}>
                                {formatNumber(itemPrice)}원
                              </span>
                            )}
                            {!isFullyCancelled && cancelMode && remainingQty > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCancelItem(order.id, idx, menuName, itemPrice, qty, cancelledQty);
                                }}
                                className="p-1.5 rounded-full bg-white text-[color:var(--ad-neg)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[#fff2f5] transition-colors"
                                title="적립 취소"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#91959a]">메뉴 정보 없음</p>
                )}
              </div>
            ))}
          </div>
          {/* Scroll indicator gradient */}
          <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  );
}
