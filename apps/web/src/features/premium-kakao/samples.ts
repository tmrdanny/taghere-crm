// 프리미엄 카카오톡 샘플 템플릿 — 형태마다 3개.
// 외식 매장이 가장 많이 보내는 광고(재방문 쿠폰, 신메뉴, 할인·시즌 이벤트, 단골 감사, 점심·포장 특가,
// 리뷰 이벤트, 영업 안내, 메뉴 소개)를 형태별 규격에 맞춰 담았다. 문구·사진은 모든 매장이 그대로 쓸 수 있는 공용이고,
// 사진은 자체 제작 그래픽(apps/api/assets/premium-stock)이라 저작권 걱정이 없다.
import { BubbleType, PkButton, PkCard, PkContent, PkImage, emptyContent } from './spec';

export type StockKey =
  | 'new-menu' | 'coupon' | 'welcome-back' | 'weekend-sale' | 'rainy-day' | 'thanks' | 'lunch'
  | 'takeout' | 'review' | 'notice' | 'store' | 'menu-noodle' | 'menu-rice' | 'menu-drink';

/** 편집 화면용 샘플 이미지 — imageId 는 발송 때 서버가 솔라피 파일 ID 로 바꾼다 */
export const stock = (key: StockKey, variant: 'w' | 'wide' | 'sq' = 'w'): PkImage => ({ imageId: `stock:${key}`, url: `/premium-stock/${key}-${variant}.jpg` });

export interface Sample {
  id: string;
  name: string;
  tag: string; // 목적 (재방문 유도 · 신메뉴 · 할인 이벤트 등)
  thumb: StockKey;
  build: (link: string) => PkContent;
}

const btn = (name: string, link: string): PkButton => ({ name, link });
const commerce = (title: string, regularPrice: number, discountPrice?: number) => ({
  title,
  regularPrice: String(regularPrice),
  discountPrice: discountPrice ? String(discountPrice) : '',
});
const card = (p: Partial<PkCard> & { image: PkImage }, link: string, buttonName: string): PkCard => ({
  header: '',
  content: '',
  commerce: commerce('', 0),
  additionalContent: '',
  ...p,
  buttons: [btn(buttonName, link)],
});
const base = (type: BubbleType, link: string, patch: Partial<PkContent>): PkContent => ({ ...emptyContent(type, link), ...patch });

export const SAMPLES: Record<BubbleType, Sample[]> = {
  TEXT: [
    {
      id: 'text-welcome-back', name: '오랜만이에요 쿠폰', tag: '재방문 유도', thumb: 'welcome-back',
      build: (l) => base('TEXT', l, {
        content: '오랜만이에요! 요즘 통 못 뵈어서 연락드려요.\n다시 오시면 드리려고 쿠폰을 준비했어요.\n\n이번 달 안에 방문하시면 음료 1잔을 무료로 드려요.',
        buttons: [btn('매장 보기', l)],
        coupon: { kind: 'FREE', value: '음료', description: '이번 달 방문 시' },
      }),
    },
    {
      id: 'text-notice', name: '휴무·영업 안내', tag: '공지', thumb: 'notice',
      build: (l) => base('TEXT', l, {
        content: '영업 안내드려요.\n\n· 연휴 기간 휴무: 9/16(월) ~ 9/18(수)\n· 9/19(목)부터 정상 영업해요\n\n연휴 전후로 미리 예약하시면 자리를 잡아 드릴게요.',
        buttons: [btn('예약하기', l)],
      }),
    },
    {
      id: 'text-review', name: '리뷰 이벤트', tag: '리뷰', thumb: 'review',
      build: (l) => base('TEXT', l, {
        content: '리뷰 이벤트를 시작했어요!\n방문 후 네이버 리뷰를 남겨 주시면 다음 방문 때 사이드 메뉴 1개를 드려요.\n\n계산하실 때 직원에게 리뷰 화면을 보여 주세요.',
        buttons: [btn('리뷰 쓰러 가기', l)],
      }),
    },
  ],
  IMAGE: [
    {
      id: 'image-new-menu', name: '신메뉴 출시', tag: '신메뉴', thumb: 'new-menu',
      build: (l) => base('IMAGE', l, {
        image: stock('new-menu'),
        content: '새로운 메뉴가 나왔어요!\n가장 먼저 맛보러 오시는 분들께 음료를 서비스로 드려요.',
        buttons: [btn('메뉴 보기', l)],
        coupon: { kind: 'FREE', value: '음료', description: '신메뉴 주문 시' },
      }),
    },
    {
      id: 'image-coupon', name: '단골 할인 쿠폰', tag: '재방문 유도', thumb: 'coupon',
      build: (l) => base('IMAGE', l, {
        image: stock('coupon'),
        content: '늘 찾아 주셔서 감사해요.\n단골 손님께만 드리는 할인 쿠폰이에요.\n이번 주 일요일까지 쓰실 수 있어요.',
        buttons: [btn('매장 보기', l)],
        coupon: { kind: 'WON', value: '3000', description: '2만원 이상 주문 시' },
      }),
    },
    {
      id: 'image-rainy', name: '비 오는 날 특가', tag: '시즌 이벤트', thumb: 'rainy-day',
      build: (l) => base('IMAGE', l, {
        image: stock('rainy-day'),
        content: '비 오는 날엔 따뜻한 한 그릇 어떠세요?\n오늘 방문하시면 전 메뉴 10% 할인해 드려요.',
        buttons: [btn('길찾기', l)],
        coupon: { kind: 'PCT', value: '10', description: '오늘 방문 시' },
      }),
    },
  ],
  WIDE: [
    {
      id: 'wide-weekend', name: '주말 할인', tag: '할인 이벤트', thumb: 'weekend-sale',
      build: (l) => base('WIDE', l, {
        image: stock('weekend-sale', 'wide'),
        content: '이번 주말만! 전 메뉴 15% 할인해 드려요.',
        buttons: [btn('예약하기', l), btn('길찾기', l)],
      }),
    },
    {
      id: 'wide-new-menu', name: '신메뉴 출시', tag: '신메뉴', thumb: 'new-menu',
      build: (l) => base('WIDE', l, {
        image: stock('new-menu', 'wide'),
        content: '새 메뉴가 나왔어요. 가장 먼저 맛보러 오세요!',
        buttons: [btn('메뉴 보기', l)],
      }),
    },
    {
      id: 'wide-thanks', name: '단골 감사', tag: '재방문 유도', thumb: 'thanks',
      build: (l) => base('WIDE', l, {
        image: stock('thanks', 'wide'),
        content: '늘 찾아 주셔서 감사해요. 이번 달 방문하시면 작은 선물을 드려요.',
        buttons: [btn('매장 보기', l)],
        coupon: { kind: 'FREE', value: '사이드', description: '이번 달 방문 시' },
      }),
    },
  ],
  COMMERCE: [
    {
      id: 'commerce-lunch', name: '점심 특가', tag: '시간 할인', thumb: 'lunch',
      build: (l) => base('COMMERCE', l, {
        image: stock('lunch'),
        commerce: commerce('평일 점심 특선 세트 11:30~14:00', 12000, 9900),
        buttons: [btn('예약하기', l)],
      }),
    },
    {
      id: 'commerce-takeout', name: '포장 할인', tag: '포장', thumb: 'takeout',
      build: (l) => base('COMMERCE', l, {
        image: stock('takeout'),
        commerce: commerce('포장 주문 세트 (포장 시 할인)', 18000, 15000),
        buttons: [btn('주문하기', l)],
      }),
    },
    {
      id: 'commerce-signature', name: '대표 메뉴 특가', tag: '할인 이벤트', thumb: 'menu-noodle',
      build: (l) => base('COMMERCE', l, {
        image: stock('menu-noodle'),
        commerce: commerce('이번 주만! 사장님 추천 대표 메뉴', 15000, 12900),
        buttons: [btn('메뉴 보기', l)],
      }),
    },
  ],
  WIDE_ITEM_LIST: [
    {
      id: 'list-weekly', name: '이번 주 추천', tag: '메뉴 소개', thumb: 'menu-noodle',
      build: (l) => base('WIDE_ITEM_LIST', l, {
        header: '이번 주 사장님 추천',
        mainItem: { title: '가장 많이 찾는 대표 메뉴', image: stock('menu-noodle'), link: l },
        subItems: [
          { title: '든든한 식사 메뉴', image: stock('menu-rice', 'sq'), link: l },
          { title: '함께 즐기기 좋은 음료', image: stock('menu-drink', 'sq'), link: l },
          { title: '새로 나온 메뉴', image: stock('new-menu', 'sq'), link: l },
        ],
        buttons: [btn('전체 메뉴', l)],
      }),
    },
    {
      id: 'list-best', name: '인기 메뉴 TOP3', tag: '메뉴 소개', thumb: 'menu-rice',
      build: (l) => base('WIDE_ITEM_LIST', l, {
        header: '손님들이 가장 많이 찾는 메뉴',
        mainItem: { title: '1위 · 우리 가게 인기 메뉴', image: stock('menu-rice'), link: l },
        subItems: [
          { title: '2위 · 사장님 대표 메뉴', image: stock('menu-noodle', 'sq'), link: l },
          { title: '3위 · 음료와 주류', image: stock('menu-drink', 'sq'), link: l },
          { title: '요즘 뜨는 신메뉴', image: stock('new-menu', 'sq'), link: l },
        ],
        buttons: [btn('메뉴 보기', l)],
      }),
    },
    {
      id: 'list-events', name: '이번 달 이벤트', tag: '할인 이벤트', thumb: 'thanks',
      build: (l) => base('WIDE_ITEM_LIST', l, {
        header: '이번 달 이벤트 모아 보기',
        mainItem: { title: '단골 감사 이벤트', image: stock('thanks'), link: l },
        subItems: [
          { title: '평일 점심 특가', image: stock('lunch', 'sq'), link: l },
          { title: '포장 주문 할인', image: stock('takeout', 'sq'), link: l },
          { title: '리뷰 쓰면 사이드 메뉴 무료', image: stock('review', 'sq'), link: l },
        ],
        buttons: [btn('자세히 보기', l)],
      }),
    },
  ],
  CAROUSEL_FEED: [
    {
      id: 'feed-menu', name: '메뉴 소개', tag: '메뉴 소개', thumb: 'menu-noodle',
      build: (l) => base('CAROUSEL_FEED', l, {
        cards: [
          card({ image: stock('menu-noodle'), header: '대표 메뉴', content: '매일 아침 직접 우려낸 육수로 만들어요.' }, l, '자세히'),
          card({ image: stock('menu-rice'), header: '인기 메뉴', content: '든든하게 한 끼 드시고 싶을 때 딱이에요.' }, l, '자세히'),
          card({ image: stock('menu-drink'), header: '음료 · 주류', content: '식사와 잘 어울리는 음료도 준비했어요.' }, l, '자세히'),
        ],
      }),
    },
    {
      id: 'feed-events', name: '이벤트 모음', tag: '할인 이벤트', thumb: 'lunch',
      build: (l) => base('CAROUSEL_FEED', l, {
        cards: [
          card({ image: stock('lunch'), header: '평일 점심 특가', content: '평일 11:30 ~ 14:00 점심 세트를 할인해 드려요.' }, l, '자세히'),
          card({ image: stock('takeout'), header: '포장 할인', content: '포장 주문하시면 전 메뉴 1,000원 할인이에요.' }, l, '자세히'),
          card({ image: stock('review'), header: '리뷰 이벤트', content: '리뷰를 남겨 주시면 다음 방문 때 사이드 메뉴를 드려요.' }, l, '자세히'),
        ],
      }),
    },
    {
      id: 'feed-store', name: '매장 안내', tag: '공지', thumb: 'store',
      build: (l) => base('CAROUSEL_FEED', l, {
        cards: [
          card({ image: stock('store'), header: '우리 매장', content: '편하게 머물다 가실 수 있게 준비했어요.' }, l, '길찾기'),
          card({ image: stock('notice'), header: '영업 시간', content: '평일 11:30 ~ 22:00\n매주 월요일은 쉬어요.' }, l, '자세히'),
          card({ image: stock('coupon'), header: '단골 혜택', content: '스탬프 10개를 모으시면 메뉴 하나를 드려요.' }, l, '자세히'),
        ],
      }),
    },
  ],
  CAROUSEL_COMMERCE: [
    {
      id: 'cc-menu-sale', name: '메뉴별 할인', tag: '할인 이벤트', thumb: 'menu-noodle',
      build: (l) => base('CAROUSEL_COMMERCE', l, {
        cards: [
          card({ image: stock('menu-noodle'), commerce: commerce('대표 메뉴', 15000, 12900) }, l, '주문하기'),
          card({ image: stock('menu-rice'), commerce: commerce('인기 메뉴', 12000, 9900) }, l, '주문하기'),
          card({ image: stock('menu-drink'), commerce: commerce('음료', 5000, 3900) }, l, '주문하기'),
        ],
      }),
    },
    {
      id: 'cc-lunch-set', name: '점심 세트', tag: '시간 할인', thumb: 'lunch',
      build: (l) => base('CAROUSEL_COMMERCE', l, {
        cards: [
          card({ image: stock('lunch'), commerce: commerce('점심 세트 A', 12000, 9900), additionalContent: '평일 11:30 ~ 14:00' }, l, '예약하기'),
          card({ image: stock('menu-rice'), commerce: commerce('점심 세트 B', 13000, 10900), additionalContent: '평일 11:30 ~ 14:00' }, l, '예약하기'),
          card({ image: stock('menu-drink'), commerce: commerce('세트 음료 추가', 3000, 1900) }, l, '예약하기'),
        ],
      }),
    },
    {
      id: 'cc-takeout', name: '포장 특가', tag: '포장', thumb: 'takeout',
      build: (l) => base('CAROUSEL_COMMERCE', l, {
        cards: [
          card({ image: stock('takeout'), commerce: commerce('포장 세트', 18000, 15000), additionalContent: '포장 주문 시' }, l, '주문하기'),
          card({ image: stock('menu-noodle'), commerce: commerce('대표 메뉴 포장', 15000, 13500), additionalContent: '포장 주문 시' }, l, '주문하기'),
          card({ image: stock('menu-rice'), commerce: commerce('인기 메뉴 포장', 12000, 10800) }, l, '주문하기'),
        ],
      }),
    },
  ],
  PREMIUM_VIDEO: [
    {
      id: 'video-store', name: '매장 소개 영상', tag: '매장 소개', thumb: 'store',
      build: (l) => base('PREMIUM_VIDEO', l, {
        image: stock('store'), header: '우리 매장을 소개해요', content: '영상으로 먼저 만나 보세요', buttons: [btn('길찾기', l)],
      }),
    },
    {
      id: 'video-kitchen', name: '조리 과정', tag: '메뉴 소개', thumb: 'menu-noodle',
      build: (l) => base('PREMIUM_VIDEO', l, {
        image: stock('menu-noodle'), header: '주방에서 만드는 과정', content: '정성껏 만드는 모습이에요', buttons: [btn('메뉴 보기', l)],
      }),
    },
    {
      id: 'video-new-menu', name: '신메뉴 미리 보기', tag: '신메뉴', thumb: 'new-menu',
      build: (l) => base('PREMIUM_VIDEO', l, {
        image: stock('new-menu'), header: '신메뉴 미리 보기', content: '새 메뉴를 영상으로 소개해요', buttons: [btn('예약하기', l)],
      }),
    },
  ],
};

/** 템플릿 기본형(쿠폰 알림톡) 샘플 — 쿠폰 내용만 채운다 */
export const ALIMTALK_SAMPLES = [
  { id: 'at-drink', name: '음료 1잔 무료', tag: '재방문 유도', couponContent: '음료 1잔 무료 (식사 주문 시)' },
  { id: 'at-won', name: '3,000원 할인', tag: '단골 쿠폰', couponContent: '3,000원 할인 (2만원 이상 주문 시)' },
  { id: 'at-side', name: '사이드 메뉴 서비스', tag: '신메뉴·이벤트', couponContent: '사이드 메뉴 1개 서비스' },
];
