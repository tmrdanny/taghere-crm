'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/main-layout';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  profileImage: string | null;
  store: {
    id: string;
    name: string;
  };
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/me`, {
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
        localStorage.removeItem('token');
        router.replace('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <MainLayout user={user}>{children}</MainLayout>;
}
