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
  regionSido?: string | null;     // 시/도 (DB는 줄임말: 서울, 경기 …)
  regionSigungu?: string | null;  // 시/군/구
  consentMarketing?: boolean;     // 마케팅 수신 동의
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
  consentMarketing?: string; // 마케팅 수신 동의 원문 (동의/미동의/Y/N 등, 빈 값이면 서버에서 동의 처리)
  regionSido?: string;       // 지역 — 시/도 (정식명칭으로 정규화)
  regionSigungu?: string;    // 지역 — 시/군/구
  row?: number; // 엑셀 행 번호 (오류 위치 표시용)
}

// 대량 등록 결과
export interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; phone: string; reason: string }>;
}

// 대량 등록 진행 상태
export interface BulkUploadProgress {
  done: number;
  total: number;
}

// ─── 지역 / 마케팅 수신 동의 헬퍼 ───────────────────────────────

// 시/도 목록. value 는 Customer.regionSido 저장 형식(줄임말), label 은 정식명칭.
export const SIDO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '서울', label: '서울특별시' },
  { value: '부산', label: '부산광역시' },
  { value: '대구', label: '대구광역시' },
  { value: '인천', label: '인천광역시' },
  { value: '광주', label: '광주광역시' },
  { value: '대전', label: '대전광역시' },
  { value: '울산', label: '울산광역시' },
  { value: '세종', label: '세종특별자치시' },
  { value: '경기', label: '경기도' },
  { value: '강원', label: '강원특별자치도' },
  { value: '충북', label: '충청북도' },
  { value: '충남', label: '충청남도' },
  { value: '전북', label: '전북특별자치도' },
  { value: '전남', label: '전라남도' },
  { value: '경북', label: '경상북도' },
  { value: '경남', label: '경상남도' },
  { value: '제주', label: '제주특별자치도' },
];

const SIDO_SHORT_TO_FULL: Record<string, string> = Object.fromEntries(SIDO_OPTIONS.map((o) => [o.value, o.label]));
// 구 명칭 → 현 정식명칭
const SIDO_LEGACY_TO_FULL: Record<string, string> = { 강원도: '강원특별자치도', 전라북도: '전북특별자치도' };
const SIDO_FULL_NAMES = new Set(SIDO_OPTIONS.map((o) => o.label));

// 시/도 입력(서울, 서울시, 서울특별시, 경기 …)을 정식명칭으로. 알 수 없는 값은 그대로.
export function normalizeSidoName(sido: string | null | undefined): string {
  const s = (sido ?? '').trim();
  if (!s) return '';
  if (SIDO_FULL_NAMES.has(s)) return s;
  if (SIDO_LEGACY_TO_FULL[s]) return SIDO_LEGACY_TO_FULL[s];
  if (SIDO_SHORT_TO_FULL[s]) return SIDO_SHORT_TO_FULL[s];
  const stripped = s.replace(/(특별자치시|특별자치도|특별시|광역시|시|도)$/, '');
  return SIDO_SHORT_TO_FULL[stripped] ?? s;
}

// 엑셀 '지역' 칸("서울 마포구", "서울특별시 마포구")을 첫 공백 기준으로 시/도 + 시/군/구로 분리.
export function parseRegionText(text: unknown): { regionSido?: string; regionSigungu?: string } {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return {};
  const idx = t.indexOf(' ');
  const sido = idx === -1 ? t : t.slice(0, idx);
  const sigungu = idx === -1 ? '' : t.slice(idx + 1).trim();
  return { regionSido: normalizeSidoName(sido) || undefined, regionSigungu: sigungu || undefined };
}

// 목록 표시용 "서울특별시 마포구". 값이 없으면 '-'.
export function formatRegion(sido?: string | null, sigungu?: string | null): string {
  const full = [normalizeSidoName(sido), (sigungu ?? '').trim()].filter(Boolean).join(' ');
  return full || '-';
}

// 엑셀 '마케팅 수신 동의' 칸 해석 (미리보기용 — 최종 판정은 서버). 빈 값은 동의.
export function parseConsentText(value: unknown): boolean {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v) return true;
  if (['Y', 'YES', 'O', 'TRUE', '1', '동의', '예', '동의함'].includes(v)) return true;
  return false;
}
