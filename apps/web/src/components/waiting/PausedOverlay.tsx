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
  storeLogo,
  totalWaiting = 0,
  pauseMessage,
  onCheckWaiting,
  className,
}: PausedOverlayProps) {
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
        <div className="flex items-center justify-center gap-3 mb-12">
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
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
          웨이팅이 잠시 정지되었어요
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-neutral-400 mb-12">
          {pauseMessage || '잠시만 기다려주세요'}
        </p>

        {/* Waiting Stats */}
        <div className="flex justify-center gap-16 mb-12">
          <div className="text-center">
            <p className="text-neutral-400 text-lg mb-2">현재 웨이팅</p>
            <p className="text-4xl font-bold text-[#FCD535]">{totalWaiting}팀</p>
          </div>
          <div className="text-center">
            <p className="text-neutral-400 text-lg mb-2">예상 시간</p>
            <p className="text-4xl font-bold text-white">?분</p>
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
