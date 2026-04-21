// 한국어/영어 비속어 필터
// 매칭된 부분을 같은 길이의 * 로 치환

const PROFANITY_WORDS = [
  // 씨발 계열
  '씨발', '시발', '씨봘', '싸발', '쌰발', '시팔', '씨팔', '씨부랄', '씨부럴',
  '시부럴', '시부랄', '씨바', '시바', '씨벌', '시벌', '쓰발', '스발',
  // 병신 계열
  '병신', '븅신', '븨신', '벼엉신',
  // 개새끼 계열
  '개새끼', '개쌔끼', '개세끼', '개색기', '개색히', '개색끼',
  '니애미', '니애비', '니미', '니에미', '니미럴', '니기미',
  // 좆 계열
  '좆', '좆까', '좆나', '좃같', '좆같', '좃까', '좃나', '족까',
  // 존나/지랄
  '존나', '졸라', '죤나', '죠낸',
  '지랄', '지럴', '찌랄',
  // 창녀/쌍년
  '창녀', '창년', '쌍년', '쌍놈', '잡놈', '쌍것',
  // 기타
  '느금마', '느그', '엿먹', '엿머거',
  '꺼져', '꺼지', '닥쳐', '닥치',
  '등신', '띨빡', '띨띨',
  '쳐먹', '쳐 먹', '쳐자',
  '뒈져', '뒤져라', '죽어라', '뒈지',
  '저능아', '찐따', '새꺄', '새캬', '쉐이',
  // 자음 축약 (흔한 패턴)
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㄱㅅㄲ', 'ㅁㅊㄴ', 'ㅈㄴ', 'ㅈㄲ',
  // 영어 (일반적인 것만)
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'asshole', 'dick',
  'motherfucker', 'bastard',
];

// 정규식 이스케이프
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 길이 내림차순 (긴 것부터 매칭해서 부분 매칭 후 짧은 것 재처리 방지)
const SORTED_WORDS = [...PROFANITY_WORDS].sort((a, b) => b.length - a.length);

export function filterProfanity(content: string): string {
  if (!content) return content;
  let result = content;
  for (const word of SORTED_WORDS) {
    if (word.length < 2) continue;
    const regex = new RegExp(escapeRegex(word), 'gi');
    result = result.replace(regex, (match) => '*'.repeat(match.length));
  }
  return result;
}

export function containsProfanity(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  return SORTED_WORDS.some((word) => lower.includes(word.toLowerCase()));
}
