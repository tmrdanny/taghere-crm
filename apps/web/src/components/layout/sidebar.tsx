'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  MessageSquare,
  MessageSquareMore,
  ExternalLink,
  ChevronDown,
  Store,
  ListOrdered,
  HandCoins,
  Stamp,
  MapPin,
  BarChart3,
  ClipboardList,
  Zap,
  PieChart,
  Clock,
  Rocket,
  MessagesSquare,
  Ticket,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  badge?: string; // 커스텀 뱃지 텍스트
  subItems?: NavItem[]; // 하위 메뉴 지원
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
  badge?: string; // 그룹 헤더 뱃지
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
      // 주문/결제: 메뉴에서 숨김 (외부 링크)
      { href: '/waiting', label: '웨이팅', icon: ListOrdered },
      { href: '/points', label: '포인트 적립', icon: HandCoins },
      { href: '/stamp-settings', label: '스탬프 설정', icon: Stamp },
      // 테이블 채팅: 하단 '관리' 메뉴로 이동
    ],
  },
  {
    title: '고객 관리',
    icon: Users,
    items: [
      { href: '/customers', label: '고객 리스트', icon: Users },
      { href: '/feedback', label: '고객 피드백', icon: MessageSquare },
      { href: '/visit-source', label: '방문 경로', icon: MapPin, isNew: true },
      { href: '/survey', label: '고객 설문', icon: ClipboardList, isNew: true },
    ],
  },
  {
    title: '마케팅',
    icon: Send,
    badge: '30건 무료',
    items: [
      { href: '/automation', label: '자동 마케팅', icon: Zap, badge: '30건 무료' },
      { href: '/messages', label: '메시지 발송', icon: MessageSquareMore },
      { href: '/coupon-links', label: '쿠폰 발행 링크', icon: Ticket, isNew: true },
      { href: '/place-booster', label: '네이버 플레이스 부스터', icon: Rocket, isNew: true },
      // 네이버 리뷰 요청: 메뉴에서 숨김 (페이지는 유지)
    ],
  },
  {
    title: '인사이트',
    icon: BarChart3,
    items: [
      { href: '/insights/customers', label: '고객 통계', icon: Users, isNew: true },
      { href: '/insights/analytics', label: '데이터 분석', icon: BarChart3, isNew: true },
    ],
  },
];

// 매장 버전에 따라 "주문/결제" 링크를 결정
function getOrderPaymentHref(taghereVersion?: string): string {
  return taghereVersion === 'v2'
    ? 'https://hub.tag-here.com/'
    : 'https://admin.tag-here.com';
}

// navGroups 에서 "매장 운영 > 주문/결제" 항목의 href 를 버전에 맞게 치환
// stampEnabled(스탬프 적립 활성화 매장)이면 "포인트 적립" 탭 숨김
function buildNavGroups(taghereVersion?: string, stampEnabled?: boolean): NavGroup[] {
  const orderPaymentHref = getOrderPaymentHref(taghereVersion);
  return navGroups.map((g) =>
    g.title !== '매장 운영'
      ? g
      : {
          ...g,
          items: g.items
            .filter((it) => !(stampEnabled && it.label === '포인트 적립'))
            .map((it) =>
              it.label === '주문/결제' ? { ...it, href: orderPaymentHref } : it
            ),
        }
  );
}

// 하단 독립 메뉴
const bottomNavItems: NavItem[] = [
  { href: '/table-chat', label: '테이블 채팅', icon: MessageSquare, isNew: true },
  { href: '/message-history', label: '발송 내역', icon: History },
  { href: '/wallet-history', label: '사용내역', icon: MessagesSquare },
  // 스토어: 메뉴에서 숨김 (페이지는 유지)
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
  featureName
}: {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm">
      <div className="mx-4 w-[360px] max-w-[90vw] rounded-[20px] bg-white p-7 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
        <h3 className="mb-2 text-[17px] font-bold text-[color:var(--ad-ink)]">준비중입니다</h3>
        <p className="mb-6 text-[13.5px] leading-relaxed text-[color:var(--ad-muted)]">
          {featureName || '해당 기능'}은 현재 준비중입니다.<br/>
          곧 오픈 예정이니 조금만 기다려주세요!
        </p>
        <button
          onClick={onClose}
          className="ad-press h-11 w-full rounded-[10px] bg-[color:var(--ad-ink)] text-[14px] font-semibold text-white hover:bg-[#383c40]"
        >
          확인
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  taghereVersion?: string;
  stampEnabled?: boolean;
}

export function Sidebar({ isCollapsed, onToggleCollapse, taghereVersion, stampEnabled }: SidebarProps) {
  const navGroupsForUser = useMemo(() => buildNavGroups(taghereVersion, stampEnabled), [taghereVersion, stampEnabled]);
  const pathname = usePathname();
  const { canInstall, handleInstall } = useInstallPrompt();
  const [comingSoonModal, setComingSoonModal] = useState<{ open: boolean; featureName?: string }>({ open: false });
  const [accountOpen, setAccountOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);

  // 매장 이름: 레이아웃이 저장해 둔 /api/auth/me 캐시 재사용
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('auth-me-cache');
      if (cached) setStoreName(JSON.parse(cached)?.user?.store?.name || '');
    } catch {
      // 캐시 파싱 실패 시 무시
    }
  }, []);

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
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [visitedPages, setVisitedPages] = useState<string[]>([]);

  // Load visited pages from localStorage and mark current page as visited
  useEffect(() => {
    const stored = localStorage.getItem('visited-new-pages');
    const visited = stored ? JSON.parse(stored) : [];
    setVisitedPages(visited);

    // Mark current page as visited if it has isNew flag
    const allItems = [
      ...topNavItems,
      ...navGroupsForUser.flatMap(g => g.items.flatMap(i => i.subItems ? [i, ...i.subItems] : [i])),
      ...bottomNavItems
    ];
    const currentItem = allItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
    if (currentItem?.isNew && !visited.includes(currentItem.href)) {
      const updated = [...visited, currentItem.href];
      localStorage.setItem('visited-new-pages', JSON.stringify(updated));
      setVisitedPages(updated);
    }
  }, [pathname]);

  const shouldShowNew = (item: NavItem) => {
    return item.isNew && !visitedPages.includes(item.href);
  };

  const isActive = (href: string) => {
    if (href.startsWith('http') || href.startsWith('#')) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  // 그룹 내 아이템 중 하나라도 활성화되어 있는지 확인
  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => {
      if (item.subItems) {
        return item.subItems.some(subItem => isActive(subItem.href));
      }
      return isActive(item.href);
    });
  };

  // 아이템 내 하위 메뉴가 활성화되어 있는지 확인
  const isItemActive = (item: NavItem) => {
    if (item.subItems) {
      return item.subItems.some(subItem => isActive(subItem.href));
    }
    return isActive(item.href);
  };

  // 현재 경로에 따라 활성화된 그룹 자동 확장
  useEffect(() => {
    // 하위 메뉴가 있는 아이템 중 활성화된 것 자동 확장
    const activeItems: string[] = [];
    navGroupsForUser.forEach(group => {
      group.items.forEach(item => {
        if (item.subItems && isItemActive(item)) {
          activeItems.push(item.label);
        }
      });
    });
    setExpandedItems(activeItems);
  }, [pathname]);

  const toggleItem = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isExternal) {
      e.preventDefault();
      window.open(item.href, '_blank');
    } else if (item.isComingSoon) {
      e.preventDefault();
      setComingSoonModal({ open: true, featureName: item.comingSoonLink });
    }
  };

  const renderNavItem = (item: NavItem, isSubItem = false, isNestedSubItem = false) => {
    const active = isActive(item.href);
    const itemActive = isItemActive(item);
    const Icon = item.icon;
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isItemExpanded = expandedItems.includes(item.label);

    // 하위 메뉴가 있는 아이템
    if (hasSubItems && !isCollapsed) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleItem(item.label)}
            className={cn(
              'ad-press flex items-center gap-2.5 w-full mx-2 px-2.5 h-9 rounded-[10px] text-[13px] transition-colors',
              itemActive
                ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
                : 'text-[color:var(--ad-ink-2)] hover:bg-white/60',
              isSubItem && 'ml-4'
            )}
            style={{ width: 'calc(100% - 16px)' }}
          >
            <Icon strokeWidth={1.7} className={cn('w-4 h-4 flex-shrink-0', itemActive ? 'text-[color:var(--ad-navy)]' : 'text-[color:var(--ad-faint)]')} />
            <span className="flex-1 text-left">{item.label}</span>
            {shouldShowNew(item) && !isItemExpanded && (
              <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                NEW
              </span>
            )}
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-[color:var(--ad-faint)] transition-transform duration-200',
                isItemExpanded && 'rotate-180'
              )}
            />
          </button>
          <div
            className={cn(
              'overflow-hidden transition-all duration-200',
              isItemExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="py-1 ml-6 pl-2 border-l border-[color:var(--ad-line)] space-y-1">
              {item.subItems!.map(subItem => renderNavItem(subItem, true, true))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href + item.label}
        href={item.isExternal || item.isComingSoon ? '#' : item.href}
        onClick={(e) => handleNavClick(e, item)}
        className={cn(
          'ad-press relative flex items-center gap-2.5 mx-2 px-2.5 h-9 [@media(max-height:860px)]:h-8 rounded-[10px] text-[13px] transition-colors',
          active
            ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
            : 'text-[color:var(--ad-ink-2)] hover:bg-white/60',
          isCollapsed && 'justify-center',
          isSubItem && !isCollapsed && 'ml-4',
          isNestedSubItem && !isCollapsed && 'ml-2'
        )}
        title={isCollapsed ? item.label : undefined}
      >
        {active && !isCollapsed && !isSubItem && (
          <span className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[color:var(--ad-ink)]" />
        )}
        {/* 2번째 depth부터는 아이콘 숨김 */}
        {!isSubItem && (
          <div className="relative flex-shrink-0">
            <Icon strokeWidth={1.7} className={cn('w-4 h-4', active ? 'text-[color:var(--ad-navy)]' : 'text-[color:var(--ad-faint)]')} />
            {isCollapsed && shouldShowNew(item) && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[color:var(--ad-ink)] rounded-full flex items-center justify-center">
                <span className="text-white text-[8px] font-bold leading-none">N</span>
              </span>
            )}
          </div>
        )}
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                {item.badge}
              </span>
            )}
            {shouldShowNew(item) && (
              <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                NEW
              </span>
            )}
            {item.isExternal && (
              <ExternalLink className="w-3.5 h-3.5 text-[color:var(--ad-faint)]" />
            )}
          </>
        )}
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    // 관리자 사이드바와 동일: 드롭다운 없이 카테고리 제목 + 아이콘 메뉴를 항상 펼쳐 보여준다
    if (isCollapsed) {
      return (
        <div key={group.title} className="mt-3 space-y-px border-t border-[color:var(--ad-line)] pt-3">
          {group.items.map(item => renderNavItem(item))}
        </div>
      );
    }

    return (
      <div key={group.title} className="mt-5 [@media(max-height:860px)]:mt-3">
        <p className="mb-1 flex items-center gap-1.5 px-[18px] text-[11px] font-medium text-[color:var(--ad-faint)]">
          {group.title}
          {group.badge && (
            <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-px text-[10px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
              {group.badge}
            </span>
          )}
        </p>
        <div className="space-y-px">{group.items.map(item => renderNavItem(item))}</div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'ad-side hidden lg:flex flex-col transition-[width] duration-300',
          isCollapsed ? 'w-[76px]' : 'w-[248px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 px-4",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          {!isCollapsed && (
            <Link href="/home" className="flex items-center gap-2 overflow-hidden">
              <Image
                src="/Taghere-logo.png"
                alt="태그히어 CRM"
                width={24}
                height={24}
                className="h-6 w-6 flex-shrink-0"
              />
              <span className="text-[14px] font-semibold tracking-[-0.02em] text-[color:var(--ad-ink)] whitespace-nowrap">
                태그히어 CRM
              </span>
            </Link>
          )}
          <button
            onClick={onToggleCollapse}
            className="ad-press grid h-7 w-7 place-items-center rounded-md text-[color:var(--ad-faint)] hover:bg-white/70 hover:text-[color:var(--ad-ink)]"
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
        {/* 포스기처럼 휠이 없는 환경 대비: 스크롤바를 얇게 보이고, 넘칠 때 아래쪽을 흐리게 표시 */}
        <nav className="ad-scroll flex-1 overflow-y-auto py-2">
          {/* 상단 홈 메뉴 */}
          <div className="space-y-px">{topNavItems.map(item => renderNavItem(item))}</div>

          {/* 카테고리별 메뉴 (항상 펼침) */}
          {navGroupsForUser.map(group => renderNavGroup(group))}

          <div className="pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-[rgba(250,251,252,0.95)] to-transparent" aria-hidden />
        </nav>

        {/* 매장·관리 메뉴 (발송 내역, 사용내역, 충전 관리, 설정, 테이블 채팅, 앱 설치) */}
        <div ref={accountRef} className="relative border-t border-[color:var(--ad-line)] p-2">
          {accountOpen && (
            <div
              className={cn(
                'absolute z-50 w-[232px] rounded-[16px] bg-white p-1.5 shadow-[0_0_0_1px_var(--ad-line),0_18px_40px_-16px_rgba(29,32,34,0.25)]',
                isCollapsed ? 'bottom-2 left-full ml-2' : 'bottom-full left-2 mb-2'
              )}
              role="menu"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[color:var(--ad-faint)]">관리</p>
              {bottomNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={(e) => {
                      handleNavClick(e, item);
                      setAccountOpen(false);
                    }}
                    className={cn(
                      'ad-press flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px]',
                      active ? 'bg-[color:var(--ad-bg)] font-semibold text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
                    )}
                  >
                    <Icon strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
                    <span className="flex-1">{item.label}</span>
                    {shouldShowNew(item) && (
                      <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                        NEW
                      </span>
                    )}
                  </Link>
                );
              })}
              {canInstall && (
                <>
                  <div className="mx-2 my-1 border-t border-[color:var(--ad-line)]" />
                  <button
                    onClick={() => {
                      handleInstall();
                      setAccountOpen(false);
                    }}
                    className="ad-press flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
                  >
                    <Download strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
                    앱 설치
                  </button>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            title={isCollapsed ? '관리 메뉴' : undefined}
            className={cn(
              'ad-press flex h-11 w-full items-center gap-2.5 rounded-[12px] px-2 text-left hover:bg-white/60',
              accountOpen && 'bg-white shadow-[0_0_0_1px_var(--ad-line)]',
              isCollapsed && 'justify-center'
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--ad-bg)] text-[12px] font-semibold text-[color:var(--ad-ink-2)]">
              {(storeName || '매장').slice(0, 1)}
            </span>
            {!isCollapsed && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-medium text-[color:var(--ad-ink)]">{storeName || '내 매장'}</span>
                  <span className="block text-[11.5px] text-[color:var(--ad-faint)]">관리 · 설정</span>
                </span>
                <Settings strokeWidth={1.7} className="h-4 w-4 text-[color:var(--ad-faint)]" />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* 준비중 모달 */}
      <ComingSoonModal
        isOpen={comingSoonModal.open}
        onClose={() => setComingSoonModal({ open: false })}
        featureName={comingSoonModal.featureName}
      />
    </>
  );
}

// Mobile Header with Hamburger Menu
export function MobileHeader({ taghereVersion, stampEnabled }: { taghereVersion?: string; stampEnabled?: boolean }) {
  const pathname = usePathname();
  const navGroupsForUser = useMemo(() => buildNavGroups(taghereVersion, stampEnabled), [taghereVersion, stampEnabled]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { canInstall, handleInstall } = useInstallPrompt();
  const [comingSoonModal, setComingSoonModal] = useState<{ open: boolean; featureName?: string }>({ open: false });
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [visitedPages, setVisitedPages] = useState<string[]>([]);

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
    return group.items.some(item => {
      if (item.subItems) {
        return item.subItems.some(subItem => isActive(subItem.href));
      }
      return isActive(item.href);
    });
  };

  // 아이템 내 하위 메뉴가 활성화되어 있는지 확인
  const isItemActive = (item: NavItem) => {
    if (item.subItems) {
      return item.subItems.some(subItem => isActive(subItem.href));
    }
    return isActive(item.href);
  };

  // Load visited pages from localStorage and mark current page as visited
  useEffect(() => {
    const stored = localStorage.getItem('visited-new-pages');
    const visited = stored ? JSON.parse(stored) : [];
    setVisitedPages(visited);

    // Mark current page as visited if it has isNew flag
    const allItems = [
      ...topNavItems,
      ...navGroupsForUser.flatMap(g => g.items.flatMap(i => i.subItems ? [i, ...i.subItems] : [i])),
      ...bottomNavItems
    ];
    const currentItem = allItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
    if (currentItem?.isNew && !visited.includes(currentItem.href)) {
      const updated = [...visited, currentItem.href];
      localStorage.setItem('visited-new-pages', JSON.stringify(updated));
      setVisitedPages(updated);
    }
  }, [pathname]);

  const shouldShowNew = (item: NavItem) => {
    return item.isNew && !visitedPages.includes(item.href);
  };

  // 현재 경로에 따라 활성화된 그룹 자동 확장
  useEffect(() => {
    // 하위 메뉴가 있는 아이템 중 활성화된 것 자동 확장
    const activeItems: string[] = [];
    navGroupsForUser.forEach(group => {
      group.items.forEach(item => {
        if (item.subItems && isItemActive(item)) {
          activeItems.push(item.label);
        }
      });
    });
    setExpandedItems(activeItems);
  }, [pathname]);

  const toggleItem = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.isExternal) {
      e.preventDefault();
      window.open(item.href, '_blank');
      closeMobileMenu();
    } else if (item.isComingSoon) {
      e.preventDefault();
      setComingSoonModal({ open: true, featureName: item.comingSoonLink });
      closeMobileMenu();
    } else {
      closeMobileMenu();
    }
  };

  const renderMobileNavItem = (item: NavItem, isSubItem = false, isNestedSubItem = false) => {
    const active = isActive(item.href);
    const itemActive = isItemActive(item);
    const Icon = item.icon;
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isItemExpanded = expandedItems.includes(item.label);

    // 하위 메뉴가 있는 아이템
    if (hasSubItems) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleItem(item.label)}
            className={cn(
              'ad-press flex items-center gap-2.5 w-full mx-2 px-2.5 h-10 rounded-[10px] text-[14px] transition-colors',
              itemActive
                ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
                : 'text-[color:var(--ad-ink-2)] hover:bg-white/60',
              isSubItem && 'ml-4'
            )}
            style={{ width: 'calc(100% - 16px)' }}
          >
            <Icon strokeWidth={1.7} className={cn('w-4 h-4 flex-shrink-0', itemActive ? 'text-[color:var(--ad-navy)]' : 'text-[color:var(--ad-faint)]')} />
            <span className="flex-1 text-left">{item.label}</span>
            {shouldShowNew(item) && !isItemExpanded && (
              <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                NEW
              </span>
            )}
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-[color:var(--ad-faint)] transition-transform duration-200',
                isItemExpanded && 'rotate-180'
              )}
            />
          </button>
          <div
            className={cn(
              'overflow-hidden transition-all duration-200',
              isItemExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="py-1 ml-6 pl-2 border-l border-[color:var(--ad-line)] space-y-1">
              {item.subItems!.map(subItem => renderMobileNavItem(subItem, true, true))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href + item.label}
        href={item.isExternal || item.isComingSoon ? '#' : item.href}
        onClick={(e) => handleNavClick(e, item)}
        className={cn(
          'ad-press relative flex items-center gap-2.5 mx-2 px-2.5 h-10 rounded-[10px] text-[14px] transition-colors',
          active
            ? 'bg-white font-semibold text-[color:var(--ad-ink)] shadow-[0_0_0_1px_var(--ad-line)]'
            : 'text-[color:var(--ad-ink-2)] hover:bg-white/60',
          isSubItem && 'ml-4',
          isNestedSubItem && 'ml-2'
        )}
      >
        {/* 2번째 depth부터는 아이콘 숨김 */}
        {!isSubItem && <Icon strokeWidth={1.7} className={cn('w-4 h-4', active ? 'text-[color:var(--ad-navy)]' : 'text-[color:var(--ad-faint)]')} />}
        <span className="flex-1">{item.label}</span>
        {item.badge && (
          <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
            {item.badge}
          </span>
        )}
        {shouldShowNew(item) && (
          <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
            NEW
          </span>
        )}
        {item.isExternal && (
          <ExternalLink className="w-3.5 h-3.5 text-[color:var(--ad-faint)]" />
        )}
      </Link>
    );
  };

  const renderMobileNavGroup = (group: NavGroup) => {
    // 관리자 사이드바와 동일: 드롭다운 없이 카테고리 제목 + 아이콘 메뉴를 항상 펼쳐 보여준다
    return (
      <div key={group.title} className="mt-5">
        <p className="mb-1 flex items-center gap-1.5 px-[18px] text-[11px] font-medium text-[color:var(--ad-faint)]">
          {group.title}
          {group.badge && (
            <span className="rounded-full bg-[color:var(--ad-bg)] px-1.5 py-px text-[10px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line)]">
              {group.badge}
            </span>
          )}
        </p>
        <div className="space-y-px">{group.items.map(item => renderMobileNavItem(item))}</div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="ad-topbar lg:hidden sticky top-0 z-40 w-full">
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
            className="ad-press grid h-9 w-9 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70"
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
          className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.4)] lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Slide-out Menu */}
      <div
        className={cn(
          'ad-side !fixed top-0 left-0 !h-full w-72 z-50 transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-[color:var(--ad-line)]">
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
            className="ad-press grid h-9 w-9 place-items-center rounded-md text-[color:var(--ad-muted)] hover:bg-white/70"
            onClick={closeMobileMenu}
            aria-label="메뉴 닫기"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Navigation Links */}
        <nav className="py-4">
          {/* 상단 홈 메뉴 */}
          <div className="space-y-px">{topNavItems.map(item => renderMobileNavItem(item))}</div>

          {/* 카테고리별 메뉴 (항상 펼침) */}
          {navGroupsForUser.map(group => renderMobileNavGroup(group))}

          {/* 하단 메뉴 */}
          {renderMobileNavGroup({ title: '관리', icon: Settings, items: bottomNavItems })}

          {/* 앱 설치 버튼 */}
          {canInstall && (
            <button
              onClick={() => {
                handleInstall();
                closeMobileMenu();
              }}
              className="ad-press mx-2 mt-2 flex items-center gap-2.5 rounded-[10px] px-2.5 h-10 text-[14px] text-[color:var(--ad-muted)] hover:bg-white/60"
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
        featureName={comingSoonModal.featureName}
      />
    </>
  );
}
