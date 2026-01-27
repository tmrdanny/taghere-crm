'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface WalkInScreenProps {
  storeName?: string;
  storeLogo?: string | null;
  className?: string;
}

export function WalkInScreen({ storeName, storeLogo, className }: WalkInScreenProps) {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'bg-[#343434]',
        className
      )}
    >
      <div className="text-center px-6 w-full max-w-2xl">
        {/* Store Logo & Name */}
        <div className="flex items-center justify-center gap-3 mb-16">
          {storeLogo ? (
            <img
              src={storeLogo}
              alt={storeName || '매장 로고'}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-[#FCD535] rounded-full flex items-center justify-center">
              <span className="text-black text-lg">🍺</span>
            </div>
          )}
          {storeName && (
            <span className="text-white text-lg font-medium">{storeName}</span>
          )}
        </div>

        {/* Main Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 leading-tight">
          웨이팅 없이
        </h1>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
          지금 바로 입장해주세요!
        </h1>
      </div>

      {/* TAG HERE Logo - Bottom */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <Image
          src="/images/taghere_logo_w.png"
          alt="TAG HERE"
          width={100}
          height={26}
          className="opacity-70"
        />
      </div>
    </div>
  );
}
