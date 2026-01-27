'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface WalkInScreenProps {
  storeName?: string;
  storeLogo?: string | null;
  className?: string;
}

export function WalkInScreen({ storeName, className }: WalkInScreenProps) {
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
          웨이팅 없이
        </h1>
        <h1 className="text-5xl md:text-6xl lg:text-[80px] xl:text-[100px] font-semibold text-white leading-tight">
          지금 바로 입장해주세요!
        </h1>
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
