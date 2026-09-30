'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FranchiseSidebar } from '@/components/franchise/sidebar';
import '@/app/admin/admin-theme.css';

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f2f3f4]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d2022] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    // 사장님 CRM과 같은 테마: .adm(v2 토큰·차분한 배경) + .adm-crm(공용 컴포넌트 기본 색을 무채색으로 재매핑)
    <div className="adm adm-crm">
      <div className="adm-sky" aria-hidden>
        <span className="adm-cloud" />
        <span className="adm-cloud" />
        <span className="adm-cloud" />
        <span className="adm-cloud" />
      </div>
      <div className="adm-shell">
        <FranchiseSidebar user={user} />
        <main className="relative min-w-0 flex-1 overflow-x-clip pt-14 lg:pt-0">{children}</main>
      </div>
    </div>
  );
}
