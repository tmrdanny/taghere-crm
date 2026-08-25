// customers 페이지에서 사용하는 타입 및 순수 헬퍼.

export interface Customer {
  id: string;
  name: string;
  phone: string;
  totalPoints: number;
  totalStamps: number;
  gender: string;
  birthday: string | null;   // MM-DD 형식
  birthYear: number | null;  // YYYY 형식
  memo: string | null;
  feedbackRating: number | null;
  feedbackText: string | null;
  feedbackAt: string | null;
  visitCount: number;
  lastVisitAt: string;
  isVip: boolean;
  isNew: boolean;
  visitSource: string | null;  // 방문 경로
  lastTableLabel: string | null;  // 마지막 방문 좌석
  surveyAnswers: Array<{
    questionId: string;
    label: string;
    type: string;
    valueDate: string | null;
    valueText: string | null;
  }>;
}

export interface PointLedgerEntry {
  id: string;
  delta: number;
  balance: number;
  type: 'EARN' | 'USE' | 'EXPIRE' | 'ADJUST';
  reason: string | null;
  tableLabel: string | null;
  createdAt: string;
}

export interface StampLedgerEntry {
  id: string;
  delta: number;
  balance: number;
  type: string;  // EARN, USE, USE_5~USE_30, ADMIN_ADD, ADMIN_REMOVE
  reason: string | null;
  tableLabel: string | null;
  drawnReward: string | null;
  createdAt: string;
}

export interface CustomerFeedbackEntry {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
}

export interface OrderItem {
  label?: string;  // TagHere API uses 'label' for menu name
  name?: string;
  menuName?: string;
  productName?: string;
  title?: string;
  quantity?: number;
  count?: number;
  qty?: number;
  price?: number;
  amount?: number;
  totalPrice?: number;
  // 옵션 정보. 주문 서비스 버전에 따라 문자열("온도: HOT") 또는 옵션 객체 배열로 들어온다.
  // 렌더링 전 반드시 formatOrderItemOption()으로 문자열화할 것.
  option?: unknown;
  cancelled?: boolean;
  cancelledAt?: string;
  cancelledQuantity?: number;  // 부분 취소된 수량
}

export interface VisitOrOrderEntry {
  id: string;
  orderId: string | null;
  visitedAt: string;
  items: OrderItem[] | null;
  totalAmount: number | null;
  tableNumber: string | null;
}

// 주문 아이템 배열을 안전하게 가져오는 헬퍼 함수
export function getOrderItems(items: unknown): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  // items가 객체이고 내부에 items 배열이 있는 경우 (예: { items: [], tableNumber: '' })
  if (typeof items === 'object' && 'items' in items && Array.isArray((items as any).items)) {
    return (items as any).items;
  }
  return [];
}

// 주문 아이템의 옵션을 표시용 문자열로 변환한다.
// 주문 서비스(V1)는 옵션을 객체 배열로 보내고 구버전은 문자열로 보내는데,
// 객체를 그대로 JSX에 넣으면 React가 렌더 중 throw 해서 페이지 전체가 죽는다.
export function formatOrderItemOption(option: unknown): string {
  if (option == null) return '';
  if (typeof option === 'string') return option.trim();
  if (typeof option === 'number' || typeof option === 'boolean') return String(option);

  if (Array.isArray(option)) {
    return option.map(formatOrderItemOption).filter(Boolean).join(', ');
  }

  if (typeof option === 'object') {
    const o = option as Record<string, unknown>;
    const group = typeof o.optionGroupTitle === 'string' ? o.optionGroupTitle.replace(/\.$/, '').trim() : '';
    const item = [o.optionItemTitle, o.optionItemLabel, o.title, o.name, o.label]
      .find((v) => typeof v === 'string' && v.trim()) as string | undefined;
    if (!item) return '';
    return group ? `${group}: ${item.trim()}` : item.trim();
  }

  return '';
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: number;
  createdAt: string;
}

export interface MessageHistoryEntry {
  id: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  cost: number;
  failReason: string | null;
  sentAt: string | null;
  createdAt: string;
  campaignTitle: string | null;
}

// 대량 등록(엑셀) 파싱 행
export interface BulkRow {
  phone: string;
  name?: string;
  gender?: string;
  birthYear?: string | number;
  birthday?: string;
  memo?: string;
  initialPoints?: number;
  initialStamps?: number;
}

// 대량 등록 결과
export interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; phone: string; reason: string }>;
}
