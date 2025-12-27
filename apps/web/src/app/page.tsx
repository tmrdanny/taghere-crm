'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

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

        // 토큰이 유효하면 홈 대시보드로 이동
        router.replace('/home');
      } catch (error) {
        localStorage.removeItem('token');
        router.replace('/login');
      }
    };

    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-neutral-500">로딩 중...</p>
      </div>
    </div>
  );
}
