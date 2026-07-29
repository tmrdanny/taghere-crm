/**
 * 전화번호 정규화 유틸리티
 * 다양한 입력 형식(하이픈, 국가코드 82 등)을 01012345678 형태로 통일합니다.
 */

// 숫자만 추출 후 국가코드(82) 처리 및 선행 0 보정
export function normalizePhoneNumber(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('82')) {
    digits = '0' + digits.slice(2);
  }
  if (!digits.startsWith('0')) {
    digits = '0' + digits;
  }
  return digits;
}

/**
 * Customer.phoneLastDigits 검색키 전용 정규화.
 *
 * normalizePhoneNumber 와 규칙이 다르다 — 82 치환에 길이 조건이 붙고 선행 0 보정을 하지 않는다.
 * 기존 고객 레코드가 이 규칙으로 만들어져 있어 검색키는 반드시 여기에 맞춰야 한다.
 */
export function normalizeCustomerKeyDigits(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

/** 매장 고객 검색키(전화번호 뒤 8자리) */
export function toPhoneLastDigits(phone: string): string {
  return normalizeCustomerKeyDigits(phone).slice(-8);
}

/** 정규화 후 유효한 모바일(010/011… 10~11자리)이면 반환, 아니면 빈 문자열. 프리필/표시용. */
export function toMobileOrEmpty(phone?: string | null): string {
  if (!phone) return '';
  const n = normalizePhoneNumber(phone);
  return (n.length === 10 || n.length === 11) && n.startsWith('01') ? n : '';
}
