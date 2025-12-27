'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/home', label: '홈' },
  { href: '/customers', label: '고객 리스트' },
  { href: '/points', label: '포인트 적립' },
  { href: '/naver-review', label: '네이버 리뷰 요청' },
  { href: '/billing', label: '충전 관리' },
  { href: '/settings', label: '설정' },
];

export function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2">
            <Image
              src="/Taghere-logo.png"
              alt="태그히어 CRM"
              width={140}
              height={40}
              className="h-8 w-auto"
            />
            <span className="text-lg font-semibold text-neutral-900">
              Taghere CRM
            </span>
          </Link>

          {/* Desktop Navigation - Center aligned */}
          <nav className="hidden md:flex items-center justify-center flex-1 h-full">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative px-4 h-full flex items-center text-sm font-medium transition-colors',
                    isActive
                      ? 'text-brand-800'
                      : 'text-neutral-500 hover:text-neutral-900'
                  )}
                >
                  {item.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-800" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Spacer for desktop to balance the layout */}
          <div className="hidden md:block w-[180px]" />

          {/* Mobile Hamburger Button */}
          <button
            className="md:hidden p-2 text-neutral-600 hover:text-neutral-900"
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
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Slide-out Menu */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out md:hidden',
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b">
          <span className="text-lg font-semibold text-neutral-900">메뉴</span>
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
            const isActive = pathname === item.href ||
              pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileMenu}
                className={cn(
                  'block px-6 py-3 text-base font-medium transition-colors',
                  isActive
                    ? 'text-brand-800 bg-brand-50 border-l-4 border-brand-800'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
