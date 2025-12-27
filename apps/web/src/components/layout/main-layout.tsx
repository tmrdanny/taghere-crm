'use client';

import { Header } from './header';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}
