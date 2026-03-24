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
      ORDER_NO: params.orderNo,
      PUR_AMT: params.purAmt || 0,
      USED_POINT: params.usedPoint || 0,
      SAVE_POINT: params.savePoint || 0,
    };

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

  // 포인트 동기화
  await service.pointOperation(operationType, {
    custId,
    orderNo,
    purAmt,
    usedPoint,
    savePoint,
  });

  // 동기화 시점 업데이트
  await prisma.customer.update({
    where: { id: customer.id },
    data: { metacitySyncedAt: new Date() },
  });

  console.log(`[Metacity] ${operationType} 동기화 완료: customer=${customer.id}, custId=${custId}`);
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

  // 1. 전화번호 중복 확인
  try {
    await service.verifyPhone(phone);
    // 중복 없음 → 신규 가입
  } catch (err: any) {
    if (err.message?.includes('E1004')) {
      // 이미 등록된 전화번호 → 기존 회원 조회
      console.log('[Metacity] 기존 회원 발견, CUST_SEARCH 수행:', phone);
      try {
        const searchResult = await service.searchCustomerByPhone(phone);
        const custList = searchResult.CUST_INFO_LIST;
        if (Array.isArray(custList) && custList.length > 0) {
          return custList[0].CUST_ID;
        }
      } catch (searchErr) {
        console.error('[Metacity] CUST_SEARCH 실패:', searchErr);
      }
      // 조회 실패 시 전화번호를 ID로 시도
      return phoneToDigits(phone);
    }
    // 그 외 에러는 신규 가입 시도
    console.warn('[Metacity] VERIFY_PHONE 에러, 가입 시도:', err.message);
  }

  // 2. 신규 가입
  try {
    await service.registerCustomer({
      phone,
      name: customer.name,
      gender: customer.gender,
      ageGroup: customer.ageGroup,
      birthday: customer.birthday,
      birthYear: customer.birthYear,
      consentMarketing: customer.consentMarketing,
    });
    console.log('[Metacity] 회원 가입 성공:', phone);
    return phoneToDigits(phone);
  } catch (err: any) {
    // 이미 존재하는 아이디 에러 등
    if (err.message?.includes('E1003') || err.message?.includes('E1009')) {
      // 사용할 수 없는 아이디 → 이미 존재. 전화번호를 ID로 사용
      return phoneToDigits(phone);
    }
    console.error('[Metacity] 회원 가입 실패:', err.message);
    return null;
  }
}
