import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// 어드민 홈은 한 화면에서 9개 API를 동시에 호출한다. Prisma 기본 풀(작음)에서는
// 동시 요청이 연결을 못 받아 pool_timeout(기본 10s)으로 P2024 → 500이 난다.
// DB max_connections(103)에 여유가 있으므로 풀을 명시적으로 키운다(단일 인스턴스 기준 안전).
function withPool(url?: string): string | undefined {
  if (!url) return url;
  if (url.includes('connection_limit=')) return url; // 이미 지정돼 있으면 존중
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=15&pool_timeout=20`;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: { db: { url: withPool(process.env.DATABASE_URL) } },
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
