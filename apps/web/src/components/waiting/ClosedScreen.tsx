'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ClosedScreenProps {
  storeName?: string;
  storeLogo?: string | null;
  className?: string;
}

export function ClosedScreen({ storeName, className }: ClosedScreenProps) {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center relative',
        className
      )}
      style={{
        backgroundImage: 'linear-gradient(118.716deg, rgb(29, 32, 34) 0%, rgb(49, 56, 60) 100%)',
      }}
    >
      <div className="text-center px-6 w-full max-w-4xl">
        {/* Store Name Only */}
        {storeName && (
          <p className="text-white/80 text-xl md:text-2xl mb-12">
            {storeName}
          </p>
        )}

        {/* Main Title */}
        <h1 className="text-5xl md:text-6xl lg:text-[80px] xl:text-[100px] font-semibold text-white mb-2 md:mb-4 leading-tight">
          오늘 웨이팅이
        </h1>
        <h1 className="text-5xl md:text-6xl lg:text-[80px] xl:text-[100px] font-semibold text-white mb-8 md:mb-12 leading-tight">
          마감되었습니다
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl lg:text-3xl text-white/60">
          다음 영업일에 방문해주세요
        </p>
      </div>

      {/* TAG HERE Logo - Bottom */}
      <div className="absolute bottom-8 md:bottom-12 left-1/2 -translate-x-1/2">
        <Image
          src="/images/taghere_logo_w.png"
          alt="TAG HERE"
          width={120}
          height={32}
          className="opacity-80"
        />
      </div>
    </div>
  );
}
