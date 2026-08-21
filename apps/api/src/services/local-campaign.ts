// local-customers / franchise-local-customers 라우트가 공유하는 지역 캠페인 서비스.
// 매장(store)/프랜차이즈(franchise) 스코프 차이는 LocalCampaignScope 분기로 보존한다.
// 두 스코프의 의도적 동작 차이(카테고리 필터 결합 방식, '미지정' 지역 처리,
// Wallet vs FranchiseWallet, 캠페인/메시지 행의 storeId vs franchiseId 등)는
// 현행 동작 그대로 유지한다 — 통일하지 말 것 (특성화 테스트로 고정됨).
import { SolapiMessageService } from 'solapi';
import { prisma } from '../lib/prisma.js';
import { SolapiService, BrandMessageButton, buildPhoneResultMap } from './solapi.js';
import { getSolapiService } from './solapi-instance.js';
import { isSendableTime, getNextSendableTime } from '../utils/send-window.js';

// 건당 비용 (외부 고객 SMS)
const EXTERNAL_SMS_COST = 150;

// 카카오톡 브랜드 메시지 비용 (건당)
const EXTERNAL_KAKAO_TEXT_COST = 200;
const EXTERNAL_KAKAO_IMAGE_COST = 230;

// 오너 스코프: 매장(storeId) 또는 프랜차이즈(franchiseId)
export type LocalCampaignScope =
  | { kind: 'store'; storeId: string }
  | { kind: 'franchise'; franchiseId: string };

// 서비스 결과 — 라우트가 res.status(status).json(body) 로 응답을 만든다.
export type LocalCampaignResult = { status: number; body: unknown };

// 캠페인/메시지 행의 소유자 필드 (store: storeId / franchise: franchiseId)
function ownerData(scope: LocalCampaignScope): { storeId: string } | { franchiseId: string } {
  return scope.kind === 'store' ? { storeId: scope.storeId } : { franchiseId: scope.franchiseId };
}

// 지갑 조회 (store: Wallet / franchise: FranchiseWallet)
async function findWallet(scope: LocalCampaignScope) {
  return scope.kind === 'store'
    ? prisma.wallet.findUnique({ where: { storeId: scope.storeId } })
    : prisma.franchiseWallet.findUnique({ where: { franchiseId: scope.franchiseId } });
}

// 지역 필터 조건 빌드 헬퍼
// ExternalCustomer용 (regionSido: String, non-nullable) — store 스코프: '미지정' → '' 매칭
export function buildExternalRegionOrConditions(regionFilters: Array<{ sido: string; sigungu?: string }>) {
  return regionFilters.map((r) => {
    if (r.sido === '미지정') {
      return { regionSido: '' };
    }
    if (r.sigungu) {
      return { regionSido: r.sido, regionSigungu: r.sigungu };
    }
    return { regionSido: r.sido };
  });
}

// Customer용 (regionSido: String?, nullable) — store 스코프: '미지정' → null/'' 매칭
export function buildCustomerRegionOrConditions(regionFilters: Array<{ sido: string; sigungu?: string }>) {
  return regionFilters.map((r) => {
    if (r.sido === '미지정') {
      return { OR: [{ regionSido: null }, { regionSido: '' }] } as any;
    }
    if (r.sigungu) {
      return { regionSido: r.sido, regionSigungu: r.sigungu };
    }
    return { regionSido: r.sido };
  });
}

// franchise 스코프(및 양쪽 kakao/send): '미지정' 특수 처리 없이 리터럴 매칭 (현행 동작 보존)
function buildLiteralRegionOrConditions(regionFilters: Array<{ sido: string; sigungu?: string }>) {
  return regionFilters.map((r) => {
    if (r.sigungu) {
      return { regionSido: r.sido, regionSigungu: r.sigungu };
    } else {
      return { regionSido: r.sido };
    }
  });
}

// 시/도 줄임말 → 전체 이름 매핑 (Customer DB용, store 스코프 region-counts 에서만 사용)
const SIDO_SHORT_TO_FULL: Record<string, string> = {
  서울: '서울특별시',
  경기: '경기도',
  인천: '인천광역시',
  부산: '부산광역시',
  대구: '대구광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

// 전체 이름 → 시/도 줄임말 매핑 (역변환용)
const SIDO_FULL_TO_SHORT: Record<string, string> = Object.fromEntries(
  Object.entries(SIDO_SHORT_TO_FULL).map(([short, full]) => [full, short])
);

// store 스코프는 Customer 의 전체 이름(예: 서울특별시)을 줄임말(서울)로 변환해 합산한다.
// franchise 스코프는 변환 없이 그대로 사용한다 (현행 동작 보존).
function toCustomerSidoKey(scope: LocalCampaignScope, regionSido: string) {
  return scope.kind === 'store' ? SIDO_FULL_TO_SHORT[regionSido] || regionSido : regionSido;
}

// GET /regions - 지역 목록 조회 (ExternalCustomer 기반)
export async function getRegions(query: Record<string, any>): Promise<LocalCampaignResult> {
  const { sido } = query;

  if (!sido) {
    // 시/도 목록 조회 (ExternalCustomer에 있는 지역만)
    const sidos = await prisma.externalCustomer.findMany({
      select: { regionSido: true },
      distinct: ['regionSido'],
      orderBy: { regionSido: 'asc' },
    });

    return {
      status: 200,
      body: {
        sidos: sidos.map((r) => r.regionSido),
        sigungus: [],
      },
    };
  }

  // 특정 시/도의 시/군/구 목록 조회
  const sigungus = await prisma.externalCustomer.findMany({
    where: { regionSido: sido as string },
    select: { regionSigungu: true },
    distinct: ['regionSigungu'],
    orderBy: { regionSigungu: 'asc' },
  });

  return {
    status: 200,
    body: {
      sidos: [],
      sigungus: sigungus.map((r) => r.regionSigungu),
    },
  };
}

// GET /total-count - 전체 고객 수 조회 (ExternalCustomer + 전체 CRM 고객)
export async function getTotalCustomerCount(): Promise<LocalCampaignResult> {
  // 1. ExternalCustomer 수 조회
  const externalCount = await prisma.externalCustomer.count({
    where: { consentMarketing: true },
  });

  // 2. 전체 CRM 고객 수 조회 (모든 매장의 고객)
  const customerCount = await prisma.customer.count({
    where: { consentMarketing: true },
  });

  // 3. 통합 카운트 반환
  const totalCount = externalCount + customerCount;

  return {
    status: 200,
    body: {
      totalCount,
      breakdown: {
        external: externalCount,
        customer: customerCount,
      },
    },
  };
}

// GET /region-counts - 지역별 고객 수 조회
export async function getRegionCounts(scope: LocalCampaignScope): Promise<LocalCampaignResult> {
  // 1. ExternalCustomer 시/도별 카운트 (줄임말 사용: 서울, 경기)
  const externalSidoCounts = await prisma.externalCustomer.groupBy({
    by: ['regionSido'],
    where: { consentMarketing: true, regionSido: { not: '' } },
    _count: { _all: true },
  });

  // 2. Customer 시/도별 카운트
  const customerSidoCounts = await prisma.customer.groupBy({
    by: ['regionSido'],
    where: { consentMarketing: true, regionSido: { not: '' } },
    _count: { _all: true },
  });

  // 3. Customer 시/군/구별 카운트
  const customerSigunguCounts = await prisma.customer.groupBy({
    by: ['regionSido', 'regionSigungu'],
    where: { consentMarketing: true, regionSido: { not: '' }, regionSigungu: { not: '' } },
    _count: { _all: true },
  });

  // 4. ExternalCustomer 시/군/구별 카운트
  const externalSigunguCounts = await prisma.externalCustomer.groupBy({
    by: ['regionSido', 'regionSigungu'],
    where: { consentMarketing: true, regionSido: { not: '' }, regionSigungu: { not: '' } },
    _count: { _all: true },
  });

  // 시/도별 통합 카운트 계산
  const sidoCountMap: Record<string, number> = {};

  // ExternalCustomer 카운트 (이미 줄임말 사용)
  externalSidoCounts.forEach((item) => {
    if (item.regionSido) {
      sidoCountMap[item.regionSido] = (sidoCountMap[item.regionSido] || 0) + (item._count?._all || 0);
    }
  });

  // Customer 카운트 (store: 전체 이름을 줄임말로 변환하여 합산 / franchise: 그대로)
  customerSidoCounts.forEach((item) => {
    if (item.regionSido) {
      const key = toCustomerSidoKey(scope, item.regionSido);
      sidoCountMap[key] = (sidoCountMap[key] || 0) + (item._count?._all || 0);
    }
  });

  // 시/군/구별 카운트 (Customer + ExternalCustomer 통합)
  const sigunguCountMap: Record<string, Record<string, number>> = {};

  // Customer 시/군/구 카운트 (store: 전체 이름을 줄임말로 변환 / franchise: 그대로)
  customerSigunguCounts.forEach((item) => {
    if (item.regionSido && item.regionSigungu) {
      const key = toCustomerSidoKey(scope, item.regionSido);
      if (!sigunguCountMap[key]) {
        sigunguCountMap[key] = {};
      }
      sigunguCountMap[key][item.regionSigungu] = (sigunguCountMap[key][item.regionSigungu] || 0) + (item._count?._all || 0);
    }
  });

  // ExternalCustomer 시/군/구 카운트 합산 (이미 줄임말 사용)
  externalSigunguCounts.forEach((item) => {
    if (item.regionSido && item.regionSigungu) {
      if (!sigunguCountMap[item.regionSido]) {
        sigunguCountMap[item.regionSido] = {};
      }
      sigunguCountMap[item.regionSido][item.regionSigungu] = (sigunguCountMap[item.regionSido][item.regionSigungu] || 0) + (item._count?._all || 0);
    }
  });

  // store 스코프 전용: 미지정 고객 수 (ExternalCustomer: 빈 문자열, Customer: null 또는 빈 문자열)
  // franchise 스코프에는 미지정 집계가 없다 (현행 동작 보존)
  if (scope.kind === 'store') {
    const [externalUnknown, customerUnknown] = await Promise.all([
      prisma.externalCustomer.count({
        where: { consentMarketing: true, regionSido: '' },
      }),
      prisma.customer.count({
        where: { consentMarketing: true, OR: [{ regionSido: null }, { regionSido: '' }] },
      }),
    ]);
    const unknownCount = externalUnknown + customerUnknown;
    if (unknownCount > 0) {
      sidoCountMap['미지정'] = unknownCount;
    }
  }

  return {
    status: 200,
    body: {
      sidoCounts: sidoCountMap,
      sigunguCounts: sigunguCountMap,
    },
  };
}

// GET /count - 조건에 맞는 고객 수 조회 (ExternalCustomer + Customer 통합)
export async function getFilteredCount(
  scope: LocalCampaignScope,
  query: Record<string, any>
): Promise<LocalCampaignResult> {
  const { ageGroups, gender, regions, regionSidos, regionSigungus, categories } = query;

  // 지역 필터 파싱 (3가지 형식 지원)
  let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

  if (regions) {
    // 새 형식: regions JSON 파싱
    try {
      regionFilters = JSON.parse(regions as string);
    } catch (e) {
      return { status: 400, body: { error: '지역 데이터 형식이 올바르지 않습니다.' } };
    }
  } else if (regionSigungus) {
    // 시/군/구 선택 형식: '서울/강남구,서울/서초구' 파싱
    const sigunguList = (regionSigungus as string).split(',').filter(Boolean);
    regionFilters = sigunguList.map((item) => {
      const [sido, sigungu] = item.split('/');
      return { sido, sigungu };
    });
  } else if (regionSidos) {
    // 시/도만 선택 형식: '서울,경기' 파싱
    const regionSidoList = (regionSidos as string).split(',').filter(Boolean);
    regionFilters = regionSidoList.map((sido) => ({ sido }));
  }

  if (regionFilters.length === 0) {
    return { status: 400, body: { error: '지역을 선택해주세요.' } };
  }

  let externalCount = 0;
  let customerCount = 0;

  // 1. ExternalCustomer 조회
  if (scope.kind === 'store') {
    const regionOrConditions = buildExternalRegionOrConditions(regionFilters);

    // categories가 있으면 AND로 지역+카테고리 결합 (OR 덮어쓰기 방지)
    const categoryList = categories ? (categories as string).split(',').filter(Boolean) : [];
    const externalWhere: any = {
      AND: [
        { OR: regionOrConditions },
        ...(categoryList.length > 0
          ? [{ OR: categoryList.map((cat) => ({ preferredCategories: { contains: cat } })) }]
          : []),
      ],
      consentMarketing: true,
    };

    // 연령대 필터
    if (ageGroups) {
      const ageGroupList = (ageGroups as string).split(',');
      externalWhere.ageGroup = { in: ageGroupList };
    }

    // 성별 필터
    if (gender && gender !== 'all') {
      externalWhere.gender = gender as string;
    }

    externalCount = await prisma.externalCustomer.count({ where: externalWhere });
  } else {
    // franchise 스코프: 리터럴 지역 OR + categories 가 지역 OR 를 덮어씀 (현행 동작 보존)
    const regionOrConditions = buildLiteralRegionOrConditions(regionFilters);

    const externalWhere: any = {
      OR: regionOrConditions,
      consentMarketing: true,
    };

    // 연령대 필터
    if (ageGroups) {
      const ageGroupList = (ageGroups as string).split(',');
      externalWhere.ageGroup = { in: ageGroupList };
    }

    // 성별 필터
    if (gender && gender !== 'all') {
      externalWhere.gender = gender as string;
    }

    // 선호 업종 필터
    if (categories) {
      const categoryList = (categories as string).split(',').filter(Boolean);
      if (categoryList.length > 0) {
        externalWhere.OR = categoryList.map((cat) => ({
          preferredCategories: { contains: cat },
        }));
      }
    }

    externalCount = await prisma.externalCustomer.count({ where: externalWhere });
  }

  // 2. Customer 조회 (전체 CRM 고객 - 프랜차이즈 상관없이)
  // store: '미지정' → null/'' 매칭 / franchise: 리터럴 매칭 (Customer DB도 줄임말 사용)
  const customerRegionOrConditions =
    scope.kind === 'store'
      ? buildCustomerRegionOrConditions(regionFilters)
      : buildLiteralRegionOrConditions(regionFilters);

  const customerWhere: any = {
    OR: customerRegionOrConditions,
    consentMarketing: true,
  };

  // 연령대 필터
  if (ageGroups) {
    const ageGroupList = (ageGroups as string).split(',');
    customerWhere.ageGroup = { in: ageGroupList };
  }

  // 성별 필터
  if (gender && gender !== 'all') {
    customerWhere.gender = gender as string;
  }

  customerCount = await prisma.customer.count({ where: customerWhere });

  // 3. 통합 카운트 반환
  const totalCount = externalCount + customerCount;
  const availableCount = totalCount;

  return {
    status: 200,
    body: {
      totalCount,
      availableCount,
      breakdown: {
        external: externalCount,
        customer: customerCount,
      },
    },
  };
}

// GET /estimate - 비용 예상
export async function getSmsEstimate(
  scope: LocalCampaignScope,
  query: Record<string, any>
): Promise<LocalCampaignResult> {
  const { sendCount } = query;

  if (!sendCount) {
    return { status: 400, body: { error: '발송 수량을 입력해주세요.' } };
  }

  const count = parseInt(sendCount as string);
  const totalCost = count * EXTERNAL_SMS_COST;

  // 지갑 잔액 조회
  const wallet = await findWallet(scope);

  const walletBalance = wallet?.balance || 0;
  const canSend = walletBalance >= totalCost;

  return {
    status: 200,
    body: {
      sendCount: count,
      costPerMessage: EXTERNAL_SMS_COST,
      totalCost,
      walletBalance,
      canSend,
    },
  };
}

// POST /send - 메시지 발송 (다중 지역 지원)
export async function sendCampaignSms(
  scope: LocalCampaignScope,
  body: Record<string, any>
): Promise<LocalCampaignResult> {
  const { content, ageGroups, gender, regions, regionSidos, regionSigungus, sendCount, categories, isAdMessage = true } = body;

  // 지역 필터 파싱 (3가지 형식 지원)
  let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

  if (regions && Array.isArray(regions) && regions.length > 0) {
    regionFilters = regions;
  } else if (regionSigungus && Array.isArray(regionSigungus) && regionSigungus.length > 0) {
    // 시/군/구 선택 형식: ['서울/강남구', '서울/서초구'] 파싱
    regionFilters = regionSigungus.map((item: string) => {
      const [sido, sigungu] = item.split('/');
      return { sido, sigungu };
    });
  } else if (regionSidos && Array.isArray(regionSidos) && regionSidos.length > 0) {
    regionFilters = regionSidos.map((sido: string) => ({ sido }));
  }

  // 유효성 검사
  if (!content || regionFilters.length === 0 || !sendCount) {
    return { status: 400, body: { error: '필수 항목을 모두 입력해주세요.' } };
  }

  if (sendCount <= 0) {
    return { status: 400, body: { error: '발송 수량은 1 이상이어야 합니다.' } };
  }

  // 지갑 잔액 확인
  const wallet = await findWallet(scope);

  const totalCost = sendCount * EXTERNAL_SMS_COST;
  if (!wallet || wallet.balance < totalCost) {
    return {
      status: 400,
      body: {
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      },
    };
  }

  // 1. ExternalCustomer 조회
  let externalCustomers: Array<{ id: string; phone: string; source: 'external' }> = [];

  if (scope.kind === 'store') {
    const regionOrConditions = buildExternalRegionOrConditions(regionFilters);
    // categories가 있으면 AND로 지역+카테고리 결합 (OR 덮어쓰기 방지)
    const externalWhere: any = {
      AND: [
        { OR: regionOrConditions },
        ...(categories && categories.length > 0
          ? [{ OR: categories.map((cat: string) => ({ preferredCategories: { contains: cat } })) }]
          : []),
      ],
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      externalWhere.ageGroup = { in: ageGroups };
    }

    if (gender && gender !== 'all') {
      externalWhere.gender = gender;
    }

    const externalResult = await prisma.externalCustomer.findMany({
      where: externalWhere,
      select: {
        id: true,
        phone: true,
      },
    });

    externalCustomers = externalResult.map((c) => ({ id: c.id, phone: c.phone, source: 'external' as const }));
  } else {
    // franchise 스코프: 리터럴 지역 OR + categories 가 지역 OR 를 덮어씀 (현행 동작 보존)
    const regionOrConditions = buildLiteralRegionOrConditions(regionFilters);
    const externalWhere: any = {
      OR: regionOrConditions,
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      externalWhere.ageGroup = { in: ageGroups };
    }

    if (gender && gender !== 'all') {
      externalWhere.gender = gender;
    }

    if (categories && categories.length > 0) {
      externalWhere.OR = categories.map((cat: string) => ({
        preferredCategories: { contains: cat },
      }));
    }

    const externalResult = await prisma.externalCustomer.findMany({
      where: externalWhere,
      select: {
        id: true,
        phone: true,
      },
    });

    externalCustomers = externalResult.map((c) => ({ id: c.id, phone: c.phone, source: 'external' as const }));
  }

  // 2. Customer 조회 (전체 CRM 고객 - 프랜차이즈 상관없이)
  let customers: Array<{ id: string; phone: string; source: 'customer' }> = [];

  // store: '미지정' → null/'' 매칭 / franchise: 리터럴 매칭 (Customer DB도 줄임말 사용)
  const customerRegionOrConditions =
    scope.kind === 'store'
      ? buildCustomerRegionOrConditions(regionFilters)
      : buildLiteralRegionOrConditions(regionFilters);

  const customerWhere: any = {
    OR: customerRegionOrConditions,
    consentMarketing: true,
    phone: { not: null }, // 전화번호 있는 고객만
  };

  if (ageGroups && ageGroups.length > 0) {
    customerWhere.ageGroup = { in: ageGroups };
  }

  if (gender && gender !== 'all') {
    customerWhere.gender = gender;
  }

  const customerResult = await prisma.customer.findMany({
    where: customerWhere,
    select: {
      id: true,
      phone: true,
    },
  });

  customers = customerResult
    .filter((c) => c.phone) // 전화번호 있는 고객만
    .map((c) => ({ id: c.id, phone: c.phone!, source: 'customer' as const }));

  // 3. 두 소스 통합
  const allCustomers = [...externalCustomers, ...customers];

  // 4. 가용 수량 확인
  const availableCount = allCustomers.length;
  if (sendCount > availableCount) {
    return {
      status: 400,
      body: {
        error: `발송 가능한 고객이 ${availableCount}명입니다.`,
        availableCount,
      },
    };
  }

  // 5. sendCount만큼 선택
  const selectedCustomers = allCustomers.slice(0, sendCount);

  if (scope.kind === 'store') {
    // 매장 정보 조회 (발송자명용)
    await prisma.store.findUnique({
      where: { id: scope.storeId },
      select: { name: true },
    });
  }

  // 광고 메시지 형식 적용
  const formattedContent = isAdMessage
    ? `(광고)\n${content}\n무료수신거부 080-500-4233`
    : content;

  // 캠페인 생성 (지역 정보를 JSON으로 저장)
  const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
  const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);

  const campaign = await prisma.externalSmsCampaign.create({
    data: {
      ...ownerData(scope),
      title: `신규 고객 유치 - ${new Date().toLocaleDateString('ko-KR')}`,
      content: formattedContent,
      filterAgeGroups: JSON.stringify(ageGroups || []),
      filterGender: gender || null,
      filterRegionSido: regionSidoList.join(','),
      filterRegionSigungu: regionSigunguList.join(','),
      filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
      targetCount: sendCount,
      costPerMessage: EXTERNAL_SMS_COST,
      status: 'SENDING',
    },
  });

  // SOLAPI 설정 확인
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    return { status: 500, body: { error: 'SMS 발송 설정이 되어있지 않습니다.' } };
  }

  const solapiService = new SolapiService(apiKey, apiSecret);

  // 벌크 메시지 배열 구성
  const bulkMessages = selectedCustomers.map((selected) => ({
    to: selected.phone,
    text: formattedContent,
  }));

  // 그룹 메시지 벌크 발송 — index별로 올바른 groupId 매핑 (다중 청크 대응)
  const batchResults = await solapiService.sendBulkSms(bulkMessages);
  const { successGroupIds, failureMap, groupIdByIndex } = buildPhoneResultMap(batchResults);

  console.log(`[SMS] Bulk send complete: ${successGroupIds.length} groups, ${failureMap.size} failed phones`);

  // 결과를 기반으로 DB 레코드 생성
  let pendingCount = 0;
  let failedCount = 0;

  for (let index = 0; index < selectedCustomers.length; index++) {
    const selected = selectedCustomers[index];
    const normalizedPhone = selected.phone.replace(/[^0-9]/g, '');
    const phoneLookup = normalizedPhone.startsWith('82') ? '0' + normalizedPhone.slice(2) : (normalizedPhone.startsWith('0') ? normalizedPhone : '0' + normalizedPhone);
    const groupId = groupIdByIndex[index] ?? null;
    const isFailed = failureMap.has(phoneLookup) || !groupId;

    await prisma.externalSmsMessage.create({
      data: {
        campaignId: campaign.id,
        ...ownerData(scope),
        externalCustomerId: selected.source === 'external' ? selected.id : null,
        content: formattedContent,
        status: isFailed ? 'FAILED' : 'PENDING',
        solapiGroupId: isFailed ? undefined : groupId,
        cost: isFailed ? 0 : EXTERNAL_SMS_COST,
        failReason: isFailed ? (failureMap.get(phoneLookup) || '발송 실패') : undefined,
      },
    });

    if (isFailed) failedCount++;
    else pendingCount++;
  }

  // 캠페인 상태 업데이트
  await prisma.externalSmsCampaign.update({
    where: { id: campaign.id },
    data: {
      failedCount,
      status: pendingCount > 0 ? 'SENDING' : 'COMPLETED',
    },
  });

  return {
    status: 200,
    body: {
      success: true,
      campaignId: campaign.id,
      pendingCount,
      failedCount,
      totalCost: pendingCount * EXTERNAL_SMS_COST,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
      breakdown: {
        external: externalCustomers.length,
        customer: customers.length,
      },
    },
  };
}

// POST /test - 테스트 발송
export async function sendTestSms(body: Record<string, any>): Promise<LocalCampaignResult> {
  const { content, phone } = body;

  if (!content || !phone) {
    return { status: 400, body: { error: '메시지 내용과 전화번호를 입력해주세요.' } };
  }

  // SOLAPI 설정 확인
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) {
    return { status: 500, body: { error: 'SMS 발송 설정이 되어있지 않습니다.' } };
  }

  const messageService = new SolapiMessageService(apiKey, apiSecret);

  // 전화번호 정규화
  const normalizedPhone = phone.replace(/-/g, '');

  // 테스트 발송
  const result = await messageService.send({
    to: normalizedPhone,
    from: '07041380263',
    text: content,
  });

  const groupInfo = result.groupInfo;

  return {
    status: 200,
    body: {
      success: true,
      groupId: groupInfo?.groupId,
      message: '테스트 발송이 완료되었습니다.',
    },
  };
}

// GET /kakao/send-available - 카카오톡 발송 가능 시간 확인
export function getKakaoSendAvailable(): LocalCampaignResult {
  const canSend = isSendableTime();
  const nextAvailable = canSend ? null : getNextSendableTime();

  return {
    status: 200,
    body: {
      canSend,
      nextAvailable,
      currentTimeKST: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
    },
  };
}

// GET /kakao/estimate - 카카오톡 비용 예상
export async function getKakaoEstimate(
  scope: LocalCampaignScope,
  query: Record<string, any>
): Promise<LocalCampaignResult> {
  const { sendCount, messageType = 'TEXT' } = query;

  if (!sendCount) {
    return { status: 400, body: { error: '발송 수량을 입력해주세요.' } };
  }

  const count = parseInt(sendCount as string);
  const costPerMessage = messageType === 'IMAGE' ? EXTERNAL_KAKAO_IMAGE_COST : EXTERNAL_KAKAO_TEXT_COST;
  const totalCost = count * costPerMessage;

  // 지갑 잔액 조회
  const wallet = await findWallet(scope);

  const walletBalance = wallet?.balance || 0;
  const canSend = walletBalance >= totalCost;

  let avgOrderValue: number;
  if (scope.kind === 'store') {
    // 매장 평균 객단가 조회
    const avgOrderResult = await prisma.visitOrOrder.aggregate({
      where: {
        storeId: scope.storeId,
        totalAmount: { not: null },
      },
      _avg: { totalAmount: true },
    });
    avgOrderValue = Math.round(avgOrderResult._avg.totalAmount || 25000);
  } else {
    // 프랜차이즈 전체 매장 평균 객단가 조회
    const stores = await prisma.store.findMany({
      where: { franchiseId: scope.franchiseId },
      select: { id: true }
    });
    const storeIds = stores.map(s => s.id);

    const avgOrderResult = await prisma.visitOrOrder.aggregate({
      where: {
        storeId: { in: storeIds },
        totalAmount: { not: null },
      },
      _avg: { totalAmount: true },
    });
    avgOrderValue = Math.round(avgOrderResult._avg.totalAmount || 25000);
  }

  return {
    status: 200,
    body: {
      sendCount: count,
      messageType: messageType || 'TEXT',
      costPerMessage,
      totalCost,
      walletBalance,
      canSend,
      estimatedRevenue: {
        avgOrderValue,
        conversionRate: 0.076, // 카카오톡 방문율 7.6%
      },
    },
  };
}

// POST /kakao/send - 카카오톡 브랜드 메시지 발송 (외부 고객)
export async function sendKakaoBrandMessage(
  scope: LocalCampaignScope,
  body: Record<string, any>
): Promise<LocalCampaignResult> {
  const {
    content,
    messageType = 'TEXT',
    ageGroups,
    gender,
    regions,
    regionSidos,
    sendCount,
    categories,
    imageId,
    buttons,
  } = body;

  // 새 형식 (regions) 또는 구 형식 (regionSidos) 지원
  let regionFilters: Array<{ sido: string; sigungu?: string }> = [];

  if (regions && Array.isArray(regions) && regions.length > 0) {
    regionFilters = regions;
  } else if (regionSidos && Array.isArray(regionSidos) && regionSidos.length > 0) {
    regionFilters = regionSidos.map((sido: string) => ({ sido }));
  }

  // 유효성 검사
  if (!content || regionFilters.length === 0 || !sendCount) {
    return { status: 400, body: { error: '필수 항목을 모두 입력해주세요.' } };
  }

  if (sendCount <= 0) {
    return { status: 400, body: { error: '발송 수량은 1 이상이어야 합니다.' } };
  }

  // 발송 가능 시간 체크 - 야간이면 다음날 08:00에 예약 발송
  const sendableNow = isSendableTime();
  const scheduledAt = sendableNow ? undefined : getNextSendableTime();

  // SOLAPI 설정 확인
  const pfId = process.env.SOLAPI_PF_ID;
  if (!pfId) {
    return { status: 400, body: { error: '카카오 비즈니스 채널 설정이 필요합니다.' } };
  }

  const solapiService = getSolapiService();
  if (!solapiService) {
    return { status: 400, body: { error: 'SOLAPI 설정이 되어있지 않습니다.' } };
  }

  // 비용 계산
  const costPerMessage = messageType === 'IMAGE' ? EXTERNAL_KAKAO_IMAGE_COST : EXTERNAL_KAKAO_TEXT_COST;
  const totalCost = sendCount * costPerMessage;

  // 지갑 잔액 확인
  const wallet = await findWallet(scope);

  if (!wallet || wallet.balance < totalCost) {
    return {
      status: 400,
      body: {
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      },
    };
  }

  // 필터 조건 구성 (다중 지역 지원 - 시/군/구 포함)
  // 양쪽 스코프 모두 리터럴 매칭 ('미지정' 특수 처리 없음, 현행 동작 보존)
  const regionOrConditions = buildLiteralRegionOrConditions(regionFilters);

  const where: any = {
    OR: regionOrConditions,
    consentMarketing: true,
  };

  if (ageGroups && ageGroups.length > 0) {
    where.ageGroup = { in: ageGroups };
  }

  if (gender && gender !== 'all') {
    where.gender = gender;
  }

  // 선호 업종 필터 (categories 가 지역 OR 를 덮어씀 — 양쪽 스코프 공통 현행 동작)
  if (categories && categories.length > 0) {
    where.OR = categories.map((cat: string) => ({
      preferredCategories: { contains: cat },
    }));
  }

  // 가용 고객 수 확인
  const availableCount = await prisma.externalCustomer.count({
    where,
  });

  if (sendCount > availableCount) {
    return {
      status: 400,
      body: {
        error: `발송 가능한 고객이 ${availableCount}명입니다.`,
        availableCount,
      },
    };
  }

  // 고객 선택
  const customers = await prisma.externalCustomer.findMany({
    where,
    take: sendCount,
    orderBy: {
      id: 'asc',
    },
  });

  if (scope.kind === 'store') {
    // 매장 정보 조회
    await prisma.store.findUnique({
      where: { id: scope.storeId },
      select: { name: true },
    });
  }

  // 캠페인 생성 (SMS 캠페인 테이블 재사용, 제목으로 구분)
  const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
  const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);

  const campaign = await prisma.externalSmsCampaign.create({
    data: {
      ...ownerData(scope),
      title: `신규 고객 유치 (카카오톡) - ${new Date().toLocaleDateString('ko-KR')}`,
      content,
      filterAgeGroups: JSON.stringify(ageGroups || []),
      filterGender: gender || null,
      filterRegionSido: regionSidoList.join(','),
      filterRegionSigungu: regionSigunguList.join(','),
      filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
      targetCount: sendCount,
      costPerMessage,
      status: 'SENDING',
    },
  });

  // 벌크 브랜드 메시지 발송
  const bulkBrandMessages = customers.map((customer) => ({
    to: customer.phone,
    content,
  }));

  const batchResults = await solapiService.sendBulkBrandMessage({
    messages: bulkBrandMessages,
    pfId,
    messageType: messageType as 'TEXT' | 'IMAGE',
    imageId,
    buttons: buttons as BrandMessageButton[],
    scheduledAt,
  });
  const { successGroupIds, failureMap, groupIdByIndex } = buildPhoneResultMap(batchResults);

  console.log(`[ExternalKakao] Bulk send complete: ${successGroupIds.length} groups, ${failureMap.size} failed phones`);

  // 결과를 기반으로 DB 레코드 생성
  let pendingCount = 0;
  let failedCount = 0;

  for (let index = 0; index < customers.length; index++) {
    const customer = customers[index];
    const normalizedPhone = customer.phone.replace(/[^0-9]/g, '');
    const phoneLookup = normalizedPhone.startsWith('82') ? '0' + normalizedPhone.slice(2) : (normalizedPhone.startsWith('0') ? normalizedPhone : '0' + normalizedPhone);
    const groupId = groupIdByIndex[index] ?? null;
    const isFailed = failureMap.has(phoneLookup) || !groupId;

    await prisma.externalSmsMessage.create({
      data: {
        campaignId: campaign.id,
        ...ownerData(scope),
        externalCustomerId: customer.id,
        content,
        status: isFailed ? 'FAILED' : 'PENDING',
        solapiGroupId: isFailed ? undefined : groupId,
        cost: isFailed ? 0 : costPerMessage,
        failReason: isFailed ? (failureMap.get(phoneLookup) || '발송 실패') : undefined,
      },
    });

    if (isFailed) failedCount++;
    else pendingCount++;
  }

  // 캠페인 상태 업데이트
  await prisma.externalSmsCampaign.update({
    where: { id: campaign.id },
    data: {
      failedCount,
      status: pendingCount > 0 ? 'SENDING' : 'COMPLETED',
    },
  });

  // 예약 발송 여부에 따른 메시지
  const responseMessage = scheduledAt
    ? `다음날 08:00에 예약 발송됩니다. 결과는 발송내역에서 확인하세요.`
    : '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.';

  return {
    status: 200,
    body: {
      success: true,
      campaignId: campaign.id,
      pendingCount,
      failedCount,
      totalCost: pendingCount * costPerMessage,
      message: responseMessage,
      scheduledAt: scheduledAt?.toISOString(),
    },
  };
}

// GET /campaigns - 캠페인 목록 조회
export async function getCampaigns(
  scope: LocalCampaignScope,
  query: Record<string, any>
): Promise<LocalCampaignResult> {
  const { page = '1', limit = '20' } = query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [campaigns, total] = await Promise.all([
    prisma.externalSmsCampaign.findMany({
      where: ownerData(scope),
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.externalSmsCampaign.count({ where: ownerData(scope) }),
  ]);

  return {
    status: 200,
    body: {
      campaigns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  };
}
