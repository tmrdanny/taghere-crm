import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// +82 국제번호를 0으로 시작하는 한국 번호로 변환
export function normalizePhone(phone: string): string {
  if (!phone) return phone;

  // 숫자와 + 기호만 남기기
  let cleaned = phone.replace(/[^\d+]/g, '');

  // +82로 시작하면 0으로 변환
  if (cleaned.startsWith('+82')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('82') && cleaned.length >= 11) {
    cleaned = '0' + cleaned.slice(2);
  }

  return cleaned;
}

export function formatPhone(phone: string): string {
  // 먼저 국제번호 정규화
  const normalized = normalizePhone(phone);

  // 마스킹: 010-****-1234 (가운데 4자리 전체 별표)
  if (normalized.length >= 11) {
    return `${normalized.slice(0, 3)}-****-${normalized.slice(-4)}`;
  }
  if (normalized.length === 8) {
    return `010-****-${normalized.slice(-4)}`;
  }
  return normalized;
}

export function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

export function formatCurrency(amount: number): string {
  return `${formatNumber(amount)}원`;
}

export function formatPoints(points: number): string {
  return `${formatNumber(points)} p`;
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '오늘 방문';
  if (diffDays === 1) return '어제 방문';
  if (diffDays < 7) return `${diffDays}일 전 방문`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전 방문`;
  if (diffDays < 90) return `${Math.floor(diffDays / 30)}개월 전 방문`;
  return `${diffDays}일 이상 미방문`;
}
