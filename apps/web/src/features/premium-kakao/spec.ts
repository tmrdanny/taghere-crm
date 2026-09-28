// 프리미엄 카카오톡(카카오 브랜드 메시지) 형태별 규격.
// API services/premium-kakao/spec.ts 와 같은 파일이다 (한쪽을 고치면 다른 쪽도 고친다).
// 솔라피 가이드와 SDK 검증 규칙이 다른 칸은 더 엄격한 값을 쓴다.

export type BubbleType =
  | 'TEXT'
  | 'IMAGE'
  | 'WIDE'
  | 'WIDE_ITEM_LIST'
  | 'COMMERCE'
  | 'CAROUSEL_FEED'
  | 'CAROUSEL_COMMERCE'
  | 'PREMIUM_VIDEO';

export interface PkImage {
  imageId: string; // 솔라피 파일 ID
  url: string; // 미리보기용 (API 서버 기준 경로)
}

export interface PkButton {
  name: string;
  link: string;
}

export type CouponKind = 'WON' | 'PCT' | 'FREE' | 'UP';

export interface PkCoupon {
  kind: CouponKind;
  value: string; // WON: 금액, PCT: 할인율, FREE/UP: 메뉴명(공백 없이 7자)
  description: string;
}

export interface PkCommerce {
  title: string;
  regularPrice: string;
  discountPrice: string;
}

export interface PkItem {
  title: string;
  image: PkImage | null;
  link: string;
}

export interface PkCard {
  header: string;
  content: string;
  image: PkImage | null;
  commerce: PkCommerce;
  additionalContent: string;
  buttons: PkButton[];
}

export interface PkContent {
  header: string;
  content: string;
  image: PkImage | null;
  buttons: PkButton[];
  coupon: PkCoupon | null;
  commerce: PkCommerce;
  additionalContent: string;
  mainItem: PkItem;
  subItems: PkItem[];
  cards: PkCard[];
  videoUrl: string;
}

// 이미지 슬롯 — 솔라피 업로드 파일 유형과 잘라낼 비율/크기
export type ImageSlot = 'BMS' | 'BMS_WIDE' | 'BMS_WIDE_MAIN_ITEM_LIST' | 'BMS_WIDE_SUB_ITEM_LIST' | 'BMS_CAROUSEL_FEED_LIST' | 'BMS_CAROUSEL_COMMERCE_LIST';
export const IMAGE_SLOT_SIZE: Record<ImageSlot, { width: number; height: number; label: string }> = {
  BMS: { width: 800, height: 400, label: '2:1 · 800×400' },
  BMS_WIDE: { width: 800, height: 600, label: '4:3 · 800×600' },
  BMS_WIDE_MAIN_ITEM_LIST: { width: 800, height: 400, label: '2:1 · 800×400' },
  BMS_WIDE_SUB_ITEM_LIST: { width: 800, height: 800, label: '1:1 · 800×800' },
  BMS_CAROUSEL_FEED_LIST: { width: 800, height: 400, label: '2:1 · 800×400' },
  BMS_CAROUSEL_COMMERCE_LIST: { width: 800, height: 400, label: '2:1 · 800×400' },
};

export interface TypeSpec {
  type: BubbleType;
  name: string;
  tip: string;
  price: number; // 건당 판매가 (부가세 포함)
  imageSlot?: ImageSlot;
  contentMax?: number;
  contentLines?: number;
  headerMax?: number;
  buttonsMax: number; // 쿠폰이 붙으면 5 → 4
  buttonsMin?: number;
  buttonNameMax: number;
  couponDescMax?: number; // 쿠폰 불가 형태는 undefined
}

export const TYPE_SPECS: TypeSpec[] = [
  { type: 'TEXT', name: '텍스트형', tip: '공지·긴 안내', price: 150, contentMax: 1300, contentLines: 99, buttonsMax: 5, buttonNameMax: 14, couponDescMax: 12 },
  { type: 'IMAGE', name: '이미지형', tip: '신메뉴 한 장', price: 150, imageSlot: 'BMS', contentMax: 400, contentLines: 29, buttonsMax: 5, buttonNameMax: 14, couponDescMax: 12 },
  { type: 'WIDE', name: '와이드 이미지형', tip: '사진이 주인공', price: 150, imageSlot: 'BMS_WIDE', contentMax: 76, contentLines: 1, buttonsMax: 2, buttonNameMax: 8, couponDescMax: 18 },
  { type: 'COMMERCE', name: '커머스형', tip: '할인가 강조', price: 180, imageSlot: 'BMS', buttonsMin: 1, buttonsMax: 2, buttonNameMax: 8, couponDescMax: 12 },
  { type: 'WIDE_ITEM_LIST', name: '와이드 리스트형', tip: '추천 메뉴 모음', price: 180, headerMax: 20, buttonsMax: 2, buttonNameMax: 8, couponDescMax: 18 },
  { type: 'CAROUSEL_FEED', name: '캐러셀 피드형', tip: '넘겨 보는 메뉴판', price: 180, imageSlot: 'BMS_CAROUSEL_FEED_LIST', buttonsMax: 2, buttonsMin: 1, buttonNameMax: 8 },
  { type: 'CAROUSEL_COMMERCE', name: '캐러셀 커머스형', tip: '메뉴별 할인가', price: 180, imageSlot: 'BMS_CAROUSEL_COMMERCE_LIST', buttonsMax: 2, buttonsMin: 1, buttonNameMax: 8 },
  { type: 'PREMIUM_VIDEO', name: '동영상형', tip: '매장 분위기 영상', price: 180, headerMax: 20, contentMax: 20, contentLines: 1, buttonsMax: 1, buttonNameMax: 8, couponDescMax: 12 },
];

export const SPEC: Record<BubbleType, TypeSpec> = Object.fromEntries(TYPE_SPECS.map((s) => [s.type, s])) as Record<BubbleType, TypeSpec>;

export const LIMITS = {
  commerceTitle: 30,
  additionalContent: 34,
  mainItemTitle: 25,
  subItemTitle: 30,
  subItemsCount: 3, // 가이드(전체 3~4개)와 SDK 예제(목록 최소 3개)가 모두 맞는 값
  cardHeader: 20,
  cardContent: 180,
  cardContentLines: 2,
  cardsMin: 2,
  cardsMax: 6,
  couponFreeMax: 7,
  priceMax: 99_999_999,
};

export const charLen = (s: string | undefined | null) => [...String(s ?? '')].length;
export const lineBreaks = (s: string | undefined | null) => String(s ?? '').split('\n').length - 1;

export function couponTitle(c: PkCoupon): string {
  const v = c.value.trim();
  // 카카오 쿠폰 제목 형식은 숫자에 쉼표를 허용하지 않는다
  if (c.kind === 'WON') return `${Number(v.replace(/,/g, '') || 0)}원 할인 쿠폰`;
  if (c.kind === 'PCT') return `${v || 0}% 할인 쿠폰`;
  if (c.kind === 'FREE') return `${v || 'OOO'} 무료 쿠폰`;
  return `${v || 'OOO'} UP 쿠폰`;
}

const emptyCommerce = (): PkCommerce => ({ title: '', regularPrice: '', discountPrice: '' });
export const emptyItem = (): PkItem => ({ title: '', image: null, link: '' });
export const emptyCard = (): PkCard => ({ header: '', content: '', image: null, commerce: emptyCommerce(), additionalContent: '', buttons: [{ name: '자세히', link: '' }] });

export function emptyContent(type: BubbleType, defaultLink = ''): PkContent {
  const base: PkContent = {
    header: '',
    content: '',
    image: null,
    buttons: [],
    coupon: null,
    commerce: emptyCommerce(),
    additionalContent: '',
    mainItem: emptyItem(),
    subItems: [],
    cards: [],
    videoUrl: '',
  };
  const btn = (name: string): PkButton => ({ name, link: defaultLink });
  switch (type) {
    case 'TEXT':
    case 'IMAGE':
      return { ...base, buttons: [btn('자세히 보기')] };
    case 'WIDE':
      return { ...base, buttons: [btn('예약하기')] };
    case 'COMMERCE':
      return { ...base, buttons: [btn('주문하기')] };
    case 'WIDE_ITEM_LIST':
      return { ...base, mainItem: { ...emptyItem(), link: defaultLink }, subItems: Array.from({ length: LIMITS.subItemsCount }, () => ({ ...emptyItem(), link: defaultLink })) };
    case 'CAROUSEL_FEED':
    case 'CAROUSEL_COMMERCE':
      return { ...base, cards: [0, 1].map(() => ({ ...emptyCard(), buttons: [btn(type === 'CAROUSEL_COMMERCE' ? '주문' : '자세히')] })) };
    case 'PREMIUM_VIDEO':
      return { ...base, buttons: [btn('자세히 보기')] };
  }
}

const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/.test(s.trim());
const num = (s: string) => Number(String(s ?? '').replace(/,/g, ''));

function checkText(out: string[], v: string, max: number | undefined, label: string, opts: { required?: boolean; lines?: number } = {}) {
  if (opts.required && !v.trim()) out.push(`${label}을(를) 입력해 주세요`);
  if (max !== undefined && charLen(v) > max) out.push(`${label}은(는) ${max}자까지예요 (${charLen(v)}자)`);
  if (opts.lines !== undefined && lineBreaks(v) > opts.lines) out.push(`${label} 줄바꿈은 ${opts.lines}번까지예요`);
}

function checkButtons(out: string[], buttons: PkButton[], min: number, max: number, nameMax: number, label = '버튼') {
  if (buttons.length < min) out.push(`${label}이 ${min}개 이상 필요해요`);
  if (buttons.length > max) out.push(`${label}은 ${max}개까지예요`);
  buttons.forEach((b, i) => {
    if (!b.name.trim()) out.push(`${label} ${i + 1} 이름을 입력해 주세요`);
    if (charLen(b.name) > nameMax) out.push(`${label} ${i + 1} 이름은 ${nameMax}자까지예요`);
    if (!isUrl(b.link)) out.push(`${label} ${i + 1} 연결 주소를 http(s)://로 입력해 주세요`);
  });
}

function checkCommerce(out: string[], c: PkCommerce, label: string) {
  checkText(out, c.title, LIMITS.commerceTitle, `${label} 상품명`, { required: true, lines: 0 });
  const reg = num(c.regularPrice);
  const sale = c.discountPrice.trim() ? num(c.discountPrice) : null;
  if (!c.regularPrice.trim() || !Number.isFinite(reg) || reg <= 0) out.push(`${label} 정가를 입력해 주세요`);
  else if (reg > LIMITS.priceMax) out.push(`${label} 정가가 너무 커요`);
  if (sale !== null && (!Number.isFinite(sale) || sale < 0 || sale >= reg)) out.push(`${label} 할인가는 정가보다 작아야 해요`);
}

/** 직원 확인 버튼 이름 — 켜면 버튼 목록 맨 끝(캐러셀은 카드마다)에 붙고, 손님별 직원 확인 화면으로 연결된다 */
export const STAFF_VERIFY_BUTTON = '직원 확인';

/** 발송 전 검사 — 문제 목록 (빈 배열이면 발송 가능). verifyButton: 직원 확인 버튼이 추가로 붙는지 */
export function validate(type: BubbleType, c: PkContent, verifyButton = false): string[] {
  const s = SPEC[type];
  const out: string[] = [];
  const extra = verifyButton ? 1 : 0;
  const buttonsMax = (c.coupon && s.buttonsMax === 5 ? 4 : s.buttonsMax) - extra;
  const fullMsg = '직원 확인 버튼이 들어갈 자리가 없어요. 버튼을 하나 지워 주세요';

  if (s.imageSlot && !['CAROUSEL_FEED', 'CAROUSEL_COMMERCE'].includes(type) && !c.image) out.push('이미지를 올려 주세요');

  switch (type) {
    case 'TEXT':
    case 'IMAGE':
    case 'WIDE':
      checkText(out, c.content, s.contentMax, '본문', { required: true, lines: s.contentLines });
      break;
    case 'COMMERCE':
      checkCommerce(out, c.commerce, '');
      checkText(out, c.additionalContent, LIMITS.additionalContent, '부가 설명', { lines: 1 });
      break;
    case 'WIDE_ITEM_LIST':
      checkText(out, c.header, s.headerMax, '헤더', { required: true, lines: 0 });
      if (!c.mainItem.image) out.push('대표 메뉴 이미지를 올려 주세요');
      checkText(out, c.mainItem.title, LIMITS.mainItemTitle, '대표 메뉴 제목', { required: true, lines: 1 });
      if (!isUrl(c.mainItem.link)) out.push('대표 메뉴 연결 주소를 입력해 주세요');
      if (c.subItems.length !== LIMITS.subItemsCount) out.push(`목록은 ${LIMITS.subItemsCount}개가 필요해요`);
      c.subItems.forEach((it, i) => {
        if (!it.image) out.push(`목록 ${i + 1} 이미지를 올려 주세요`);
        checkText(out, it.title, LIMITS.subItemTitle, `목록 ${i + 1} 제목`, { required: true, lines: 0 });
        if (!isUrl(it.link)) out.push(`목록 ${i + 1} 연결 주소를 입력해 주세요`);
      });
      break;
    case 'CAROUSEL_FEED':
    case 'CAROUSEL_COMMERCE':
      if (c.cards.length < LIMITS.cardsMin || c.cards.length > LIMITS.cardsMax) out.push(`카드는 ${LIMITS.cardsMin}~${LIMITS.cardsMax}장이에요`);
      c.cards.forEach((card, i) => {
        const l = `카드 ${i + 1}`;
        if (!card.image) out.push(`${l} 이미지를 올려 주세요`);
        if (type === 'CAROUSEL_FEED') {
          checkText(out, card.header, LIMITS.cardHeader, `${l} 제목`, { required: true, lines: 0 });
          checkText(out, card.content, LIMITS.cardContent, `${l} 설명`, { required: true, lines: LIMITS.cardContentLines });
        } else {
          checkCommerce(out, card.commerce, l);
          checkText(out, card.additionalContent, LIMITS.additionalContent, `${l} 부가 설명`, { lines: 1 });
        }
        checkButtons(out, card.buttons, Math.max(0, 1 - extra), verifyButton ? Infinity : 2, s.buttonNameMax, `${l} 버튼`);
        if (verifyButton && card.buttons.length > 2 - extra) out.push(`${l}: ${fullMsg}`);
      });
      break;
    case 'PREMIUM_VIDEO':
      if (!/^https:\/\/tv\.kakao\.com\/\S+/.test(c.videoUrl.trim())) out.push('영상 주소는 https://tv.kakao.com/ 으로 시작해야 해요');
      checkText(out, c.header, s.headerMax, '헤더', { lines: 0 });
      checkText(out, c.content, s.contentMax, '본문', { lines: s.contentLines });
      break;
  }

  if (!['CAROUSEL_FEED', 'CAROUSEL_COMMERCE'].includes(type)) {
    checkButtons(out, c.buttons, Math.max(0, (s.buttonsMin ?? 0) - extra), verifyButton ? Infinity : buttonsMax, s.buttonNameMax);
    // 직원 확인 버튼까지 합쳐 한도를 넘으면 한 번만 안내
    if (verifyButton && c.buttons.length > Math.max(0, buttonsMax)) out.push(fullMsg);
  }

  if (c.coupon) {
    if (s.couponDescMax === undefined) out.push('이 형태는 쿠폰을 붙일 수 없어요');
    else {
      const v = c.coupon.value.trim();
      if (c.coupon.kind === 'WON' && !(num(v) >= 1 && num(v) <= LIMITS.priceMax)) out.push('쿠폰 할인 금액을 입력해 주세요');
      if (c.coupon.kind === 'PCT' && !(num(v) >= 1 && num(v) <= 100)) out.push('쿠폰 할인율은 1~100%예요');
      if ((c.coupon.kind === 'FREE' || c.coupon.kind === 'UP') && (!v || /\s/.test(v) || charLen(v) > LIMITS.couponFreeMax)) out.push('쿠폰 메뉴명은 공백 없이 7자까지예요');
      checkText(out, c.coupon.description, s.couponDescMax, '쿠폰 설명', { required: true });
    }
  }

  return out;
}

// ---------- 발송 매장 안내 (맨 아래 한 줄) ----------
// 채널은 “태그히어 플레이스” 하나라, 어느 매장이 보낸 광고인지 메시지 맨 아래에 붙인다.
// 브랜드 메시지에는 글자 크기를 줄이는 칸이 없어서, 형태별로 들어갈 수 있는 곳에 넣는다:
//  - 커머스·캐러셀 커머스: 부가 설명(회색 작은 글씨) 칸
//  - 텍스트·이미지·와이드·캐러셀 피드: 본문(마지막 카드) 맨 끝 줄
//  - 와이드 리스트·동영상: 넣을 칸이 없어 생략
// 프랜차이즈 발송은 받는 손님마다 매장이 달라 #{매장명} 변수로 넣는다.
export const STORE_NAME_VAR = '#{매장명}';
/** 발송 매장 안내 사용 여부 — 지금은 숨김. 다시 쓸 때 true 로 바꾸면 미리보기·발송·편집 안내가 함께 켜진다 */
export const SENDER_FOOTER_ENABLED = false;
export const senderFooter = (storeName: string) => `${storeName}에서 발송된 카카오톡 광고톡입니다.`;

export type FooterPlacement = 'content' | 'additional' | null;

export function applySenderFooter(type: BubbleType, c: PkContent, storeName: string): { content: PkContent; placement: FooterPlacement } {
  if (!SENDER_FOOTER_ENABLED) return { content: c, placement: null };
  const footer = senderFooter(storeName);
  const fitsBody = (body: string, max: number, maxLines: number, sep = '\n\n') => {
    const next = body.trim() ? `${body.replace(/\s+$/, '')}${sep}${footer}` : footer;
    return charLen(next) <= max && lineBreaks(next) <= maxLines ? next : null;
  };
  const fitsAdditional = (extra: string) => {
    const next = extra.trim() ? `${extra.trim()}\n${footer}` : footer;
    return charLen(next) <= LIMITS.additionalContent && lineBreaks(next) <= 1 ? next : null;
  };
  switch (type) {
    case 'TEXT':
    case 'IMAGE': {
      const s = SPEC[type];
      const next = fitsBody(c.content, s.contentMax!, s.contentLines!);
      return next ? { content: { ...c, content: next }, placement: 'content' } : { content: c, placement: null };
    }
    case 'WIDE': {
      // 76자·줄바꿈 1번 — 한 줄 띄움 없이 바로 아래 줄에
      const next = c.content.trim() ? `${c.content.trim()}\n${footer}` : footer;
      return charLen(next) <= SPEC.WIDE.contentMax! && lineBreaks(next) <= 1
        ? { content: { ...c, content: next }, placement: 'content' }
        : { content: c, placement: null };
    }
    case 'COMMERCE': {
      const next = fitsAdditional(c.additionalContent);
      return next ? { content: { ...c, additionalContent: next }, placement: 'additional' } : { content: c, placement: null };
    }
    case 'CAROUSEL_FEED':
    case 'CAROUSEL_COMMERCE': {
      if (c.cards.length === 0) return { content: c, placement: null };
      const i = c.cards.length - 1;
      const last = c.cards[i];
      const next = type === 'CAROUSEL_FEED' ? fitsBody(last.content, LIMITS.cardContent, LIMITS.cardContentLines, '\n') : fitsAdditional(last.additionalContent);
      if (!next) return { content: c, placement: null };
      const card = type === 'CAROUSEL_FEED' ? { ...last, content: next } : { ...last, additionalContent: next };
      return { content: { ...c, cards: c.cards.map((x, j) => (j === i ? card : x)) }, placement: type === 'CAROUSEL_FEED' ? 'content' : 'additional' };
    }
    default:
      return { content: c, placement: null };
  }
}
