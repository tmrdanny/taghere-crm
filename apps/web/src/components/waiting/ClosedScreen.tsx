'use client';

import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

interface ClosedScreenProps {
  storeName?: string;
  className?: string;
}

export function ClosedScreen({ storeName, className }: ClosedScreenProps) {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'bg-neutral-50 px-6',
        className
      )}
    >
      <div className="text-center max-w-md">
        {/* Lock Icon */}
        <div className="w-20 h-20 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-neutral-500" />
        </div>

        {storeName && (
          <p className="text-lg font-medium text-neutral-700 mb-2">
            {storeName}
          </p>
        )}

        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4">
          오늘 웨이팅이 마감되었습니다
        </h1>

        <p className="text-neutral-500">
          다음 영업일에 방문해주세요
        </p>
      </div>
    </div>
  );
}
