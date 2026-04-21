// 익명 채팅 닉네임 자동 생성기

const ADJECTIVES = [
  '즐거운', '행복한', '신나는', '반가운', '멋진', '친절한', '귀여운',
  '다정한', '따뜻한', '용감한', '똑똑한', '부지런한', '성실한', '활발한',
  '재미있는', '엉뚱한', '상냥한', '착한', '명랑한', '차분한',
];

const NOUNS = [
  '손님', '방문객', '단골', '친구', '이웃', '관객', '여행자', '모험가',
  '탐험가', '요리사', '독서가', '음악가', '예술가', '운동선수', '학생',
  '작가', '기자', '과학자', '철학자', '마법사',
];

export function generateAnonymousNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000; // 1000~9999
  return `${adj}${noun}${num}`;
}
