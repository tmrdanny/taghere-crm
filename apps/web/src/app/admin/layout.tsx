'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  BadgeCheck,
  Building2,
  ChartNoAxesColumn,
  ChevronRight,
  CreditCard,
  Download,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  LogOut,
  Megaphone,
  Menu,
  Package,
  PanelLeft,
  Rocket,
  Store,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import './admin-theme.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    // 로그인 페이지는 인증 체크 건너뛰기
    if (pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }

    const checkAuth = async () => {
      const token = localStorage.getItem('adminToken');

      if (!token) {
        router.replace('/admin/login');
        return;
      }

      // 같은 토큰으로 이미 인증된 적 있으면 즉시 렌더링하고, 검증은 백그라운드에서 수행
      const verifiedToken = sessionStorage.getItem('admin-auth-verified');
      if (verifiedToken === token) {
        setIsAuthenticated(true);
        setIsLoading(false);
      }

      try {
        const res = await fetch(`${API_BASE}/api/admin/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Unauthorized');
        }

        sessionStorage.setItem('admin-auth-verified', token);
        setIsAuthenticated(true);
      } catch (error) {
        sessionStorage.removeItem('admin-auth-verified');
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
        router.replace('/admin/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router, pathname]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    router.push('/admin/login');
  };

  // 로그인 페이지는 레이아웃 없이 렌더링
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f2f3f4]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#131651] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const getPageTitle = () => {
    if (pathname === '/admin') return '홈';
    if (pathname === '/admin/insights') return 'CRM 분석 대시보드';
    if (pathname === '/admin/stores') return '매장 관리';
    if (pathname === '/admin/store-list') return '매장 목록';
    if (pathname === '/admin/franchises') return '프랜차이즈 관리';
    if (pathname === '/admin/payments') return '결제내역';
    if (pathname === '/admin/announcements') return '공지사항';
    if (pathname === '/admin/banners') return '배너 관리';
    if (pathname === '/admin/store-products') return '스토어 상품';
    if (pathname === '/admin/customers') return '고객 추출';
    if (pathname === '/admin/automation') return '자동 마케팅';
    if (pathname === '/admin/table-link') return '테이블 링크';
    if (pathname === '/admin/food-court') return '푸드코트 모드';
    if (pathname === '/admin/corporate-ad') return '기업광고';
    if (pathname === '/admin/place-booster') return '네이버 플레이스 부스터';
    return 'Admin';
  };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const sidebar = (
    <AdminSidebar
      pathname={pathname}
      onCollapse={() => setIsSidebarOpen(false)}
      onLogout={handleLogout}
      onNavigate={() => setIsMobileMenuOpen(false)}
    />
  );

  return (
    <div className="ad">
      <div className="ad-sky" aria-hidden>
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
      </div>

      <div className="ad-shell">
        {/* 데스크톱 사이드바 */}
        {isSidebarOpen && <div className="hidden lg:flex">{sidebar}</div>}

        {/* 모바일 사이드바 서랍 */}
        <div
          className={`ad-scrim fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)] lg:hidden ${isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
        <div
          className={`ad-drawer fixed inset-y-0 left-0 z-50 flex lg:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          aria-hidden={!isMobileMenuOpen}
        >
          {sidebar}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 상단 바 */}
          <header className="ad-topbar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-4 sm:px-6">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="메뉴 열기"
              className="ad-press grid h-8 w-8 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70 lg:hidden"
            >
              <Menu size={17} strokeWidth={1.7} />
            </button>
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                aria-label="사이드바 열기"
                title="사이드바 열기"
                className="ad-press hidden h-8 w-8 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70 lg:grid"
              >
                <PanelLeft size={16} strokeWidth={1.6} />
              </button>
            )}
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[color:var(--ad-faint)]">
              <span className="hidden sm:inline">TagHere Admin</span>
              <ChevronRight size={13} strokeWidth={1.7} className="hidden shrink-0 sm:block" />
              <span className="truncate font-medium text-[color:var(--ad-ink)]">{getPageTitle()}</span>
            </span>
            <span className="ml-auto hidden text-[12px] text-[color:var(--ad-faint)] sm:inline">{today}</span>
          </header>

          <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

type MenuItem = { href: string; label: string; icon: LucideIcon };

// 기존 메뉴 15개를 성격별 그룹으로
const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: '운영',
    items: [
      { href: '/admin', label: '홈', icon: Home },
      { href: '/admin/stores', label: '매장 관리', icon: Store },
      { href: '/admin/store-list', label: '매장 목록', icon: List },
      { href: '/admin/franchises', label: '프랜차이즈 관리', icon: Building2 },
    ],
  },
  {
    title: '매출',
    items: [
      { href: '/admin/payments', label: '결제내역', icon: CreditCard },
      { href: '/admin/store-products', label: '스토어 상품', icon: Package },
    ],
  },
  {
    title: '마케팅',
    items: [
      { href: '/admin/automation', label: '자동 마케팅', icon: Zap },
      { href: '/admin/place-booster', label: '네이버 플레이스 부스터', icon: Rocket },
      { href: '/admin/corporate-ad', label: '기업광고', icon: BadgeCheck },
      { href: '/admin/announcements', label: '공지사항', icon: Megaphone },
      { href: '/admin/banners', label: '배너 관리', icon: ImageIcon },
    ],
  },
  {
    title: '도구',
    items: [
      { href: '/admin/table-link', label: '테이블 링크', icon: Link2 },
      { href: '/admin/food-court', label: '푸드코트 모드', icon: LayoutGrid },
      { href: '/admin/customers', label: '고객 추출', icon: Download },
      { href: '/admin/insights', label: 'CRM 분석 대시보드', icon: ChartNoAxesColumn },
    ],
  },
];

function AdminSidebar({
  pathname,
  onCollapse,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  onCollapse: () => void;
  onLogout: () => void;
  onNavigate: () => void;
}) {
  const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));

  return (
    <aside className="ad-side flex w-[240px] shrink-0 flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2">
          <Image src="/Taghere-logo.png" alt="태그히어" width={24} height={24} className="h-6 w-6" priority />
          <span className="text-[14px] font-semibold tracking-[-0.02em]">TagHere Admin</span>
        </Link>
        <button
          onClick={onCollapse}
          aria-label="사이드바 접기"
          title="사이드바 접기"
          className="ad-press hidden h-7 w-7 place-items-center rounded-md text-[color:var(--ad-faint)] hover:bg-white/70 hover:text-[color:var(--ad-ink)] lg:grid"
        >
          <PanelLeft size={15} strokeWidth={1.6} />
        </button>
      </div>

      <nav className="ad-noscroll flex-1 overflow-y-auto px-3 pb-3">
        {menuGroups.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? 'mt-5' : 'mt-1'}>
            <p className="mb-1 px-2.5 text-[11px] font-medium text-[color:var(--ad-faint)]">{group.title}</p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`ad-press relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] ${
                        active
                          ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
                          : 'text-[color:var(--ad-ink-2)] hover:bg-white/60'
                      }`}
                    >
                      {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[color:var(--ad-yellow)]" />}
                      <Icon size={16} strokeWidth={1.7} className={active ? 'text-[color:var(--ad-navy)]' : 'text-[color:var(--ad-faint)]'} />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--ad-line)] p-3">
        <button
          onClick={onLogout}
          className="ad-press flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-[color:var(--ad-muted)] hover:bg-white/60 hover:text-[color:var(--ad-ink)]"
        >
          <LogOut size={16} strokeWidth={1.7} />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
