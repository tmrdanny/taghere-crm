// 공지사항 — 사장님 CRM / 프랜차이즈 CRM 공용 (읽음 처리한 공지 제외)
import { prisma } from '../lib/prisma.js';

export type AnnouncementReader = { storeId: string } | { franchiseId: string };

export async function listActiveAnnouncements(reader: AnnouncementReader) {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      isActive: true,
      reads: { none: reader },
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, content: true, priority: true, createdAt: true },
  });
}

/** 읽음 처리 — 공지가 없으면 false */
export async function markAnnouncementRead(id: string, reader: AnnouncementReader): Promise<boolean> {
  const announcement = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!announcement) return false;
  const existing = await prisma.announcementRead.findFirst({ where: { announcementId: id, ...reader } });
  if (!existing) await prisma.announcementRead.create({ data: { announcementId: id, ...reader } });
  return true;
}
