// 고객 발송 대상 필터 유틸리티
// (SMS 캠페인, 카카오톡 캠페인, 리타겟 쿠폰 등 발송 기능에서 공통 사용)

// 연령대 → 출생연도 범위
export function getAgeGroupBirthYearRange(ageGroup: string): { gte: number; lte: number } | null {
  const currentYear = new Date().getFullYear();
  switch (ageGroup) {
    case 'TWENTIES':
      return { gte: currentYear - 29, lte: currentYear - 20 };
    case 'THIRTIES':
      return { gte: currentYear - 39, lte: currentYear - 30 };
    case 'FORTIES':
      return { gte: currentYear - 49, lte: currentYear - 40 };
    case 'FIFTIES':
      return { gte: currentYear - 59, lte: currentYear - 50 };
    case 'SIXTY_PLUS':
      return { gte: 1900, lte: currentYear - 60 };
    default:
      return null;
  }
}

// 지역 필터를 Prisma where 조건 배열로 변환
// regionSigungus: ["서울/강남구", "서울/송파구"] 형태
export function buildRegionConditions(regionSidos?: string[], regionSigungus?: string[]): any[] {
  if (!regionSidos || regionSidos.length === 0) return [];

  const sigunguMap: Record<string, string[]> = {};
  if (regionSigungus && regionSigungus.length > 0) {
    for (const item of regionSigungus) {
      const [sido, sigungu] = item.split('/');
      if (sido && sigungu) {
        if (!sigunguMap[sido]) sigunguMap[sido] = [];
        sigunguMap[sido].push(sigungu);
      }
    }
  }

  return regionSidos.map((sido) => {
    const sigungus = sigunguMap[sido];
    if (sigungus && sigungus.length > 0) {
      return { regionSido: sido, regionSigungu: { in: sigungus } };
    }
    return { regionSido: sido };
  });
}

// 성별/연령대/지역 통합 필터 → Prisma where 조건
export function buildFilterConditions(
  genderFilter?: string,
  ageGroups?: string[],
  regionSidos?: string[],
  regionSigungus?: string[],
): any {
  const conditions: any = {};

  if (genderFilter && genderFilter !== 'all') {
    conditions.gender = genderFilter;
  }

  if (ageGroups && ageGroups.length > 0) {
    const birthYearConditions: any[] = [];
    for (const ageGroup of ageGroups) {
      const range = getAgeGroupBirthYearRange(ageGroup);
      if (range) {
        birthYearConditions.push({ birthYear: range });
      }
    }
    if (birthYearConditions.length > 0) {
      conditions.OR = birthYearConditions;
    }
  }

  const regionConditions = buildRegionConditions(regionSidos, regionSigungus);
  if (regionConditions.length > 0) {
    conditions.AND = [
      ...(conditions.AND || []),
      { OR: regionConditions },
    ];
  }

  return conditions;
}

// targetType + 필터를 합쳐 매장의 발송 대상 고객 목록(id+phone)을 페이지네이션 없이 반환.
// 발송 흐름에서 "프론트엔드가 페이지네이션된 리스트 API를 호출해 IDs를 모으는" 안티패턴을 피하기 위해 사용.
export async function resolveTargetCustomerIds(
  prisma: any,
  storeId: string,
  options: {
    targetType?: string;             // 'ALL' | 'REVISIT' | 'NEW' | 'CUSTOM'
    customerIds?: string[];          // targetType === 'CUSTOM' 시 우선 적용
    genderFilter?: string;
    ageGroups?: string[];
    regionSidos?: string[];
    regionSigungus?: string[];
  },
): Promise<{ id: string; phone: string | null }[]> {
  const filterConditions = buildFilterConditions(
    options.genderFilter,
    options.ageGroups,
    options.regionSidos,
    options.regionSigungus,
  );

  // CUSTOM: 명시된 ID만 사용 (필터는 적용하지 않음 — 이미 사용자가 직접 선택)
  if (options.targetType === 'CUSTOM' && options.customerIds && options.customerIds.length > 0) {
    return prisma.customer.findMany({
      where: { storeId, id: { in: options.customerIds }, phone: { not: null } },
      select: { id: true, phone: true },
    });
  }

  const where: any = { storeId, phone: { not: null }, ...filterConditions };

  if (options.targetType === 'REVISIT') {
    where.visitCount = { gte: 2 };
  } else if (options.targetType === 'NEW') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    where.createdAt = { gte: thirtyDaysAgo };
  }

  return prisma.customer.findMany({
    where,
    select: { id: true, phone: true },
  });
}
