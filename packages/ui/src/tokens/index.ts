// Design Tokens for TagHere CRM
// Based on Figma design specifications

export const colors = {
  brand: {
    50: '#F0F4F8',
    100: '#D9E2EC',
    200: '#BCCCDC',
    300: '#9FB3C8',
    400: '#829AB1',
    500: '#627D98',
    600: '#486581',
    700: '#334E68',
    800: '#1E3A5F', // Primary brand color
    900: '#102A43',
  },
  neutral: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  success: {
    DEFAULT: '#10B981',
    light: '#D1FAE5',
  },
  warning: {
    DEFAULT: '#F59E0B',
    light: '#FEF3C7',
  },
  error: {
    DEFAULT: '#EF4444',
    light: '#FEE2E2',
  },
  info: {
    DEFAULT: '#3B82F6',
    light: '#DBEAFE',
  },
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
} as const;

export const borderRadius = {
  none: '0',
  sm: '0.25rem',   // 4px
  DEFAULT: '0.5rem', // 8px
  md: '0.625rem',  // 10px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem',   // 32px
  full: '9999px',
} as const;

export const fontSize = {
  'display-lg': ['3rem', { lineHeight: '1.2', fontWeight: '700' }],
  'display-md': ['2.25rem', { lineHeight: '1.25', fontWeight: '700' }],
  'display-sm': ['1.875rem', { lineHeight: '1.3', fontWeight: '600' }],
  'heading-lg': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],
  'heading-md': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
  'heading-sm': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
  'body-lg': ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
  'body-md': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
  'body-sm': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
  'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
} as const;

export const shadows = {
  card: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} as const;
