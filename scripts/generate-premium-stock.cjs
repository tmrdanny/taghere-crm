/**
 * 프리미엄 카카오톡 공용 샘플 이미지 생성 (저작권 걱정 없는 자체 그래픽)
 * 실행: node scripts/generate-premium-stock.cjs  (apps/api 의 sharp 사용)
 * 출력: apps/api/assets/premium-stock/{key}-{w|wide|sq}.jpg
 *   w = 2:1 (800×400) · wide = 4:3 (800×600) · sq = 1:1 (800×800)
 */
const path = require('path');
const fs = require('fs');
const sharp = require(require.resolve('sharp', { paths: [path.join(__dirname, '../apps/api')] }));

const OUT = path.join(__dirname, '../apps/api/assets/premium-stock');
fs.mkdirSync(OUT, { recursive: true });
const FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

// ---------- 아이콘 (중심 0,0 · 반지름 약 100 기준) ----------
const ICONS = {
  bowl: (c) => `
    <path d="M-38 -70 q-14 -22 0 -44 M0 -74 q-14 -22 0 -44 M38 -70 q-14 -22 0 -44" fill="none" stroke="${c.soft}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-110 -34 h220 a110 110 0 0 1 -220 0 z" fill="${c.ink}"/>
    <rect x="-60" y="68" width="120" height="16" rx="8" fill="${c.ink}"/>
    <path d="M-86 -34 q30 -26 60 0 q30 -26 60 0 q30 -26 52 0" fill="none" stroke="${c.accent}" stroke-width="10" stroke-linecap="round"/>`,
  rice: (c) => `
    <ellipse cx="0" cy="-34" rx="104" ry="26" fill="${c.soft}"/>
    <circle cx="-40" cy="-46" r="22" fill="${c.accent}"/><circle cx="18" cy="-52" r="18" fill="${c.accent2}"/><circle cx="56" cy="-40" r="14" fill="${c.accent}"/>
    <path d="M-110 -30 h220 a110 110 0 0 1 -220 0 z" fill="${c.ink}"/>
    <rect x="-56" y="72" width="112" height="16" rx="8" fill="${c.ink}"/>`,
  cup: (c) => `
    <path d="M-70 -80 h140 l-18 170 a14 14 0 0 1 -14 12 h-76 a14 14 0 0 1 -14 -12 z" fill="${c.ink}"/>
    <rect x="-84" y="-100" width="168" height="26" rx="10" fill="${c.ink}"/>
    <path d="M-60 -20 h120" stroke="${c.accent}" stroke-width="16"/>
    <path d="M20 -100 l30 -60" stroke="${c.ink}" stroke-width="12" stroke-linecap="round"/>
    <circle cx="-22" cy="30" r="10" fill="${c.soft}"/><circle cx="16" cy="54" r="7" fill="${c.soft}"/>`,
  ticket: (c) => `
    <path d="M-130 -70 h260 v44 a26 26 0 0 0 0 52 v44 h-260 v-44 a26 26 0 0 0 0 -52 z" fill="${c.ink}" transform="rotate(-8)"/>
    <g transform="rotate(-8)">
      <path d="M40 -60 v120" stroke="${c.bg}" stroke-width="6" stroke-dasharray="12 10"/>
      <text x="-44" y="22" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="800" fill="${c.accent}">%</text>
      <text x="86" y="8" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="800" fill="${c.soft}" letter-spacing="1">COUPON</text>
    </g>`,
  heart: (c) => `
    <path d="M0 96 C-120 20 -120 -80 -50 -80 C-20 -80 0 -56 0 -40 C0 -56 20 -80 50 -80 C120 -80 120 20 0 96 z" fill="${c.ink}"/>
    <path d="M-60 -44 q-20 10 -18 36" fill="none" stroke="${c.accent}" stroke-width="12" stroke-linecap="round"/>`,
  umbrella: (c) => `
    <path d="M-120 0 a120 110 0 0 1 240 0 q-20 -18 -40 0 q-20 -18 -40 0 q-20 -18 -40 0 q-20 -18 -40 0 q-20 -18 -40 0 q-20 -18 -40 0 z" fill="${c.ink}"/>
    <path d="M0 -110 v-14" stroke="${c.ink}" stroke-width="10" stroke-linecap="round"/>
    <path d="M0 0 v86 a22 22 0 0 1 -44 0" fill="none" stroke="${c.ink}" stroke-width="12" stroke-linecap="round"/>
    ${[[-150, -70], [150, -40], [-130, 70], [130, 80], [60, 120], [-70, 130]].map(([x, y]) => `<path d="M${x} ${y} q-8 16 0 24 q8 -8 0 -24z" fill="${c.accent}"/>`).join('')}`,
  star: (c) => `
    <path d="M0 -110 L30 -36 L108 -34 L46 14 L68 92 L0 46 L-68 92 L-46 14 L-108 -34 L-30 -36 Z" fill="${c.ink}" stroke="${c.ink}" stroke-width="14" stroke-linejoin="round"/>
    <circle cx="0" cy="0" r="22" fill="${c.accent}"/>`,
  clock: (c) => `
    <circle cx="0" cy="0" r="104" fill="${c.ink}"/>
    <circle cx="0" cy="0" r="84" fill="${c.soft}"/>
    <path d="M0 -58 V0 L40 28" fill="none" stroke="${c.ink}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    ${[0, 90, 180, 270].map((a) => `<rect x="-4" y="-80" width="8" height="16" rx="4" fill="${c.ink}" transform="rotate(${a})"/>`).join('')}`,
  bag: (c) => `
    <path d="M-60 -70 a60 60 0 0 1 120 0" fill="none" stroke="${c.ink}" stroke-width="14"/>
    <path d="M-100 -60 h200 l-14 170 h-172 z" fill="${c.ink}"/>
    <rect x="-52" y="-6" width="104" height="44" rx="10" fill="${c.accent}"/>
    <text x="0" y="26" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="800" fill="${c.ink}">TO GO</text>`,
  calendar: (c) => `
    <rect x="-104" y="-86" width="208" height="186" rx="22" fill="${c.ink}"/>
    <rect x="-104" y="-86" width="208" height="48" rx="22" fill="${c.accent}"/>
    <rect x="-104" y="-58" width="208" height="20" fill="${c.accent}"/>
    <path d="M-56 -110 v40 M56 -110 v40" stroke="${c.ink}" stroke-width="16" stroke-linecap="round"/>
    ${[-60, -20, 20, 60].map((x) => [0, 38].map((y) => `<rect x="${x - 14}" y="${y - 14}" width="28" height="24" rx="6" fill="${c.soft}"/>`).join('')).join('')}`,
  store: (c) => `
    <path d="M-120 -40 l20 -60 h200 l20 60 z" fill="${c.accent}"/>
    ${[-100, -60, -20, 20, 60].map((x, i) => `<path d="M${x} -100 h40 l${i < 2 ? -6 : i > 2 ? 6 : 0} 60 h-40 z" fill="${i % 2 ? c.soft : c.accent}"/>`).join('')}
    <rect x="-108" y="-40" width="216" height="140" fill="${c.ink}"/>
    <rect x="-80" y="-10" width="70" height="110" rx="6" fill="${c.soft}"/>
    <rect x="12" y="-10" width="70" height="60" rx="6" fill="${c.soft}"/>`,
};

// ---------- 테마 ----------
const THEMES = [
  { key: 'new-menu', icon: 'bowl', eyebrow: 'NEW MENU', title: '신메뉴 출시', bg: '#ffb35c', ink: '#3b1f0e', accent: '#ffe7c2', soft: '#fff3e0', accent2: '#e8743b' },
  { key: 'coupon', icon: 'ticket', eyebrow: 'SPECIAL COUPON', title: '단골 쿠폰 도착', bg: '#2b3a67', ink: '#ffcf5a', accent: '#2b3a67', soft: '#2b3a67', accent2: '#ffffff' },
  { key: 'welcome-back', icon: 'heart', eyebrow: 'WELCOME BACK', title: '오랜만이에요', bg: '#ffd6d6', ink: '#d94356', accent: '#ffffff', soft: '#ffffff', accent2: '#ffffff' },
  { key: 'weekend-sale', icon: 'ticket', eyebrow: 'WEEKEND SALE', title: '주말 할인', bg: '#e8412f', ink: '#ffffff', accent: '#e8412f', soft: '#e8412f', accent2: '#ffffff' },
  { key: 'rainy-day', icon: 'umbrella', eyebrow: 'RAINY DAY', title: '비 오는 날 특가', bg: '#7fa7d9', ink: '#1f3a5f', accent: '#ffffff', soft: '#dbe8f7', accent2: '#ffffff' },
  { key: 'thanks', icon: 'star', eyebrow: 'THANK YOU', title: '단골 감사 이벤트', bg: '#fbe7a1', ink: '#8a5a00', accent: '#fff6d6', soft: '#fff6d6', accent2: '#ffffff' },
  { key: 'lunch', icon: 'clock', eyebrow: 'LUNCH SPECIAL', title: '점심 특가', bg: '#bfe3c0', ink: '#1f5c3a', accent: '#ffffff', soft: '#eaf7ea', accent2: '#ffffff' },
  { key: 'takeout', icon: 'bag', eyebrow: 'TAKE OUT', title: '포장 할인', bg: '#d9b38c', ink: '#4a2e17', accent: '#fff1dd', soft: '#fff1dd', accent2: '#ffffff' },
  { key: 'review', icon: 'star', eyebrow: 'REVIEW EVENT', title: '리뷰 이벤트', bg: '#b9a6f0', ink: '#3b2a78', accent: '#ffe066', soft: '#ffffff', accent2: '#ffffff' },
  { key: 'notice', icon: 'calendar', eyebrow: 'NOTICE', title: '영업 안내', bg: '#e9ecef', ink: '#343a40', accent: '#ff8a4c', soft: '#ffffff', accent2: '#ffffff' },
  { key: 'store', icon: 'store', eyebrow: 'OUR STORE', title: '매장 소개', bg: '#f4d3b5', ink: '#5a3a22', accent: '#e8743b', soft: '#fff5ea', accent2: '#ffffff' },
  // 메뉴 카드용 (목록·캐러셀)
  { key: 'menu-noodle', icon: 'bowl', eyebrow: 'SIGNATURE', title: '대표 메뉴', bg: '#ffcf8a', ink: '#4a2a10', accent: '#fff0d6', soft: '#fff7ea', accent2: '#e8743b' },
  { key: 'menu-rice', icon: 'rice', eyebrow: 'BEST', title: '인기 메뉴', bg: '#b8dcb0', ink: '#24452a', accent: '#f26b3a', soft: '#fffdf5', accent2: '#ffd23f' },
  { key: 'menu-drink', icon: 'cup', eyebrow: 'DRINK', title: '음료 · 주류', bg: '#a9d4f5', ink: '#12385e', accent: '#ffd23f', soft: '#ffffff', accent2: '#ffffff' },
];

const SIZES = { w: [800, 400], wide: [800, 600], sq: [800, 800] };

function svgFor(t, [W, H], size) {
  const c = { bg: t.bg, ink: t.ink, accent: t.accent, soft: t.soft, accent2: t.accent2 };
  const textColor = ['coupon', 'weekend-sale'].includes(t.key) ? '#ffffff' : t.ink;
  // 레이아웃: 가로형은 왼쪽 글자 + 오른쪽 아이콘, 정사각은 위 아이콘 + 아래 글자
  const square = size === 'sq';
  const iconScale = square ? 1.55 : size === 'wide' ? 1.35 : 1.05;
  const iconX = square ? W / 2 : W * 0.72;
  const iconY = square ? H * 0.36 : H * 0.52;
  const tx = square ? W / 2 : 64;
  const anchor = square ? 'middle' : 'start';
  // 글자가 아이콘을 침범하지 않게 제목 길이에 맞춰 크기를 줄인다
  const baseTitle = square ? 84 : size === 'wide' ? 72 : 56;
  const room = square ? W - 120 : iconX - 118 * iconScale - tx - 24;
  const titleSize = Math.min(baseTitle, Math.floor(room / (t.title.length * 0.98)));
  const eyebrowY = square ? H * 0.77 : H * 0.42;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <circle cx="${iconX}" cy="${iconY}" r="${Math.min(W, H) * (square ? 0.36 : 0.44)}" fill="#ffffff" opacity="0.18"/>
    <g transform="translate(${iconX} ${iconY}) scale(${iconScale})">${ICONS[t.icon](c)}</g>
    <text x="${tx}" y="${eyebrowY}" text-anchor="${anchor}" font-family="${FONT}" font-size="${square ? 30 : 24}" font-weight="700" letter-spacing="4" fill="${textColor}" opacity="0.75">${t.eyebrow}</text>
    <text x="${tx}" y="${eyebrowY + titleSize + 10}" text-anchor="${anchor}" font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="${textColor}" letter-spacing="-2">${t.title}</text>
  </svg>`;
}

(async () => {
  for (const t of THEMES) {
    for (const [size, dims] of Object.entries(SIZES)) {
      await sharp(Buffer.from(svgFor(t, dims, size))).jpeg({ quality: 86 }).toFile(path.join(OUT, `${t.key}-${size}.jpg`));
    }
  }
  console.log(`${THEMES.length * 3} images → ${OUT}`);
})();
