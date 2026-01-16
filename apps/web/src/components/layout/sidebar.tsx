'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  CreditCard,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
  Download,
  Send,
  History,
  UserPlus,
  MessageSquare,
  MessageSquareMore,
  ExternalLink,
  ChevronDown,
  Store,
  TabletSmartphone,
  ListOrdered,
  HandCoins,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 네이버 아이콘 컴포넌트 (동그라미 안에 N)
function NaverIcon({ className }: { className?: string }) {
  return (
    <div className={cn('w-5 h-5 rounded-full bg-[#03C75A] flex items-center justify-center', className)}>
      <span className="text-white text-xs font-bold leading-none">N</span>
    </div>
  );
}

// BeforeInstallPromptEvent 타입 정의
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// NavItem 타입 정의
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  isNew?: boolean;
  isCustomIcon?: boolean;
  isExternal?: boolean;
  isComingSoon?: boolean;
  comingSoonLink?: string;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
}

// 상단 독립 메뉴
const topNavItems: NavItem[] = [
  { href: '/home', label: '홈', icon: Home },
];

// 그룹화된 메뉴
const navGroups: NavGroup[] = [
  {
    title: '매장 운영',
    icon: Store,
    items: [
      { href: 'https://admin.tag-here.com', label: '주문/결제', icon: TabletSmartphone, isExternal: true },
      { href: '#waiting', label: '웨이팅', icon: ListOrdered, isNew: true, isComingSoon: true, comingSoonLink: 'https://tally.so/r/Gxp0Lp' },
      { href: '/points', label: '포인트 적립', icon: HandCoins },
    ],
  },
  {
    title: '고객 관리',
    icon: Users,
    items: [
      { href: '/customers', label: '고객 리스트', icon: Users },
      { href: '/feedback', label: '고객 피드백', icon: MessageSquare },
    ],
  },
  {
    title: '마케팅',
    icon: Send,
    items: [
      { href: '/naver-review', label: '네이버 리뷰 요청', icon: NaverIcon, isCustomIcon: true },
      { href: '/messages', label: '리타겟', icon: MessageSquareMore },
      { href: '/local-customers', label: '신규 고객 타겟', icon: UserPlus },
    ],
  },
];

// 하단 독립 메뉴
const bottomNavItems: NavItem[] = [
  { href: '/message-history', label: '발송 내역', icon: History },
  { href: '/billing', label: '충전 관리', icon: CreditCard },
  { href: '/settings', label: '설정', icon: Settings },
];

// PWA 설치 프롬프트 훅
function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(isInStandaloneMode);
    };
    checkStandalone();

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        alert('Safari에서는 공유 버튼(□↑)을 누르고 "홈 화면에 추가"를 선택해주세요.');
      } else {
        alert('브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 선택해주세요.');
      }
    }
  };

  return { canInstall: !isStandalone, handleInstall };
}

// 준비중 모달 컴포넌트
function ComingSoonModal({
  isOpen,
  onClose,
  link
}: {
  isOpen: boolean;
  onClose: () => void;
  link?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 w-[360px] max-w-[90vw] mx-4 shadow-xl">
        <h3 className="text-xl font-semibold text-neutral-900 mb-3">준비중입니다</h3>
        <p className="text-neutral-600 text-sm mb-6 leading-relaxed">
          웨이팅 기능은 현재 준비중입니다.<br/>
          사전 신청하시면 오픈 시 알려드립니다.
        </p>
        <div className="flex gap-3">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-brand-600 text-white py-3 px-4 rounded-lg text-center text-sm font-medium hover:bg-brand-700 whitespace-nowrap"
          >
            사전 신청하기
          </a>
          <button
            onClick={onClose}
            className="flex-1 bg-neutral-100 text-neutral-700 py-3 px-4 rounded-lg text-sm font-medium hover:bg-neutral-200 whitespace-nowrap"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { canInstall, handleInstall } = useInstallPrompt();
  const [comingSoonModal, setComingSoonModal] = useState<{ open: boolean; link?: string }>({ open: false });
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const isActive = (href: string) => {
    if (href.startsWith('http') || href.startsWith('#')) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  // 그룹 내 아이템 중 하나라도 활성화되어 있는지 확인
  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => isActive(item.href));
  };

  // 현재 경로에 따라 활성화된 그룹 자동 확장
  useEffect(() => {
    const activeGroups = navGroups
      .filter(group => isGroupActive(group))
      .map(group => group.title);
    setExpandedGroups(activeGroups);
  }, [pathname]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev =>
      prev.includes(title)
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isExternal) {
      e.preventDefault();
      window.open(item.href, '_blank');
    } else if (item.isComingSoon) {
      e.preventDefault();
      setComingSoonModal({ open: true, link: item.comingSoonLink });
    }
  };

  const renderNavItem = (item: NavItem, isSubItem = false) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href + item.label}
        href={item.isExternal || item.isComingSoon ? '#' : item.href}
        onClick={(e) => handleNavClick(e, item)}
        className={cn(
          'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-800'
            : 'text-slate-800 hover:text-slate-900 hover:bg-slate-50',
          isCollapsed && 'justify-center',
          isSubItem && !isCollapsed && 'ml-4'
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <div className="relative flex-shrink-0">
          <Icon className={cn('w-5 h-5', active && 'text-brand-800')} />
          {isCollapsed && item.isNew && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-[8px] font-bold leading-none">N</span>
            </span>
          )}
        </div>
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.isNew && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                NEW
              </span>
            )}
            {item.isExternal && (
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
            )}
          </>
        )}
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    const GroupIcon = group.icon;
    const isExpanded = expandedGroups.includes(group.title);
    const groupActive = isGroupActive(group);
    const hasNewItem = group.items.some(item => item.isNew);

    // 접힌 상태에서는 그룹의 첫 번째 아이템만 표시
    if (isCollapsed) {
      return (
        <div key={group.title} className="mb-1">
          {group.items.map(item => renderNavItem(item))}
        </div>
      );
    }

    return (
      <div key={group.title} className="mb-1">
        {/* 그룹 헤더 (드롭다운 토글) */}
        <button
          onClick={() => toggleGroup(group.title)}
          className={cn(
            'flex items-center gap-3 w-full mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            groupActive
              ? 'bg-brand-50 text-brand-800'
              : 'text-slate-800 hover:text-slate-900 hover:bg-slate-50'
          )}
          style={{ width: 'calc(100% - 16px)' }}
        >
          <GroupIcon className={cn('w-5 h-5 flex-shrink-0', groupActive && 'text-brand-800')} />
          <span className="flex-1 text-left">{group.title}</span>
          {hasNewItem && !isExpanded && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              NEW
            </span>
          )}
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* 드롭다운 아이템들 */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="py-1 ml-2 pl-3 border-l border-slate-200 space-y-1">
            {group.items.map(item => renderNavItem(item, true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-white border-r border-neutral-200 sticky top-0 transition-all duration-300',
          isCollapsed ? 'w-20' : 'w-64'
        )}
        style={{ zoom: 0.9, height: '111.11vh' }}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-16 px-4 border-b border-slate-200",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          {!isCollapsed && (
            <Link href="/home" className="flex items-center gap-2 overflow-hidden">
              <Image
                src="/Taghere-logo.png"
                alt="태그히어 CRM"
                width={140}
                height={40}
                className="h-8 w-auto flex-shrink-0"
              />
              <span className="text-lg font-semibold text-neutral-900 whitespace-nowrap">
                Taghere CRM
              </span>
            </Link>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-md transition-colors"
            title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {isCollapsed ? (
              <PanelLeft className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* 상단 홈 메뉴 */}
          {topNavItems.map(item => renderNavItem(item))}

          {/* 구분선 */}
          <div className="mx-4 my-3 border-t border-slate-200" />

          {/* 그룹화된 메뉴 (드롭다운) */}
          {navGroups.map(group => renderNavGroup(group))}

          {/* 구분선 */}
          <div className="mx-4 my-3 border-t border-slate-200" />

          {/* 하단 메뉴 */}
          {bottomNavItems.map(item => renderNavItem(item))}
        </nav>

        {/* 앱 설치 버튼 */}
        {canInstall && (
          <div className="p-2 border-t border-neutral-200">
            <button
              onClick={handleInstall}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                'text-brand-700 hover:bg-brand-50',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? '앱 설치' : undefined}
            >
              <Download className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>앱 설치</span>}
            </button>
          </div>
        )}
      </aside>

      {/* 준비중 모달 */}
      <ComingSoonModal
        isOpen={comingSoonModal.open}
        onClose={() => setComingSoonModal({ open: false })}
        link={comingSoonModal.link}
      />
    </>
  );
}

// Mobile Header with Hamburger Menu
export function MobileHeader() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { canInstall, handleInstall } = useInstallPrompt();
  const [comingSoonModal, setComingSoonModal] = useState<{ open: boolean; link?: string }>({ open: false });
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const isActive = (href: string) => {
    if (href.startsWith('http') || href.startsWith('#')) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  // 그룹 내 아이템 중 하나라도 활성화되어 있는지 확인
  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => isActive(item.href));
  };

  // 현재 경로에 따라 활성화된 그룹 자동 확장
  useEffect(() => {
    const activeGroups = navGroups
      .filter(group => isGroupActive(group))
      .map(group => group.title);
    setExpandedGroups(activeGroups);
  }, [pathname]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev =>
      prev.includes(title)
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isExternal) {
      e.preventDefault();
      window.open(item.href, '_blank');
      closeMobileMenu();
    } else if (item.isComingSoon) {
      e.preventDefault();
      setComingSoonModal({ open: true, link: item.comingSoonLink });
      closeMobileMenu();
    } else {
      closeMobileMenu();
    }
  };

  const renderMobileNavItem = (item: NavItem, isSubItem = false) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href + item.label}
        href={item.isExternal || item.isComingSoon ? '#' : item.href}
        onClick={(e) => handleNavClick(e, item)}
        className={cn(
          'flex items-center gap-3 mx-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
          active
            ? 'bg-brand-50 text-brand-800'
            : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50',
          isSubItem && 'ml-4'
        )}
      >
        <Icon className={cn('w-5 h-5', active && 'text-brand-800')} />
        <span className="flex-1">{item.label}</span>
        {item.isNew && (
          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            NEW
          </span>
        )}
        {item.isExternal && (
          <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
        )}
      </Link>
    );
  };

  const renderMobileNavGroup = (group: NavGroup) => {
    const GroupIcon = group.icon;
    const isExpanded = expandedGroups.includes(group.title);
    const groupActive = isGroupActive(group);
    const hasNewItem = group.items.some(item => item.isNew);

    return (
      <div key={group.title} className="mb-1">
        {/* 그룹 헤더 (드롭다운 토글) */}
        <button
          onClick={() => toggleGroup(group.title)}
          className={cn(
            'flex items-center gap-3 w-full mx-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
            groupActive
              ? 'bg-brand-50 text-brand-800'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
          )}
          style={{ width: 'calc(100% - 16px)' }}
        >
          <GroupIcon className={cn('w-5 h-5 flex-shrink-0', groupActive && 'text-brand-800')} />
          <span className="flex-1 text-left">{group.title}</span>
          {hasNewItem && !isExpanded && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              NEW
            </span>
          )}
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* 드롭다운 아이템들 */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="py-1">
            {group.items.map(item => renderMobileNavItem(item, true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 w-full bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/home" className="flex items-center gap-2">
            <Image
              src="/Taghere-logo.png"
              alt="태그히어 CRM"
              width={120}
              height={32}
              className="h-7 w-auto"
            />
          </Link>

          <button
            className="p-2 text-neutral-600 hover:text-neutral-900"
            onClick={toggleMobileMenu}
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
        className={cn(
          'fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <Link href="/home" className="flex items-center gap-2" onClick={closeMobileMenu}>
            <Image
              src="/Taghere-logo.png"
              alt="태그히어 CRM"
              width={120}
              height={32}
              className="h-7 w-auto"
            />
          </Link>
          <button
            className="p-2 text-neutral-600 hover:text-neutral-900"
            onClick={closeMobileMenu}
            aria-label="메뉴 닫기"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Navigation Links */}
        <nav className="py-4">
          {/* 상단 홈 메뉴 */}
          {topNavItems.map(item => renderMobileNavItem(item))}

          {/* 구분선 */}
          <div className="mx-4 my-3 border-t border-neutral-200" />

          {/* 그룹화된 메뉴 (드롭다운) */}
          {navGroups.map(group => renderMobileNavGroup(group))}

          {/* 구분선 */}
          <div className="mx-4 my-3 border-t border-neutral-200" />

          {/* 하단 메뉴 */}
          {bottomNavItems.map(item => renderMobileNavItem(item))}

          {/* 앱 설치 버튼 */}
          {canInstall && (
            <button
              onClick={() => {
                handleInstall();
                closeMobileMenu();
              }}
              className="flex items-center gap-3 mx-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors text-brand-700 hover:bg-brand-50 mt-2 border-t border-neutral-100 pt-5"
            >
              <Download className="w-5 h-5" />
              <span>앱 설치</span>
            </button>
          )}
        </nav>
      </div>

      {/* 준비중 모달 */}
      <ComingSoonModal
        isOpen={comingSoonModal.open}
        onClose={() => setComingSoonModal({ open: false })}
        link={comingSoonModal.link}
      />
    </>
  );
}
