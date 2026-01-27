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
        {/* Store Name */}
        {storeName && (
          <p className="text-white/80 text-lg md:text-xl mb-16">
            {storeName}
          </p>
        )}

        {/* Main Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
          웨이팅이 잠시 정지되었어요
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-neutral-400 mb-12">
          {pauseMessage || '잠시만 기다려주세요'}
        </p>

        {/* Waiting Stats */}
        <div className="flex justify-center gap-16 mb-12">
          <div className="text-center">
            <p className="text-neutral-400 text-base md:text-lg mb-2">현재 웨이팅</p>
            <p className="text-3xl md:text-4xl font-bold text-[#FCD535]">{totalWaiting}팀</p>
          </div>
          <div className="text-center">
            <p className="text-neutral-400 text-base md:text-lg mb-2">예상 시간</p>
            <p className="text-3xl md:text-4xl font-bold text-white">?분</p>
          </div>
        </div>

        {/* Action Button */}
        {onCheckWaiting && (
          <button
            onClick={onCheckWaiting}
            className="w-full max-w-md mx-auto h-14 bg-white text-neutral-900 font-medium text-lg rounded-xl hover:bg-neutral-100 transition-colors"
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
          width={100}
          height={26}
          className="opacity-70"
        />
      </div>
    </div>
  );
}
