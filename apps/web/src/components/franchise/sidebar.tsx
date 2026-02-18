'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Store,
  Users,
  Megaphone,
  MessageSquare,
  UserPlus,
  Zap,
  CreditCard,
  BarChart3,
  Settings,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Gift,
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
  badge?: string;
  children?: { href: string; label: string; icon: React.ElementType; badge?: string }[];
}

const navItems: NavItem[] = [
  { href: '/franchise/home', label: '홈', icon: Home },
  { href: '/franchise/stores', label: '가맹점', icon: Store },
  {
    href: '#customers',
    label: '고객',
    icon: Users,
    children: [
      { href: '/franchise/customers', label: '고객 목록', icon: Users },
      { href: '/franchise/customers/feedback', label: '고객 피드백', icon: MessageSquare },
      { href: '/franchise/reward-claims', label: '스탬프 보상 신청', icon: Gift },
    ],
  },
  {
    href: '#campaigns',
    label: '캠페인',
    icon: Megaphone,
    children: [
      { href: '/franchise/campaigns/retarget', label: '리타겟', icon: MessageSquare },
      { href: '/franchise/campaigns/acquisition', label: '신규 고객 타겟', icon: UserPlus },
      { href: '/franchise/campaigns/automation', label: '자동 마케팅', icon: Zap },
    ],
  },
  { href: '/franchise/billing', label: '충전', icon: CreditCard },
  { href: '/franchise/insights', label: '인사이트', icon: BarChart3 },
  { href: '/franchise/settings', label: '설정', icon: Settings },
];

export function FranchiseSidebar({ user }: FranchiseSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMenu = (href: string) => {
    setExpandedMenus((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === '#campaigns') {
      return pathname.startsWith('/franchise/campaigns');
    }
    if (href === '#customers') {
      return pathname.startsWith('/franchise/customers') || pathname.startsWith('/franchise/reward-claims');
    }
    // 정확히 일치하거나, 서브 경로인 경우 (단, 다른 서브메뉴 항목은 제외)
    if (pathname === href) return true;
    // 서브메뉴가 있는 항목의 경우: 정확히 일치할 때만 활성화
    // 예: /franchise/customers는 /franchise/customers/feedback와 구분
    if (href === '/franchise/customers') {
      return pathname === '/franchise/customers';
    }
    return pathname.startsWith(href + '/');
  };

  const handleLogout = () => {
    localStorage.removeItem('franchiseToken');
    router.push('/franchise/login');
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const renderNavItems = (items: NavItem[], isMobile = false) => {
    return items.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);
      const hasChildren = item.children && item.children.length > 0;
      const isExpanded = expandedMenus.includes(item.href);

      if (hasChildren) {
        return (
          <div key={item.href}>
            <button
              onClick={() => toggleMenu(item.href)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-franchise-50 text-franchise-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            {isExpanded && (
              <div className="mt-1 ml-4 pl-4 border-l border-slate-200 space-y-1">
                {item.children!.map((child) => {
                  const ChildIcon = child.icon;
                  const childActive = isActive(child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={isMobile ? closeMobileMenu : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        childActive
                          ? 'bg-franchise-50 text-franchise-700'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <ChildIcon className="w-4 h-4" />
                      <span>{child.label}</span>
                      {child.badge && (
                        <span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">
                          {child.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={isMobile ? closeMobileMenu : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            active
              ? 'bg-franchise-50 text-franchise-700'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Icon className="w-5 h-5" />
          <span>{item.label}</span>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/franchise/auth/logo"
              alt={user.franchise.name}
              className="h-7 w-auto object-contain"
              onError={(e) => {
                // 로고 로드 실패 시 기본 텍스트로 폴백
                e.currentTarget.style.display = 'none';
                const fallbackText = document.createElement('span');
                fallbackText.className = 'text-lg font-bold text-slate-900';
                fallbackText.textContent = user.franchise.name;
                e.currentTarget.parentElement?.appendChild(fallbackText);
              }}
            />
            <span className="px-1.5 py-0.5 bg-franchise-100 text-franchise-700 text-[10px] font-medium rounded">
              Franchise
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-600 hover:text-slate-900"
            aria-label="메뉴 열기"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Slide-out Menu */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/franchise/auth/logo"
              alt={user.franchise.name}
              className="h-7 w-auto object-contain"
              onError={(e) => {
                // 로고 로드 실패 시 기본 텍스트로 폴백
                e.currentTarget.style.display = 'none';
                const fallbackText = document.createElement('span');
                fallbackText.className = 'text-lg font-bold text-slate-900';
                fallbackText.textContent = user.franchise.name;
                e.currentTarget.parentElement?.appendChild(fallbackText);
              }}
            />
            <span className="px-1.5 py-0.5 bg-franchise-100 text-franchise-700 text-[10px] font-medium rounded">
              Franchise
            </span>
          </div>
          <button
            onClick={closeMobileMenu}
            className="p-2 text-slate-600 hover:text-slate-900"
            aria-label="메뉴 닫기"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Brand Selector (Mobile) */}
        <div className="p-4 border-b border-slate-200">
          <button className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
            <span className="truncate">{user.franchise.name}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {renderNavItems(navItems, true)}
        </nav>

        {/* Mobile User Section */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-franchise-100 flex items-center justify-center">
                <span className="text-sm font-medium text-franchise-700">
                  {user.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-franchise-100 text-franchise-700 text-[10px] font-medium rounded">
                    HQ
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-slate-200 h-screen sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-2 h-16 px-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/franchise/auth/logo"
              alt={user.franchise.name}
              className="h-8 w-auto object-contain"
              onError={(e) => {
                // 로고 로드 실패 시 기본 텍스트로 폴백
                e.currentTarget.style.display = 'none';
                const fallbackText = document.createElement('span');
                fallbackText.className = 'text-lg font-bold text-slate-900';
                fallbackText.textContent = user.franchise.name;
                e.currentTarget.parentElement?.appendChild(fallbackText);
              }}
            />
          </div>
          <span className="px-1.5 py-0.5 bg-franchise-100 text-franchise-700 text-[10px] font-medium rounded">
            Franchise
          </span>
        </div>

        {/* Brand Selector */}
        <div className="p-4 border-b border-slate-200">
          <button className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
            <span className="truncate">{user.franchise.name}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {renderNavItems(navItems)}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-franchise-100 flex items-center justify-center">
                <span className="text-sm font-medium text-franchise-700">
                  {user.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-franchise-100 text-franchise-700 text-[10px] font-medium rounded">
                    HQ
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
