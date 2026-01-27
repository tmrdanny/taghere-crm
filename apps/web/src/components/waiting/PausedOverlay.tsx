'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

interface PausedOverlayProps {
  storeName?: string;
  storeLogo?: string | null;
  totalWaiting?: number;
  pauseMessage?: string | null;
  onCheckWaiting?: () => void;
  className?: string;
}

export function PausedOverlay({
  storeName,
  totalWaiting = 0,
  pauseMessage,
  onCheckWaiting,
  className,
}: PausedOverlayProps) {
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
        <h1 className="text-5xl md:text-6xl lg:text-[80px] xl:text-[100px] font-semibold text-white mb-4 md:mb-6 leading-tight">
          웨이팅이 잠시 정지되었어요
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl lg:text-3xl text-white/60 mb-12 md:mb-16">
          {pauseMessage || '잠시만 기다려주세요'}
        </p>

        {/* Waiting Stats */}
        <div className="flex justify-center gap-16 md:gap-24 mb-12 md:mb-16">
          <div className="text-center">
            <p className="text-white/60 text-lg md:text-xl mb-3">현재 웨이팅</p>
            <p className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#FCD535]">{totalWaiting}팀</p>
          </div>
          <div className="text-center">
            <p className="text-white/60 text-lg md:text-xl mb-3">예상 시간</p>
            <p className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white">?분</p>
          </div>
        </div>

        {/* Action Button */}
        {onCheckWaiting && (
          <button
            onClick={onCheckWaiting}
            className="w-full max-w-md mx-auto h-14 md:h-16 bg-white text-neutral-900 font-medium text-lg md:text-xl rounded-xl hover:bg-neutral-100 transition-colors"
          >
            웨이팅 목록 확인하기
          </button>
        )}
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
