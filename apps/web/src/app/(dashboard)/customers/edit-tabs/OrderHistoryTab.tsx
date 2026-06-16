import { Button } from '@/components/ui/button';
import { formatNumber, formatDate } from '@/lib/utils';
import { Calendar, X } from 'lucide-react';
import { OrderItem, VisitOrOrderEntry, getOrderItems } from '../types';

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
          className="text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" />
          날짜 조회
        </Button>
        <Button
          variant={cancelMode ? 'destructive' : 'secondary'}
          size="sm"
          onClick={onToggleCancelMode}
          className="text-xs px-3 py-1.5 h-auto flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          적립 취소
        </Button>
      </div>

      {/* Date Filter - Conditional */}
      {showDateFilter && (
        <div className="mb-3 flex-shrink-0 p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={orderStartDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800 flex-1 min-w-0"
            />
            <span className="text-neutral-400 text-sm">~</span>
            <input
              type="date"
              value={orderEndDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800 flex-1 min-w-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onApplyFilter}
              disabled={loadingHistory}
              className="text-sm px-4 py-1.5 h-auto flex-1"
            >
              조회
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilter}
              className="text-sm px-4 py-1.5 h-auto flex-1 text-neutral-500"
            >
              초기화
            </Button>
          </div>
        </div>
      )}

      {loadingHistory && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (orderHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          주문 내역이 없습니다.
        </div>
      )}
      {!loadingHistory && (orderHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-3 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {(orderHistory || []).map((order) => (
              <div
                key={order.id}
                className="p-3 bg-neutral-50 rounded-lg border border-neutral-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">
                      {order.totalAmount ? `${formatNumber(order.totalAmount)}원` : '금액 미입력'}
                    </span>
                    {order.tableNumber && (
                      <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                        {order.tableNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {formatDate(order.visitedAt)} {new Date(order.visitedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </div>
                {getOrderItems(order.items).length > 0 ? (
                  <div className="space-y-1.5 pt-1 border-t border-neutral-200 mt-2">
                    {getOrderItems(order.items).map((item: OrderItem, idx: number) => {
                      const menuName = item.label || item.name || item.menuName || item.productName || item.title || '(메뉴명 없음)';
                      const qty = item.count || item.quantity || item.qty || 1;
                      const itemPrice = typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.amount || item.totalPrice || 0);
                      const cancelledQty = item.cancelledQuantity || 0;
                      const isFullyCancelled = item.cancelled === true || cancelledQty >= qty;
                      const isPartlyCancelled = cancelledQty > 0 && cancelledQty < qty;
                      const remainingQty = qty - cancelledQty;

                      return (
                        <div key={idx} className={`flex items-center justify-between text-sm py-0.5 group ${isFullyCancelled ? 'opacity-50' : ''}`}>
                          <div className={`flex-1 pr-2 ${isFullyCancelled ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                            <span className="truncate">
                              {menuName}
                              {qty > 1 && (
                                <span className="text-neutral-400 ml-1">x{qty}</span>
                              )}
                              {isFullyCancelled && (
                                <span className="ml-2 text-xs text-red-500">(취소됨)</span>
                              )}
                              {isPartlyCancelled && (
                                <span className="ml-2 text-xs text-orange-500">({cancelledQty}개 취소)</span>
                              )}
                            </span>
                            {item.option && (
                              <div className="text-xs text-neutral-400 mt-0.5">{item.option}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {itemPrice > 0 && (
                              <span className={`${isFullyCancelled ? 'text-neutral-400 line-through' : 'text-neutral-500'}`}>
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
                                className="p-1.5 rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors"
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
                  <p className="text-xs text-neutral-400">메뉴 정보 없음</p>
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
