/**
 * 메타씨티 MAGICPOS 연동 서비스
 *
 * 회원 등록 및 포인트 적립/사용/취소를 메타씨티 POS 시스템과 동기화.
 * API 문서: METACITY MAGICPOS 연동 API (20251015)
 *
 * - CustomerInfo.asp: 회원 가입/조회
 * - PointInfo.asp: 포인트 적립/사용/취소/조회
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 설정 ──
const API_URL = process.env.METACITY_API_URL || 'http://webapi.metapos.co.kr/webapi/order/api';
const TEST_MODE = process.env.METACITY_TEST_MODE === 'true';
const VERSION = '0001';
const STORE_GB = 'B';
const ACCESS_CODE = 'TAGHERE';

// ── 타입 정의 ──

interface MetacityStoreConfig {
  metacityStoreIdx: string;
}

interface MetacityBaseRequest {
  VERSION: string;
  ACCESS_CODE: string;
  STORE_GB: string;
  STORE_IDX: string;
  WORK_TYPE: string;
  [key: string]: any;
}

interface MetacityResponse {
  RESULT_CODE: string;
  ERROR_MSG: string;
  [key: string]: any;
}

interface MetacityCustomerData {
  phone: string;
  name?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  ageGroup?: string | null;
  birthday?: string | null; // MM-DD
  birthYear?: number | null;
  consentMarketing?: boolean;
}

type PointOperationType =
  | 'POINT_SAVE'
  | 'POINT_SAVE_CANCEL'
  | 'POINT_USE'
  | 'POINT_USE_CANCEL'
  | 'POINT_COMBINE'
  | 'POINT_COMBINE_CANCEL'
  | 'POINT_ALL_CANCEL';

interface PointSyncParams {
  custId: string;
  orderNo: string;
  purAmt?: number;
  usedPoint?: number;
  savePoint?: number;
}

// ── 유틸리티 함수 ──

/** 전화번호를 국내 11자리 숫자로 정규화 (+82 10-2763-6023 → 01027636023) */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '');
  // +82 국제번호 처리: 82로 시작하면 0으로 교체
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

/** 전화번호를 010-1234-5678 형식으로 변환 */
function formatPhoneWithDashes(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** 전화번호에서 숫자만 추출 (CUST_ID 용) */
function phoneToDigits(phone: string): string {
  return normalizePhone(phone);
}

/** ageGroup enum → 추정 출생연도 */
function estimateBirthYearFromAgeGroup(ageGroup: string | null | undefined): number {
  const currentYear = new Date().getFullYear();
  switch (ageGroup) {
    case 'TWENTIES': return currentYear - 25;
    case 'THIRTIES': return currentYear - 35;
    case 'FORTIES': return currentYear - 45;
    case 'FIFTIES': return currentYear - 55;
    case 'SIXTY_PLUS': return currentYear - 65;
    default: return 1990;
  }
}

/**
 * 메타씨티 응답에서 실제 CUST_ID 추출.
 *
 * 매직포스 내부 CUST_CD(예: 20001267)는 전화번호 11자리와 다를 수 있다.
 * JOIN/VERIFY_PHONE/CUST_SEARCH 응답에 매직포스가 실제 부여/저장한 ID를
 * 어떤 필드로 돌려주는지 스펙이 불명확하므로 후보 필드를 모두 검사한다.
 *
 * 우선순위:
 *   1. response.CUST_ID
 *   2. response.CUST_CD
 *   3. response.CUST_INFO_LIST[0].CUST_ID
 *   4. response.CUST_INFO_LIST[0].CUST_CD
 *
 * 발견되지 않으면 null. 호출자가 phoneDigits 폴백 여부 결정.
 */
function extractCustId(resp: MetacityResponse | null | undefined): string | null {
  if (!resp) return null;
  if (typeof resp.CUST_ID === 'string' && resp.CUST_ID.trim()) return resp.CUST_ID.trim();
  if (typeof resp.CUST_CD === 'string' && resp.CUST_CD.trim()) return resp.CUST_CD.trim();
  if (Array.isArray(resp.CUST_INFO_LIST) && resp.CUST_INFO_LIST.length > 0) {
    const first = resp.CUST_INFO_LIST[0];
    if (first?.CUST_ID && String(first.CUST_ID).trim()) return String(first.CUST_ID).trim();
    if (first?.CUST_CD && String(first.CUST_CD).trim()) return String(first.CUST_CD).trim();
  }
  return null;
}

/** 고객 데이터 → BIRTH_YMD (YYYYMMDD) */
function buildBirthYmd(customer: MetacityCustomerData): string {
  const year = customer.birthYear || estimateBirthYearFromAgeGroup(customer.ageGroup);
  if (customer.birthday) {
    // MM-DD → MMDD
    const mmdd = customer.birthday.replace('-', '');
    return `${year}${mmdd}`;
  }
  return `${year}0101`;
}

// ── MetacityService 클래스 ──

export class MetacityService {
  private config: MetacityStoreConfig;

  constructor(config: MetacityStoreConfig) {
    this.config = config;
  }

  /** API 기본 요청 객체 생성 */
  private baseRequest(workType: string): MetacityBaseRequest {
    return {
      VERSION,
      ACCESS_CODE,
      STORE_GB,
      STORE_IDX: this.config.metacityStoreIdx,
      WORK_TYPE: workType,
    };
  }

  /** HTTP POST 호출 */
  private async callApi(endpoint: string, body: MetacityBaseRequest): Promise<MetacityResponse> {
    const baseUrl = TEST_MODE ? `${API_URL}/TEST` : API_URL;
    const url = `${baseUrl}/${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Metacity HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as MetacityResponse;

    // 응답 raw body 로깅 (매직포스 측 분쟁/디버깅 대조용)
    console.log(`[Metacity] ${body.WORK_TYPE} 응답:`, JSON.stringify(data));

    if (data.RESULT_CODE !== 'E0000') {
      throw new Error(`Metacity ${data.RESULT_CODE}: ${data.ERROR_MSG}`);
    }

    return data;
  }

  // ── 회원 관련 ──

  /** 회원 가입 (JOIN) */
  async registerCustomer(customer: MetacityCustomerData): Promise<MetacityResponse> {
    const digits = phoneToDigits(customer.phone);
    const body = {
      ...this.baseRequest('JOIN'),
      CUST_ID: digits,
      CUST_PW: digits.slice(-4) + '0000',
      CUST_NM: customer.name || '고객',
      CP_NO: formatPhoneWithDashes(customer.phone),
      BIRTH_YMD: buildBirthYmd(customer),
      SEX: customer.gender === 'MALE' ? 'M' : customer.gender === 'FEMALE' ? 'F' : 'M',
      NICK_NAME: customer.name || '고객',
      PUSH_YN: 'N',
      PUSH_SERVICE: '',
      SNS_TYPE: '',
      EMAIL: '',
    };

    console.log('[Metacity] JOIN 요청:', JSON.stringify(body));
    return this.callApi('CustomerInfo.asp', body);
  }

  /** 전화번호 중복 확인 (VERIFY_PHONE) */
  async verifyPhone(phone: string): Promise<MetacityResponse> {
    const body = {
      ...this.baseRequest('VERIFY_PHONE'),
      CP_NO: formatPhoneWithDashes(phone),
    };

    return this.callApi('CustomerInfo.asp', body);
  }

  /** 회원 조회 (CUST_SEARCH) — 전화번호로 검색 */
  async searchCustomerByPhone(phone: string): Promise<MetacityResponse> {
    const body = {
      ...this.baseRequest('CUST_SEARCH'),
      CUST_NM: '',
      CP_NO: formatPhoneWithDashes(phone),
      LAST_4_CP_NO: '',
      BIRTH_YMD: '',
      EMAIL: '',
      CUST_ID: '',
    };

    return this.callApi('CustomerInfo.asp', body);
  }

  /** 회원 조회 (CUST_SEARCH) — 전화번호 뒷 4자리로 검색 (CP_NO 매칭 실패 시 폴백) */
  async searchCustomerByPhoneLast4(phone: string): Promise<MetacityResponse> {
    const digits = phoneToDigits(phone);
    const last4 = digits.slice(-4);
    const body = {
      ...this.baseRequest('CUST_SEARCH'),
      CUST_NM: '',
      CP_NO: '',
      LAST_4_CP_NO: last4,
      BIRTH_YMD: '',
      EMAIL: '',
      CUST_ID: '',
    };

    return this.callApi('CustomerInfo.asp', body);
  }

  // ── 포인트 관련 ──

  /** 포인트 조회 (POINT_SEARCH) */
  async searchPoints(custId: string): Promise<MetacityResponse> {
    const body = {
      ...this.baseRequest('POINT_SEARCH'),
      CUST_ID: custId,
    };

    return this.callApi('PointInfo.asp', body);
  }

  /** 포인트 적립/사용/취소 (범용) */
  async pointOperation(
    workType: PointOperationType,
    params: PointSyncParams,
  ): Promise<MetacityResponse> {
    const body = {
      ...this.baseRequest(workType),
      CUST_ID: params.custId,
      ORDER_NO: params.orderNo.slice(0, 20),
      PUR_AMT: params.purAmt || 0,
      USED_POINT: params.usedPoint || 0,
      SAVE_POINT: params.savePoint || 0,
    };

    console.log(`[Metacity] ${workType} 요청:`, JSON.stringify(body));
    return this.callApi('PointInfo.asp', body);
  }

  /** 포인트 내역 조회 (POINT_HISTORY) */
  async pointHistory(custId: string, startDt: string, endDt: string): Promise<MetacityResponse> {
    const body = {
      ...this.baseRequest('POINT_HISTORY'),
      CUST_ID: custId,
      START_DT: startDt,
      END_DT: endDt,
      CANCEL_YN: '',
    };

    return this.callApi('PointInfo.asp', body);
  }
}

// ── 통합 동기화 헬퍼 ──

interface SyncToMetacityParams {
  store: {
    id: string;
    metacityEnabled: boolean;
    metacityStoreIdx: string | null;
  };
  customer: {
    id: string;
    phone: string | null;
    name: string | null;
    gender: 'MALE' | 'FEMALE' | null;
    ageGroup: string | null;
    birthday: string | null;
    birthYear: number | null;
    consentMarketing: boolean;
    metacityCustId: string | null;
  };
  operationType: PointOperationType;
  orderNo: string; // TagHere ledger ID 등 고유값
  purAmt?: number;
  usedPoint?: number;
  savePoint?: number;
}

/**
 * 메타씨티에 포인트 동기화 (fire-and-forget 용도)
 *
 * 1. 고객의 metacityCustId가 없으면 → 회원 등록/조회 후 ID 저장
 * 2. 포인트 적립/사용/취소 동기화
 */
export async function syncToMetacity(params: SyncToMetacityParams): Promise<void> {
  const { store, customer, operationType, orderNo, purAmt, usedPoint, savePoint } = params;

  // 설정 검증
  if (!store.metacityEnabled || !store.metacityStoreIdx) {
    return;
  }

  // 전화번호 없으면 동기화 불가
  if (!customer.phone) {
    console.warn('[Metacity] 전화번호 없는 고객은 동기화 불가:', customer.id);
    return;
  }

  const service = new MetacityService({
    metacityStoreIdx: store.metacityStoreIdx,
  });

  let custId = customer.metacityCustId;
  const hadCachedCustId = !!custId;

  // 메타씨티 회원 ID가 없으면 등록/조회
  if (!custId) {
    custId = await ensureMetacityMember(service, customer);

    // DB에 metacityCustId 저장
    if (custId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          metacityCustId: custId,
          metacitySyncedAt: new Date(),
        },
      });
    } else {
      console.error('[Metacity] 회원 등록/조회 실패, 동기화 중단:', customer.id);
      return;
    }
  }

  // 포인트 동기화 (E4001 → CUST_ID 무효 → 캐시 비우고 재식별 후 1회 재시도)
  try {
    await service.pointOperation(operationType, {
      custId,
      orderNo,
      purAmt,
      usedPoint,
      savePoint,
    });
  } catch (err: any) {
    // E4001 = 회원 정보를 찾을 수 없음 → DB에 저장된 metacityCustId가 잘못된 값일 가능성
    if (err.message?.includes('E4001') && hadCachedCustId) {
      console.warn(
        `[Metacity] E4001 발생, metacityCustId(${custId}) 무효 처리 후 재식별 시도:`,
        customer.id,
      );
      // 잘못된 ID 비우기
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustId: null },
      });

      // 재식별
      const newCustId = await ensureMetacityMember(service, customer);
      if (!newCustId) {
        console.error('[Metacity] E4001 후 재식별 실패, 동기화 중단:', customer.id);
        throw err;
      }
      if (newCustId === custId) {
        // 동일 ID로 재식별됨 — 매직포스 측 데이터 문제. 재시도해도 동일 결과.
        console.error('[Metacity] E4001 후 재식별 결과 동일 ID. 메타씨티 측 확인 필요:', customer.id, newCustId);
        throw err;
      }
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustId: newCustId, metacitySyncedAt: new Date() },
      });
      custId = newCustId;

      // 새 ID로 1회 재시도
      await service.pointOperation(operationType, {
        custId,
        orderNo,
        purAmt,
        usedPoint,
        savePoint,
      });
      console.log(`[Metacity] E4001 self-heal 성공: ${customer.id} → ${custId}`);
    } else {
      throw err;
    }
  }

  // 동기화 시점 업데이트
  await prisma.customer.update({
    where: { id: customer.id },
    data: { metacitySyncedAt: new Date() },
  });

  console.log(`[Metacity] ${operationType} 동기화 완료: customer=${customer.id}, custId=${custId}`);
}

/** POINT_SEARCH 응답에서 ABLE_POINT(사용가능포인트)/TOT_POINT(총포인트) 추출 */
function parseMetacityPoints(resp: MetacityResponse): { ablePoint: number; totalPoint: number } {
  const list = Array.isArray(resp.POINT_INFO_LIST) ? resp.POINT_INFO_LIST : [];
  if (list.length === 0) {
    return { ablePoint: 0, totalPoint: 0 };
  }
  const info = list[0];
  return {
    ablePoint: Number(info?.ABLE_POINT) || 0,
    totalPoint: Number(info?.TOT_POINT) || 0,
  };
}

/**
 * 메타씨티에서 회원 포인트 조회 (POINT_SEARCH)
 *
 * - custId 확보(없으면 검색/가입)는 syncToMetacity 와 동일한 패턴 사용
 * - ABLE_POINT(사용가능포인트) / TOT_POINT(총포인트) 반환
 * - 조회 실패 시 throw (호출자가 에러 응답 처리). 단, 캐시된 custId 가 E4001 이면 1회 재식별 후 재시도
 */
export async function getMetacityPoints(params: {
  store: { id: string; metacityEnabled: boolean; metacityStoreIdx: string };
  customer: SyncToMetacityParams['customer'];
}): Promise<{ ablePoint: number; totalPoint: number }> {
  const { store, customer } = params;

  const service = new MetacityService({
    metacityStoreIdx: store.metacityStoreIdx,
  });

  // custId 확보
  let custId = customer.metacityCustId;
  const hadCachedCustId = !!custId;

  if (!custId) {
    custId = await ensureMetacityMember(service, customer);
    if (custId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustId: custId, metacitySyncedAt: new Date() },
      });
    } else {
      throw new Error(`[Metacity] 회원 식별 실패로 포인트 조회 불가: customer=${customer.id}`);
    }
  }

  // 포인트 조회 (E4001 + 캐시된 custId → 무효 처리 후 재식별 1회 재시도)
  try {
    return parseMetacityPoints(await service.searchPoints(custId));
  } catch (err: any) {
    if (err.message?.includes('E4001') && hadCachedCustId) {
      console.warn(
        `[Metacity] POINT_SEARCH E4001, metacityCustId(${custId}) 무효 처리 후 재식별 시도:`,
        customer.id,
      );
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustId: null },
      });

      const newCustId = await ensureMetacityMember(service, customer);
      if (!newCustId || newCustId === custId) {
        console.error('[Metacity] POINT_SEARCH E4001 후 재식별 실패/동일 ID:', customer.id, newCustId);
        throw err;
      }
      await prisma.customer.update({
        where: { id: customer.id },
        data: { metacityCustId: newCustId, metacitySyncedAt: new Date() },
      });

      return parseMetacityPoints(await service.searchPoints(newCustId));
    }
    throw err;
  }
}

/**
 * 메타씨티 회원 등록 보장
 * - 먼저 전화번호로 기존 회원 검색
 * - 없으면 신규 등록
 * - 이미 있으면 기존 CUST_ID 반환
 */
async function ensureMetacityMember(
  service: MetacityService,
  customer: SyncToMetacityParams['customer'],
): Promise<string | null> {
  const phone = customer.phone!;
  const phoneDigits = phoneToDigits(phone);

  // 1. 전화번호 중복 확인
  let phoneRegistered = false;
  try {
    await service.verifyPhone(phone);
    // E0000 → 중복 없음, 신규 가입 진행
  } catch (err: any) {
    if (err.message?.includes('E1004')) {
      // 이미 등록된 전화번호
      phoneRegistered = true;
      console.log('[Metacity] 기존 회원 발견, CUST_SEARCH(CP_NO) 수행:', phone);

      // 1-a. CP_NO 전체로 조회
      try {
        const searchResult = await service.searchCustomerByPhone(phone);
        const foundId = extractCustId(searchResult);
        if (foundId) {
          console.log('[Metacity] CUST_SEARCH(CP_NO) 매칭 성공:', foundId);
          return foundId;
        }
        console.warn('[Metacity] CUST_SEARCH(CP_NO) 응답 비어있음:', JSON.stringify(searchResult));
      } catch (searchErr: any) {
        console.warn('[Metacity] CUST_SEARCH(CP_NO) 실패:', searchErr.message);
      }

      // 1-b. LAST_4_CP_NO로 재시도 (매직포스가 CP_NO 포맷에 민감할 가능성 대비)
      try {
        const searchResult2 = await service.searchCustomerByPhoneLast4(phone);
        const foundId2 = extractCustId(searchResult2);
        if (foundId2) {
          console.log('[Metacity] CUST_SEARCH(LAST_4) 매칭 성공:', foundId2);
          return foundId2;
        }
        console.warn('[Metacity] CUST_SEARCH(LAST_4) 응답 비어있음:', JSON.stringify(searchResult2));
      } catch (searchErr2: any) {
        console.warn('[Metacity] CUST_SEARCH(LAST_4) 실패:', searchErr2.message);
      }

      // ↓ 두 검색 모두 실패 → JOIN 재시도로 결판
    } else {
      console.warn('[Metacity] VERIFY_PHONE 에러, 가입 시도:', err.message);
    }
  }

  // 2. 신규 가입 시도 (또는 모순 케이스 결판)
  try {
    const joinResp = await service.registerCustomer({
      phone,
      name: customer.name,
      gender: customer.gender,
      ageGroup: customer.ageGroup,
      birthday: customer.birthday,
      birthYear: customer.birthYear,
      consentMarketing: customer.consentMarketing,
    });
    // 매직포스가 응답에서 부여한 실제 CUST_ID(내부 CUST_CD 가능)를 우선 사용
    const assignedId = extractCustId(joinResp);
    if (assignedId) {
      console.log(`[Metacity] 회원 가입 성공: ${phone}, CUST_ID=${assignedId}`);
      return assignedId;
    }
    // 응답에 식별자 없음 → phoneDigits로 폴백 (호환성 유지). E4001 발생 시 self-heal로 재식별됨.
    console.warn('[Metacity] JOIN 응답에 CUST_ID/CUST_CD 없음, phoneDigits로 폴백:', JSON.stringify(joinResp));
    return phoneDigits;
  } catch (err: any) {
    // 이미 존재 — JOIN이 CUST_ID를 받아주지 않음
    if (err.message?.includes('E1003') || err.message?.includes('E1004') || err.message?.includes('E1009')) {
      if (phoneRegistered) {
        // VERIFY=있음 + CUST_SEARCH 두 가지 모두 실패 + JOIN=중복 → 식별 불가
        console.error(
          '[Metacity] 회원 식별 불가 (VERIFY+CUST_SEARCH 2회+JOIN 모두 모순). 메타씨티 측 확인 필요:',
          phone,
        );
        return null;
      }
      // VERIFY는 통과(E0000)했는데 JOIN에서 중복 거절 → 드물지만 ID 충돌. phoneDigits 폴백.
      return phoneDigits;
    }
    console.error('[Metacity] 회원 가입 실패:', err.message);
    return null;
  }
}
