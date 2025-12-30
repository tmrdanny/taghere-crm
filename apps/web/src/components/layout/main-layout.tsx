'use client';

import { useState, useEffect } from 'react';
import { Sidebar, MobileHeader } from './sidebar';
import { Megaphone, ChevronRight } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: number;
  createdAt: string;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expandedAnnouncement, setExpandedAnnouncement] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Persist sidebar collapse state
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-collapsed');
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true');
    }
  }, []);

  // Fetch announcements
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`${apiUrl}/api/dashboard/announcements`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [apiUrl]);

  const handleToggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Mobile Header - Only visible on mobile/tablet */}
      <MobileHeader />

      {/* Main Layout with Sidebar */}
      <div className="flex">
        {/* Sidebar - Only visible on desktop */}
        <Sidebar isCollapsed={isCollapsed} onToggleCollapse={handleToggleCollapse} />

        {/* Main Content */}
        <main className="flex-1 min-h-screen lg:min-h-[calc(100vh)] overflow-x-hidden">
          {/* Global Announcements */}
          {announcements.length > 0 && (
            <div className="p-4 lg:p-6 pb-0 lg:pb-0">
              <div className="max-w-7xl mx-auto space-y-3">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className="bg-brand-50 border border-brand-200 rounded-xl overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-brand-100/50 transition-colors"
                      onClick={() => setExpandedAnnouncement(
                        expandedAnnouncement === announcement.id ? null : announcement.id
                      )}
                    >
                      <div className="flex-shrink-0 p-2 bg-brand-100 rounded-lg">
                        <Megaphone className="w-5 h-5 text-brand-800" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            공지
                          </span>
                          <span className="font-medium text-neutral-900 truncate">
                            {announcement.title}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-neutral-400 transition-transform flex-shrink-0 ${
                          expandedAnnouncement === announcement.id ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                    {expandedAnnouncement === announcement.id && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="pl-11 text-sm text-neutral-700 whitespace-pre-wrap">
                          {announcement.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
