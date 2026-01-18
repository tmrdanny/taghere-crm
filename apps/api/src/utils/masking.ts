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
 */
export function maskPhone(phone: string | null): string {
  if (!phone) return '';

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
