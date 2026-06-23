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
