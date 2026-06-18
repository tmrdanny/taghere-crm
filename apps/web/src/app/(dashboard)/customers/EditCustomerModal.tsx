import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatDate, maskNickname, formatBirthdayMonth, getAgeGroup } from '@/lib/utils';
import { ShoppingBag, MessageSquare, History, Send } from 'lucide-react';
import {
  Customer,
  PointLedgerEntry,
  CustomerFeedbackEntry,
  VisitOrOrderEntry,
  MessageHistoryEntry,
} from './types';
import { OrderHistoryTab } from './edit-tabs/OrderHistoryTab';
import { FeedbackHistoryTab } from './edit-tabs/FeedbackHistoryTab';
import { PointHistoryTab } from './edit-tabs/PointHistoryTab';
import { MessageHistoryTab } from './edit-tabs/MessageHistoryTab';

type EditTab = 'feedback' | 'history' | 'orders' | 'messages';

// 고객 상세/편집 모달. 좌측 정보 폼 + 우측 탭(주문/피드백/포인트/발송내역).
// 폼 상태·내역 데이터·핸들러는 부모에서 관리하고 props로 전달한다.
export function EditCustomerModal({
  open,
  onOpenChange,
  customer,
  name,
  gender,
  onGenderChange,
  birthday,
  birthYear,
  memo,
  onMemoChange,
  tab,
  onTabChange,
  submitting,
  stampRewardTiers,
  onUseStampReward,
  orderHistory,
  feedbackHistory,
  pointHistory,
  messageHistory,
  messageSummary,
  loadingHistory,
  loadingMessages,
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
  onDelete,
  onSave,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  name: string;
  gender: 'MALE' | 'FEMALE';
  onGenderChange: (value: 'MALE' | 'FEMALE') => void;
  birthday: string;
  birthYear: string;
  memo: string;
  onMemoChange: (value: string) => void;
  tab: EditTab;
  onTabChange: (tab: EditTab) => void;
  submitting: boolean;
  stampRewardTiers: number[];
  onUseStampReward: (amount: number) => void;
  orderHistory: VisitOrOrderEntry[];
  feedbackHistory: CustomerFeedbackEntry[];
  pointHistory: PointLedgerEntry[];
  messageHistory: MessageHistoryEntry[];
  messageSummary: { total: number; sent: number; failed: number };
  loadingHistory: boolean;
  loadingMessages: boolean;
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
  onDelete: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const totalStamps = (customer as any)?.totalStamps || 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-x-hidden">
        <ModalHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <ModalTitle>고객 정보</ModalTitle>
            {customer?.isVip && <Badge variant="vip">VIP</Badge>}
            {customer?.isNew && <Badge variant="new">신규</Badge>}
          </div>
        </ModalHeader>

        <div className="py-4 overflow-y-auto overflow-x-hidden flex-1 px-1">
          {/* 2-Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden h-full min-h-[400px]">
            {/* Left Column - Customer Info Form */}
            <div className="space-y-4 min-w-0">
              {/* Read-only info: Visit count, last visit, points, total order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-xs text-neutral-500 mb-1">방문 횟수</p>
                  <p className="font-semibold text-neutral-900">
                    {customer?.visitCount || 0}회
                  </p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-xs text-neutral-500 mb-1">마지막 방문일</p>
                  <p className="font-semibold text-neutral-900">
                    {customer?.lastVisitAt ? formatDate(customer.lastVisitAt) : '-'}
                  </p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-xs text-neutral-500 mb-1">적립 포인트</p>
                  <p className="font-semibold text-neutral-900">
                    {formatNumber(customer?.totalPoints || 0)} P
                  </p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-xs text-neutral-500 mb-1">스탬프</p>
                  <p className="font-semibold text-neutral-900">
                    {totalStamps}개
                  </p>
                </div>
              </div>

              {/* Stamp Use Section */}
              {totalStamps > 0 && (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-neutral-700">스탬프 보상 사용</p>
                  <div className="flex flex-wrap gap-2">
                    {stampRewardTiers.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        disabled={totalStamps < amount || submitting}
                        onClick={() => onUseStampReward(amount)}
                        className="flex-1 min-w-[70px]"
                      >
                        {amount}개 사용
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">
                    고객이 보상을 요청하면 해당 버튼을 눌러주세요.
                  </p>
                </div>
              )}

              {/* Nickname */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-600">닉네임</label>
                <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                  {maskNickname(name)}
                </div>
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-600">성별</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                      gender === 'MALE'
                        ? 'border-brand-800 bg-brand-50 text-brand-800'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                    onClick={() => onGenderChange('MALE')}
                  >
                    남성
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                      gender === 'FEMALE'
                        ? 'border-brand-800 bg-brand-50 text-brand-800'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                    onClick={() => onGenderChange('FEMALE')}
                  >
                    여성
                  </button>
                </div>
              </div>

              {/* Birthday and Age Group */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">생일</label>
                  <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                    {birthday ? formatBirthdayMonth(birthday).replace(' 생일', '') : '-'}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-600">연령대</label>
                  <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
                    {birthYear ? getAgeGroup(parseInt(birthYear, 10)) : '-'}
                  </div>
                </div>
              </div>

              {/* Memo (moved here for left column) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-600">메모</label>
                <textarea
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
                  rows={3}
                  placeholder="고객에 대한 메모를 입력하세요"
                  value={memo}
                  onChange={(e) => onMemoChange(e.target.value)}
                />
              </div>
            </div>

            {/* Right Column - Tabs for Orders, Feedback, History */}
            <div className="flex flex-col min-w-0 overflow-hidden h-full">
              {/* Tab Headers - 2 rows, 3 columns grid */}
              <div className="flex-shrink-0 border-b border-neutral-200">
                <div className="grid grid-cols-3 gap-1">
                  {/* Row 1 */}
                  <button
                    type="button"
                    onClick={() => onTabChange('orders')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'orders'
                        ? 'border-brand-800 text-brand-800 bg-brand-50'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                    <span>주문</span>
                    {(orderHistory?.length || 0) > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                        {orderHistory.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('feedback')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'feedback'
                        ? 'border-brand-800 text-brand-800 bg-brand-50'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span>피드백</span>
                    {(feedbackHistory?.length || 0) > 0 && (
                      <span className="text-yellow-500">★{feedbackHistory.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('history')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'history'
                        ? 'border-brand-800 text-brand-800 bg-brand-50'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <History className="w-4 h-4 flex-shrink-0" />
                    <span>포인트</span>
                    {(pointHistory?.length || 0) > 0 && (
                      <span className="text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">
                        {pointHistory.length}
                      </span>
                    )}
                  </button>
                  {/* Row 2 */}
                  <button
                    type="button"
                    onClick={() => onTabChange('messages')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'messages'
                        ? 'border-brand-800 text-brand-800 bg-brand-50'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <Send className="w-4 h-4 flex-shrink-0" />
                    <span>발송내역</span>
                    {messageSummary.total > 0 && (
                      <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                        {messageSummary.total}
                      </span>
                    )}
                  </button>
                  {/* Empty cells for grid alignment */}
                  <div></div>
                  <div></div>
                </div>
              </div>

              {tab === 'orders' && (
                <OrderHistoryTab
                  orderHistory={orderHistory}
                  loadingHistory={loadingHistory}
                  showDateFilter={showDateFilter}
                  onToggleDateFilter={onToggleDateFilter}
                  cancelMode={cancelMode}
                  onToggleCancelMode={onToggleCancelMode}
                  orderStartDate={orderStartDate}
                  onStartDateChange={onStartDateChange}
                  orderEndDate={orderEndDate}
                  onEndDateChange={onEndDateChange}
                  onApplyFilter={onApplyFilter}
                  onResetFilter={onResetFilter}
                  onCancelItem={onCancelItem}
                />
              )}

              {tab === 'feedback' && (
                <FeedbackHistoryTab
                  feedbackHistory={feedbackHistory}
                  loadingHistory={loadingHistory}
                />
              )}

              {tab === 'history' && (
                <PointHistoryTab
                  pointHistory={pointHistory}
                  loadingHistory={loadingHistory}
                />
              )}

              {tab === 'messages' && (
                <MessageHistoryTab
                  messageHistory={messageHistory}
                  messageSummary={messageSummary}
                  loadingMessages={loadingMessages}
                />
              )}
            </div>
          </div>
        </div>

        <ModalFooter className="flex-shrink-0">
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={submitting}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 mr-auto"
          >
            고객 삭제
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            onClick={onSave}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? '저장 중...' : '저장하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
