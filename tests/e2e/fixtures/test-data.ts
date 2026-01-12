/**
 * Test Data for E2E Tests
 * Contains mock data for various test scenarios
 */

export const TEST_USER = {
  email: 'danny@tmr.com',
  password: '123456789a',
  storeName: 'E2E 테스트 매장',
  category: '카페/디저트',
  ownerName: '테스트 점주',
  phone: '010-1234-5678',
  businessRegNumber: '123-45-67890',
  address: '서울특별시 강남구 테헤란로 123',
  naverPlaceUrl: 'https://naver.me/test123',
};

export const TEST_ADMIN = {
  username: 'admin',
  password: 'admin123',
};

export const TEST_CUSTOMER = {
  name: '테스트 고객',
  phone: '010-9876-5432',
  birthYear: 1990,
  gender: 'FEMALE',
};

export const TEST_MESSAGE = {
  content: '[테스트] 안녕하세요! E2E 테스트 메시지입니다.',
  longContent: `[태그히어] 봄맞이 이벤트 안내

안녕하세요!
따뜻한 봄을 맞아 태그히어에서 특별한 혜택을 준비했습니다.

[이벤트 혜택]
- 첫 방문 고객 10% 할인
- 2인 이상 방문 시 음료 무료

기간: 4/1 ~ 4/30

많은 관심 부탁드립니다!`,
};

export const TEST_PAYMENT = {
  amount: 50000,
  orderId: `test-order-${Date.now()}`,
};

export const STORE_CATEGORIES = [
  '한식',
  '중식',
  '일식',
  '양식',
  '카페/디저트',
  '술집/Bar',
  '패스트푸드',
  '분식',
  '치킨',
  '피자',
  '아시안',
  '멕시칸',
  '브런치',
  '베이커리',
  '스테이크',
  '해산물',
  '뷔페',
  '푸드코트',
  '기타',
];

export const AGE_GROUPS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

export const GENDER_OPTIONS = [
  { value: 'all', label: '전체 성별' },
  { value: 'FEMALE', label: '여성' },
  { value: 'MALE', label: '남성' },
];
