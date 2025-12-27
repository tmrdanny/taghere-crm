'use client';

import { useState, useEffect } from 'react';
import { Sidebar, MobileHeader } from './sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
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
    <div className="min-h-screen bg-neutral-50">
      {/* Mobile Header - Only visible on mobile/tablet */}
      <MobileHeader />

      {/* Main Layout with Sidebar */}
      <div className="flex">
        {/* Sidebar - Only visible on desktop */}
        <Sidebar isCollapsed={isCollapsed} onToggleCollapse={handleToggleCollapse} />

        {/* Main Content */}
        <main className="flex-1 min-h-screen lg:min-h-[calc(100vh)] overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
