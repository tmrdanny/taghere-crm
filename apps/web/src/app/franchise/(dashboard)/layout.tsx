'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FranchiseSidebar } from '@/components/franchise/sidebar';

interface FranchiseUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  franchise: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function FranchiseDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<FranchiseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('franchiseToken');

      if (!token) {
        router.replace('/franchise/login');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/franchise/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Unauthorized');
        }

        const userData = await res.json();
        setUser(userData);
      } catch (error) {
        localStorage.removeItem('franchiseToken');
        router.replace('/franchise/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          {/* Loading Skeleton */}
          <div className="space-y-4">
            <div className="w-12 h-12 border-4 border-franchise-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mx-auto" />
              <div className="h-3 w-24 bg-slate-100 rounded animate-pulse mx-auto" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <FranchiseSidebar user={user} />
        <main className="flex-1 lg:ml-0 pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}
