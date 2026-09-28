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
import { ShoppingBag, MessageSquare, History, Send, Stamp, Star } from 'lucide-react';
import {
  Customer,
  PointLedgerEntry,
  StampLedgerEntry,
  CustomerFeedbackEntry,
  VisitOrOrderEntry,
  MessageHistoryEntry,
} from './types';
import { OrderHistoryTab } from './edit-tabs/OrderHistoryTab';
import { FeedbackHistoryTab } from './edit-tabs/FeedbackHistoryTab';
import { PointHistoryTab } from './edit-tabs/PointHistoryTab';
import { StampHistoryTab } from './edit-tabs/StampHistoryTab';
import { MessageHistoryTab } from './edit-tabs/MessageHistoryTab';

type EditTab = 'feedback' | 'history' | 'stamps' | 'orders' | 'messages';

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
  stampHistory,
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
  stampHistory: StampLedgerEntry[];
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
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-4xl max-h-[85vh] flex flex-col overflow-x-hidden">
        <ModalHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">고객 정보</ModalTitle>
            {customer?.isVip && <Badge variant="vip" className="inline-flex rounded-full border-0 bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">VIP</Badge>}
            {customer?.isNew && <Badge variant="new" className="inline-flex rounded-full border-0 bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">신규</Badge>}
          </div>
        </ModalHeader>

        <div className="py-4 overflow-y-auto overflow-x-hidden flex-1 px-1">
          {/* 2-Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden h-full min-h-[400px]">
            {/* Left Column - Customer Info Form */}
            <div className="space-y-4 min-w-0">
              {/* Read-only info: Visit count, last visit, points, total order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#f8f9fa] rounded-[10px]">
                  <p className="text-[12px] text-[#55595e] mb-1">방문 횟수</p>
                  <p className="font-medium text-[color:var(--ad-ink)]">
                    {customer?.visitCount || 0}회
                  </p>
                </div>
                <div className="p-3 bg-[#f8f9fa] rounded-[10px]">
                  <p className="text-[12px] text-[#55595e] mb-1">마지막 방문일</p>
                  <p className="font-medium text-[color:var(--ad-ink)]">
                    {customer?.lastVisitAt ? formatDate(customer.lastVisitAt) : '-'}
                  </p>
                </div>
                <div className="p-3 bg-[#f8f9fa] rounded-[10px]">
                  <p className="text-[12px] text-[#55595e] mb-1">적립 포인트</p>
                  <p className="font-medium text-[color:var(--ad-ink)]">
                    {formatNumber(customer?.totalPoints || 0)} P
                  </p>
                </div>
                <div className="p-3 bg-[#f8f9fa] rounded-[10px]">
                  <p className="text-[12px] text-[#55595e] mb-1">스탬프</p>
                  <p className="font-medium text-[color:var(--ad-ink)]">
                    {totalStamps}개
                  </p>
                </div>
              </div>

              {/* Stamp Use Section */}
              {totalStamps > 0 && (
                <div className="p-3 bg-[#f8f9fa] border border-[#ebeced] rounded-[10px] space-y-2">
                  <p className="text-[13px] font-medium text-[#383c40]">스탬프 보상 사용</p>
                  <div className="flex flex-wrap gap-2">
                    {stampRewardTiers.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        disabled={totalStamps < amount || submitting}
                        onClick={() => onUseStampReward(amount)}
                        className="ad-press h-9 flex-1 min-w-[70px] rounded-[10px] border-0 bg-white px-3 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                      >
                        {amount}개 사용
                      </Button>
                    ))}
                  </div>
                  <p className="text-[12px] text-[#55595e]">
                    고객이 보상을 요청하면 해당 버튼을 눌러주세요.
                  </p>
                </div>
              )}

              {/* Nickname */}
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#383c40]">닉네임</label>
                <div className="px-3 py-2 bg-[#f8f9fa] border border-[#ebeced] rounded-[10px] text-[13px] text-[#383c40]">
                  {maskNickname(name)}
                </div>
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#383c40]">성별</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2 px-4 rounded-[10px] border-2 transition-colors ${
                      gender === 'MALE'
                        ? 'border-[color:var(--ad-ink)] bg-white font-medium text-[color:var(--ad-ink)]'
                        : 'border-[#ebeced] text-[#383c40] hover:border-[#d1d3d6]'
                    }`}
                    onClick={() => onGenderChange('MALE')}
                  >
                    남성
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 px-4 rounded-[10px] border-2 transition-colors ${
                      gender === 'FEMALE'
                        ? 'border-[color:var(--ad-ink)] bg-white font-medium text-[color:var(--ad-ink)]'
                        : 'border-[#ebeced] text-[#383c40] hover:border-[#d1d3d6]'
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
                  <label className="text-[13px] font-medium text-[#383c40]">생일</label>
                  <div className="px-3 py-2 bg-[#f8f9fa] border border-[#ebeced] rounded-[10px] text-[13px] text-[#383c40]">
                    {birthday ? formatBirthdayMonth(birthday).replace(' 생일', '') : '-'}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#383c40]">연령대</label>
                  <div className="px-3 py-2 bg-[#f8f9fa] border border-[#ebeced] rounded-[10px] text-[13px] text-[#383c40]">
                    {birthYear ? getAgeGroup(parseInt(birthYear, 10)) : '-'}
                  </div>
                </div>
              </div>

              {/* Memo (moved here for left column) */}
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#383c40]">메모</label>
                <textarea
                  className="w-full resize-none rounded-[10px] border border-[#d1d3d6] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[#91959a] focus:border-[#131651] focus:outline-none"
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
              <div className="flex-shrink-0 border-b border-[#ebeced]">
                <div className="grid grid-cols-3 gap-1">
                  {/* Row 1 */}
                  <button
                    type="button"
                    onClick={() => onTabChange('orders')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      tab === 'orders'
                        ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]'
                        : 'border-transparent text-[#55595e] hover:text-[#383c40] hover:bg-[#f8f9fa]'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                    <span>주문</span>
                    {(orderHistory?.length || 0) > 0 && (
                      <span className="text-[11px] bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] px-1.5 py-0.5 rounded-full">
                        {orderHistory.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('feedback')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      tab === 'feedback'
                        ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]'
                        : 'border-transparent text-[#55595e] hover:text-[#383c40] hover:bg-[#f8f9fa]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span>피드백</span>
                    {(feedbackHistory?.length || 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[color:var(--ad-muted)]"><Star className="h-3 w-3" strokeWidth={2} />{feedbackHistory.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('messages')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      tab === 'messages'
                        ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]'
                        : 'border-transparent text-[#55595e] hover:text-[#383c40] hover:bg-[#f8f9fa]'
                    }`}
                  >
                    <Send className="w-4 h-4 flex-shrink-0" />
                    <span>발송내역</span>
                    {messageSummary.total > 0 && (
                      <span className="text-[11px] bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] px-1.5 py-0.5 rounded-full">
                        {messageSummary.total}
                      </span>
                    )}
                  </button>
                  {/* Row 2 */}
                  <button
                    type="button"
                    onClick={() => onTabChange('history')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      tab === 'history'
                        ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]'
                        : 'border-transparent text-[#55595e] hover:text-[#383c40] hover:bg-[#f8f9fa]'
                    }`}
                  >
                    <History className="w-4 h-4 flex-shrink-0" />
                    <span>포인트</span>
                    {(pointHistory?.length || 0) > 0 && (
                      <span className="text-[11px] bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] px-1.5 py-0.5 rounded-full">
                        {pointHistory.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('stamps')}
                    className={`flex items-center justify-center gap-1 px-2 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      tab === 'stamps'
                        ? 'border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]'
                        : 'border-transparent text-[#55595e] hover:text-[#383c40] hover:bg-[#f8f9fa]'
                    }`}
                  >
                    <Stamp className="w-4 h-4 flex-shrink-0" />
                    <span>스탬프</span>
                    {(stampHistory?.length || 0) > 0 && (
                      <span className="text-[11px] bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] px-1.5 py-0.5 rounded-full">
                        {stampHistory.length}
                      </span>
                    )}
                  </button>
                  {/* Empty cell for grid alignment */}
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

              {tab === 'stamps' && (
                <StampHistoryTab
                  stampHistory={stampHistory}
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
            className="mr-auto h-10 rounded-[12px] text-[13px] font-medium text-[color:var(--ad-neg)] hover:bg-[#fff2f5] hover:text-[color:var(--ad-neg)]"
          >
            고객 삭제
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            취소
          </Button>
          <Button
            onClick={onSave}
            disabled={submitting}
            className="flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            {submitting ? '저장 중...' : '저장하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
