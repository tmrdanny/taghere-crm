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

/** 정규화 후 유효한 모바일(010/011… 10~11자리)이면 반환, 아니면 빈 문자열. 프리필/표시용. */
export function toMobileOrEmpty(phone?: string | null): string {
  if (!phone) return '';
  const n = normalizePhoneNumber(phone);
  return (n.length === 10 || n.length === 11) && n.startsWith('01') ? n : '';
}
