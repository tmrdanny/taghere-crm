'use client';

import { useState, useEffect } from 'react';
import { Sidebar, MobileHeader } from './sidebar';
import '@/app/admin/admin-theme.css';

interface MainLayoutProps {
  children: React.ReactNode;
  taghereVersion?: string;
  stampEnabled?: boolean;
}

export function MainLayout({ children, taghereVersion, stampEnabled }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Persist sidebar collapse state
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-collapsed');
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true');
    }
  }, []);

  const handleToggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  return (
    // .ad: v2 토큰·글래스 배경, .ad-crm: 공용 컴포넌트의 기본 Tailwind 색을 v2 톤으로 재매핑
    <div className="ad ad-crm">
      <div className="ad-sky" aria-hidden>
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
      </div>

      {/* Mobile Header - Only visible on mobile/tablet */}
      <MobileHeader taghereVersion={taghereVersion} stampEnabled={stampEnabled} />

      {/* Main Layout with Sidebar */}
      <div className="ad-shell">
        {/* Sidebar - Only visible on desktop */}
        <Sidebar isCollapsed={isCollapsed} onToggleCollapse={handleToggleCollapse} taghereVersion={taghereVersion} stampEnabled={stampEnabled} />

        {/* Main Content */}
        <main className="relative min-w-0 flex-1 overflow-x-clip">
          {children}
        </main>
      </div>
    </div>
  );
}
