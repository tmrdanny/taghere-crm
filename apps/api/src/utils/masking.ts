/**
 * 이름 마스킹 함수
 * 예: "홍길동" → "홍*동", "김철수" → "김*수", "이몽룡" → "이*룡"
 */
export function maskName(name: string | null): string {
  if (!name || name.length <= 1) return name || '';

  if (name.length === 2) {
    return name[0] + '*';
  }

  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/**
 * 전화번호 마스킹 함수
 * 예: "010-1234-5678" → "010-****-5678"
 *     "01012345678" → "010****5678"
 *     "+82 10-1234-5678" → "+82 10-****-5678"
 */
export function maskPhone(phone: string | null): string {
  if (!phone) return '';

  // +82 국제 전화번호 형식 처리
  if (phone.startsWith('+82')) {
    // +82 10-1234-5678 또는 +82 10 1234 5678 등의 형식
    const digits = phone.replace(/[^0-9]/g, ''); // 숫자만 추출 (82101234xxxx)
    if (digits.length >= 10) {
      const lastFour = digits.slice(-4);
      // 원본 형식 유지하면서 중간 4자리만 마스킹
      // +82 10-xxxx-5678 형식으로 반환
      return `+82 10-****-${lastFour}`;
    }
    return phone;
  }

  // 하이픈 제거
  const cleaned = phone.replace(/-/g, '');

  // 11자리가 아니면 원본 반환
  if (cleaned.length !== 11) return phone;

  // 중간 4자리 마스킹
  const masked = cleaned.slice(0, 3) + '****' + cleaned.slice(7);

  // 원본이 하이픈 포함했다면 하이픈 포함해서 반환
  return phone.includes('-')
    ? masked.slice(0, 3) + '-****-' + masked.slice(7)
    : masked;
}
