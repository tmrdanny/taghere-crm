// 사장님이 자유롭게 입력한 링크를 고객 화면에 내보낼 때 쓴다.
// https 가 아닌 값(javascript: 등)은 내보내지 않는다.
export function toSafeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
