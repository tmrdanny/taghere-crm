'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Store,
  Users,
  MessageSquare,
  UserPlus,
  Zap,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Gift,
  Rocket,
  MessagesSquare,
  LineChart,
  TrendingUp,
} from 'lucide-react';

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

interface FranchiseSidebarProps {
  user: FranchiseUser;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

// 사장님 CRM·관리자와 같은 패턴: 드롭다운 없이 카테고리 제목 + 아이콘 메뉴를 항상 펼쳐 보여준다
const topItems: NavItem[] = [{ href: '/franchise/home', label: '홈', icon: Home }];

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: '운영',
    items: [{ href: '/franchise/stores', label: '가맹점', icon: Store }],
  },
  {
    title: '고객',
    items: [
      { href: '/franchise/customers', label: '고객 목록', icon: Users },
      { href: '/franchise/customers/feedback', label: '고객 피드백', icon: MessageSquare },
      { href: '/franchise/reward-claims', label: '스탬프 보상 신청', icon: Gift },
    ],
  },
  {
    title: '캠페인',
    items: [
      { href: '/franchise/campaigns/retarget', label: '메시지 발송', icon: MessageSquare },
      { href: '/franchise/campaigns/performance', label: '마케팅 성과', icon: TrendingUp },
      { href: '/franchise/campaigns/acquisition', label: '신규 고객 타겟', icon: UserPlus },
      { href: '/franchise/campaigns/place-booster', label: '플레이스 부스터', icon: Rocket },
      { href: '/franchise/campaigns/automation', label: '자동 마케팅', icon: Zap },
    ],
  },
  {
    title: '인사이트',
    items: [
      { href: '/franchise/insights', label: '인사이트 홈', icon: BarChart3 },
      { href: '/franchise/insights/analytics', label: '데이터 분석', icon: LineChart },
    ],
  },
];

// 하단 브랜드 버튼 메뉴로 모은 관리 항목
const manageItems: NavItem[] = [
  { href: '/franchise/billing', label: '충전', icon: CreditCard },
  { href: '/franchise/wallet-history', label: '사용내역', icon: MessagesSquare },
  { href: '/franchise/settings', label: '설정', icon: Settings },
];

function BrandLogo({ name, className }: { name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[color:var(--ad-ink)]">{name}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/api/franchise/auth/logo" alt={name} className={className} onError={() => setFailed(true)} />
  );
}

export function FranchiseSidebar({ user }: FranchiseSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    // 하위 메뉴가 따로 있는 경로는 정확히 일치할 때만 활성화 (예: 고객 목록 vs 고객 피드백, 인사이트 홈 vs 데이터 분석)
    if (href === '/franchise/customers' || href === '/franchise/insights') return false;
    return pathname.startsWith(href + '/');
  };

  const handleLogout = () => {
    localStorage.removeItem('franchiseToken');
    router.push('/franchise/login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // 관리 메뉴: 바깥을 누르거나 페이지가 바뀌면 닫기
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [accountOpen]);
  useEffect(() => setAccountOpen(false), [pathname]);

  const renderItem = (item: NavItem, isMobile = false) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={isMobile ? closeMobileMenu : undefined}
        aria-current={active ? 'page' : undefined}
        className={`ad-press relative mx-2 flex items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors ${
          isMobile ? 'h-11' : 'h-10 [@media(max-height:860px)]:h-[34px]'
        } ${
          active
            ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
            : 'text-[color:var(--ad-ink-2)] hover:bg-white/60'
        }`}
      >
        {active && <span className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[color:var(--ad-ink)]" />}
        <Icon strokeWidth={1.7} className={`h-4 w-4 shrink-0 ${active ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'}`} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const renderNav = (isMobile = false) => (
    <>
      <div className="space-y-0.5">{topItems.map((it) => renderItem(it, isMobile))}</div>
      {navGroups.map((g) => (
        <div key={g.title} className={isMobile ? 'mt-5' : 'mt-6 [@media(max-height:860px)]:mt-3'}>
          <p className="mb-1.5 px-5 text-[11px] font-medium text-[color:var(--ad-faint)]">{g.title}</p>
          <div className="space-y-0.5 [@media(max-height:860px)]:space-y-0">{g.items.map((it) => renderItem(it, isMobile))}</div>
        </div>
      ))}
    </>
  );

  const franchiseTag = (
    <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
      Franchise
    </span>
  );

  return (
    <>
      {/* Mobile Header */}
      <header className="ad-topbar fixed left-0 right-0 top-0 z-40 lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo name={user.franchise.name} className="h-7 w-auto object-contain" />
            {franchiseTag}
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="ad-press grid h-9 w-9 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && <div className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.4)] lg:hidden" onClick={closeMobileMenu} />}

      {/* Mobile Slide-out Menu */}
      <div
        className={`ad-side !fixed left-0 top-0 z-50 flex !h-full w-72 flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[color:var(--ad-line)] px-4">
          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo name={user.franchise.name} className="h-7 w-auto object-contain" />
            {franchiseTag}
          </div>
          <button
            onClick={closeMobileMenu}
            className="ad-press grid h-9 w-9 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70"
            aria-label="메뉴 닫기"
          >
            <X className="h-5 w-5" strokeWidth={1.7} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {renderNav(true)}
          <div className="mt-5">
            <p className="mb-1.5 px-5 text-[11px] font-medium text-[color:var(--ad-faint)]">관리</p>
            <div className="space-y-0.5">{manageItems.map((it) => renderItem(it, true))}</div>
          </div>
        </nav>
        <div className="border-t border-[color:var(--ad-line)] p-3">
          <button
            onClick={handleLogout}
            className="ad-press flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[13.5px] text-[color:var(--ad-muted)] hover:bg-white/60 hover:text-[color:var(--ad-ink)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.7} />
            로그아웃
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="ad-side hidden w-[248px] shrink-0 flex-col lg:flex">
        <div className="flex h-14 items-center gap-2 px-5">
          <BrandLogo name={user.franchise.name} className="h-7 w-auto max-w-[140px] object-contain" />
          {franchiseTag}
        </div>

        {/* 포스기처럼 휠이 없는 환경 대비: 스크롤바를 얇게 보이고, 넘칠 때 아래쪽을 흐리게 표시 */}
        <nav className="ad-scroll flex-1 overflow-y-auto py-3">
          {renderNav()}
          <div className="pointer-events-none sticky bottom-0 -mt-6 h-6 bg-gradient-to-t from-[rgba(250,251,252,0.95)] to-transparent" aria-hidden />
        </nav>

        {/* 브랜드·관리 메뉴 (충전, 사용내역, 설정, 로그아웃) */}
        <div ref={accountRef} className="relative border-t border-[color:var(--ad-line)] p-2">
          {accountOpen && (
            <div
              className="absolute bottom-full left-2 z-50 mb-2 w-[232px] rounded-[16px] bg-white p-1.5 shadow-[0_0_0_1px_var(--ad-line),0_18px_40px_-16px_rgba(29,32,34,0.25)]"
              role="menu"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[color:var(--ad-faint)]">관리</p>
              {manageItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className={`ad-press flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] ${
                      active ? 'bg-[color:var(--ad-bg)] font-semibold text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                    }`}
                  >
                    <Icon strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="mx-2 my-1 border-t border-[color:var(--ad-line)]" />
              <button
                onClick={handleLogout}
                role="menuitem"
                className="ad-press flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                <LogOut strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
                로그아웃
              </button>
            </div>
          )}
          <button
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            className={`ad-press flex h-11 w-full items-center gap-2.5 rounded-[12px] px-2 text-left hover:bg-white/60 ${
              accountOpen ? 'bg-white shadow-[0_0_0_1px_var(--ad-line)]' : ''
            }`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--ad-bg)] text-[12px] font-semibold text-[color:var(--ad-ink-2)]">
              {user.franchise.name?.charAt(0) || 'F'}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-[color:var(--ad-ink)]">{user.franchise.name}</span>
              <span className="block truncate text-[11.5px] text-[color:var(--ad-faint)]">{user.name} · HQ</span>
            </span>
            <Settings strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
          </button>
        </div>
      </aside>
    </>
  );
}
