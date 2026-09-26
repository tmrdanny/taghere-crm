import { Badge } from '@/components/ui/badge';
import { Megaphone } from 'lucide-react';
import { Announcement } from './types';

// 고객 페이지 상단 공지 배너 목록.
export function CustomerAnnouncements({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="ad-card flex items-start gap-3 p-4"
        >
          <div className="flex-shrink-0 mt-0.5">
            <Megaphone className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="info" className="inline-flex rounded-full border-0 bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg)]">공지</Badge>
              <span className="text-[14px] font-semibold text-[color:var(--ad-ink)]">{announcement.title}</span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--ad-ink-2)]">{announcement.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
