// 고객 그룹(세그먼트) 조건 타입 — API services/segment-engine.ts 의 SegmentConditions 와 같은 모양
export interface MenuCondition {
  names: string[];
  mode: 'ANY' | 'NONE';
  minOrders?: number;
  withinDays?: number;
}

export interface SegmentConditions {
  visitCountMin?: number;
  visitCountMax?: number;
  lastVisitWithinDays?: number;
  lastVisitOverDays?: number;
  joinedWithinDays?: number;
  genders?: Array<'MALE' | 'FEMALE'>;
  ageGroups?: string[];
  birthdayMonths?: number[];
  totalSpentMin?: number;
  totalSpentMax?: number;
  avgSpendMin?: number;
  menus?: MenuCondition[];
  stampsMin?: number;
  stampsMax?: number;
  pointsMin?: number;
  pointsMax?: number;
  earnedPointsMin?: number;
  visitSources?: string[];
  /** 직접 추가한 손님 (조건과 상관없이 포함) */
  includeIds?: string[];
  /** 직접 뺀 손님 (조건에 맞아도 제외) */
  excludeIds?: string[];
}

/** 직접 추가·제외를 뺀 조건만 */
export function filterOnly(c: SegmentConditions): SegmentConditions {
  const { includeIds: _i, excludeIds: _e, ...rest } = c;
  return rest;
}

export interface SavedSegment {
  id: string;
  name: string;
  conditions: SegmentConditions;
  createdAt: string;
}

export const AGE_GROUP_LABELS: Record<string, string> = {
  TWENTIES: '20대',
  THIRTIES: '30대',
  FORTIES: '40대',
  FIFTIES: '50대',
  SIXTY_PLUS: '60대+',
};

export const SEGMENT_PRESETS: Array<{ label: string; description: string; conditions: () => SegmentConditions }> = [
  { label: '단골', description: '5회+ 방문, 45일 내 방문', conditions: () => ({ visitCountMin: 5, lastVisitWithinDays: 45 }) },
  { label: '이탈 위험', description: '2회+ 방문, 45일 이상 미방문', conditions: () => ({ visitCountMin: 2, lastVisitOverDays: 45 }) },
  { label: '장기 미방문', description: '90일 이상 미방문', conditions: () => ({ lastVisitOverDays: 90 }) },
  { label: '신규', description: '최근 30일 내 등록', conditions: () => ({ joinedWithinDays: 30 }) },
  { label: '이번 달 생일', description: '생일이 이번 달', conditions: () => ({ birthdayMonths: [new Date().getMonth() + 1] }) },
  { label: '큰손', description: '누적 결제 10만원+', conditions: () => ({ totalSpentMin: 100000 }) },
];

const won = (n: number) => `${n.toLocaleString()}원`;
const num = (n: number) => n.toLocaleString();

function range(label: string, min: number | undefined, max: number | undefined, unit: string, fmt = num): string | null {
  if (min !== undefined && max !== undefined) return `${label} ${fmt(min)}~${fmt(max)}${unit}`;
  if (min !== undefined) return `${label} ${fmt(min)}${unit} 이상`;
  if (max !== undefined) return `${label} ${fmt(max)}${unit} 이하`;
  return null;
}

/** 조건을 사람이 읽는 문장 목록으로 */
export function describeConditions(c: SegmentConditions): string[] {
  const out: string[] = [];
  if (c.visitCountMin !== undefined && c.visitCountMax !== undefined) out.push(`방문 ${c.visitCountMin}~${c.visitCountMax}회`);
  else if (c.visitCountMin !== undefined) out.push(`방문 ${c.visitCountMin}회 이상`);
  else if (c.visitCountMax !== undefined) out.push(`방문 ${c.visitCountMax}회 이하`);
  if (c.lastVisitWithinDays !== undefined) out.push(`최근 ${c.lastVisitWithinDays}일 내 방문`);
  if (c.lastVisitOverDays !== undefined) out.push(`${c.lastVisitOverDays}일 이상 미방문`);
  if (c.joinedWithinDays !== undefined) out.push(`최근 ${c.joinedWithinDays}일 내 등록`);
  if (c.totalSpentMin !== undefined && c.totalSpentMax !== undefined) out.push(`누적 결제 ${won(c.totalSpentMin)}~${won(c.totalSpentMax)}`);
  else if (c.totalSpentMin !== undefined) out.push(`누적 결제 ${won(c.totalSpentMin)} 이상`);
  else if (c.totalSpentMax !== undefined) out.push(`누적 결제 ${won(c.totalSpentMax)} 이하`);
  if (c.avgSpendMin !== undefined) out.push(`객단가 ${won(c.avgSpendMin)} 이상`);
  for (const m of c.menus ?? []) {
    const names = m.names.length > 2 ? `${m.names.slice(0, 2).join(', ')} 외 ${m.names.length - 2}개` : m.names.join(', ');
    const period = m.withinDays ? `최근 ${m.withinDays}일 ` : '';
    out.push(
      m.mode === 'NONE'
        ? `${period}${names} 주문한 적 없음`
        : `${period}${names} ${m.minOrders && m.minOrders > 1 ? `${m.minOrders}회 이상 ` : ''}주문`
    );
  }
  if (c.genders?.length) out.push(c.genders.map((g) => (g === 'MALE' ? '남성' : '여성')).join('/'));
  if (c.ageGroups?.length) out.push(c.ageGroups.map((a) => AGE_GROUP_LABELS[a] ?? a).join('/'));
  if (c.birthdayMonths?.length) out.push(`${[...c.birthdayMonths].sort((a, b) => a - b).join(', ')}월 생일`);
  const stamps = range('스탬프', c.stampsMin, c.stampsMax, '개');
  if (stamps) out.push(stamps);
  const points = range('보유 포인트', c.pointsMin, c.pointsMax, 'P');
  if (points) out.push(points);
  if (c.earnedPointsMin !== undefined) out.push(`누적 적립 ${num(c.earnedPointsMin)}P 이상`);
  if (c.visitSources?.length) out.push(`방문 경로 ${c.visitSources.length}개`);
  if (c.includeIds?.length) out.push(`직접 추가 ${c.includeIds.length}명`);
  if (c.excludeIds?.length) out.push(`제외 ${c.excludeIds.length}명`);
  return out;
}

export function hasAnyCondition(c: SegmentConditions): boolean {
  return describeConditions(c).length > 0;
}
