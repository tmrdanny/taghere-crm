// 9개 핵심 카테고리 + 세부 매핑
export const CATEGORY_OPTIONS = [
  {
    value: 'KOREAN',
    label: '한식',
    icon: '🍚',
    mappedCategories: ['KOREAN', 'BUNSIK', 'KOREAN_PUB']
  },
  {
    value: 'CHINESE',
    label: '중식',
    icon: '🥟',
    mappedCategories: ['CHINESE']
  },
  {
    value: 'JAPANESE',
    label: '일식',
    icon: '🍣',
    mappedCategories: ['JAPANESE', 'IZAKAYA']
  },
  {
    value: 'WESTERN',
    label: '양식',
    icon: '🍝',
    mappedCategories: ['WESTERN', 'BRUNCH']
  },
  {
    value: 'CAFE',
    label: '카페',
    icon: '☕',
    mappedCategories: ['CAFE', 'BAKERY', 'ICECREAM']
  },
  {
    value: 'MEAT',
    label: '고기/구이',
    icon: '🥩',
    mappedCategories: ['MEAT', 'SEAFOOD', 'BUFFET']
  },
  {
    value: 'BEER',
    label: '주점',
    icon: '🍺',
    mappedCategories: ['BEER', 'POCHA', 'COOK_PUB']
  },
  {
    value: 'WINE_BAR',
    label: '와인',
    icon: '🍷',
    mappedCategories: ['WINE_BAR', 'COCKTAIL_BAR']
  },
  {
    value: 'DESSERT',
    label: '디저트',
    icon: '🍰',
    mappedCategories: ['DESSERT']
  },
] as const;

// "모든 업종" 선택 옵션
export const ALL_CATEGORIES_VALUE = 'ALL';
