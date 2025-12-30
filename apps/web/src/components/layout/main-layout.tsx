'use client';

import { useState, useEffect } from 'react';
import { Sidebar, MobileHeader } from './sidebar';
import { Megaphone, ChevronDown } from 'lucide-react';

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
            <div className="bg-brand-800 text-white">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="border-b border-brand-700 last:border-b-0">
                  <button
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-brand-700/50 transition-colors"
                    onClick={() => setExpandedAnnouncement(
                      expandedAnnouncement === announcement.id ? null : announcement.id
                    )}
                  >
                    <Megaphone className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left text-sm font-medium truncate">
                      {announcement.title}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 flex-shrink-0 transition-transform ${
                        expandedAnnouncement === announcement.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expandedAnnouncement === announcement.id && (
                    <div className="px-4 pb-3 pt-0">
                      <div className="pl-7 text-sm text-brand-100 whitespace-pre-wrap">
                        {announcement.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
