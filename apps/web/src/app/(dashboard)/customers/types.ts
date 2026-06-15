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
  option?: string;  // 옵션 정보 (예: "온도: HOT")
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
