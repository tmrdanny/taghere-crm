import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string): string {
  // 마스킹: 010-****-1234
  if (phone.length >= 11) {
    return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`;
  }
  if (phone.length === 8) {
    return `010-****-${phone.slice(-4)}`;
  }
  return phone;
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
