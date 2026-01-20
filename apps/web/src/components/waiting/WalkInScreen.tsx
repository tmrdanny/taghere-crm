'use client';

import { cn } from '@/lib/utils';

interface WalkInScreenProps {
  storeName?: string;
  className?: string;
}

export function WalkInScreen({ storeName, className }: WalkInScreenProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center',
        'bg-gradient-to-br from-orange-400 to-orange-500',
        className
      )}
    >
      <div className="text-center text-white px-6">
        {storeName && (
          <p className="text-lg md:text-xl font-medium mb-6 opacity-90">
            {storeName}
          </p>
        )}

        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4">
          웨이팅 없이
        </h1>
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-8">
          지금 바로 입장해주세요!
        </h2>

        {/* Smile Icon */}
        <div className="mt-8">
          <svg
            className="w-24 h-24 md:w-32 md:h-32 mx-auto text-white/90"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6c.78 2.34 2.72 4 5 4s4.22-1.66 5-4H7zm1-4c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm8 0c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
