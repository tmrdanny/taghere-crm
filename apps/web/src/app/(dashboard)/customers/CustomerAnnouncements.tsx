import { Badge } from '@/components/ui/badge';
import { Megaphone } from 'lucide-react';
import { Announcement } from './types';

// 고객 페이지 상단 공지 배너 목록.
export function CustomerAnnouncements({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-200 rounded-lg"
        >
          <div className="flex-shrink-0 mt-0.5">
            <Megaphone className="w-5 h-5 text-brand-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="info" className="text-xs">공지</Badge>
              <span className="font-medium text-neutral-900">{announcement.title}</span>
            </div>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{announcement.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
