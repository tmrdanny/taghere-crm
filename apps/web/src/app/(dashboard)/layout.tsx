'use client';

import { API_BASE } from '@/lib/api-config';
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
    taghereVersion?: string;
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

      // 같은 토큰으로 캐시된 사용자 정보가 있으면 즉시 렌더링하고, 검증은 백그라운드에서 수행
      try {
        const cached = sessionStorage.getItem('auth-me-cache');
        if (cached) {
          const { token: cachedToken, user: cachedUser } = JSON.parse(cached);
          if (cachedToken === token && cachedUser) {
            setUser(cachedUser);
            setIsLoading(false);
          }
        }
      } catch {
        // 캐시 파싱 실패 시 무시
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Unauthorized');
        }

        const userData = await res.json();
        setUser(userData);
        try {
          sessionStorage.setItem('auth-me-cache', JSON.stringify({ token, user: userData }));
        } catch {
          // 저장 실패는 무시
        }
      } catch (error) {
        sessionStorage.removeItem('auth-me-cache');
        localStorage.removeItem('token');
        setUser(null);
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

  return <MainLayout taghereVersion={user.store.taghereVersion}>{children}</MainLayout>;
}
