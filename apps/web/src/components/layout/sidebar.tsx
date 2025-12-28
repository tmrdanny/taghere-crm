'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  Coins,
  Star,
  CreditCard,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// BeforeInstallPromptEvent 타입 정의
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const navItems = [
  { href: '/home', label: '홈', icon: Home },
  { href: '/customers', label: '고객 리스트', icon: Users },
  { href: '/points', label: '포인트 적립', icon: Coins },
  { href: '/naver-review', label: '네이버 리뷰 요청', icon: Star },
  { href: '/billing', label: '충전 관리', icon: CreditCard },
  { href: '/settings', label: '설정', icon: Settings },
];

// PWA 설치 프롬프트 훅
function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 이미 PWA로 설치되어 실행 중인지 확인
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
      // 브라우저 설치 프롬프트 사용
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      // 프롬프트가 없는 경우 (Safari 등) 안내 메시지
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        alert('Safari에서는 공유 버튼(□↑)을 누르고 "홈 화면에 추가"를 선택해주세요.');
      } else {
        alert('브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 선택해주세요.');
      }
    }
  };

  // 이미 설치된 상태면 버튼 숨김, 아니면 항상 표시
  return { canInstall: !isStandalone, handleInstall };
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { canInstall, handleInstall } = useInstallPrompt();

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col bg-white border-r border-neutral-200 h-screen sticky top-0 transition-all duration-300',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-neutral-200",
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
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-brand-800')} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
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
  );
}

// Mobile Header with Hamburger Menu
export function MobileHeader() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { canInstall, handleInstall } = useInstallPrompt();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
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
          'fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden',
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
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileMenu}
                className={cn(
                  'flex items-center gap-3 mx-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'text-brand-800')} />
                <span>{item.label}</span>
              </Link>
            );
          })}

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
    </>
  );
}
