/**
 * SMS 바이트 길이 계산 (한글 등 멀티바이트 2바이트, ASCII 1바이트)
 * 단문/장문 구분 및 발송 비용 산정에 사용됩니다.
 */
export function getByteLength(str: string): number {
  let byteLength = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode > 127) {
      byteLength += 2; // 한글 등 멀티바이트 문자
    } else {
      byteLength += 1; // ASCII 문자
    }
  }
  return byteLength;
}
