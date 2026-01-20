'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Clock, Pause } from 'lucide-react';

interface PausedOverlayProps {
  totalWaiting?: number;
  pauseMessage?: string | null;
  onCheckWaiting?: () => void;
  className?: string;
}

export function PausedOverlay({
  totalWaiting = 0,
  pauseMessage,
  onCheckWaiting,
  className,
}: PausedOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-black/60 backdrop-blur-sm',
        className
      )}
    >
      <div className="bg-white rounded-2xl p-8 md:p-12 max-w-md mx-4 text-center shadow-2xl">
        {/* Pause Icon */}
        <div className="w-16 h-16 md:w-20 md:h-20 bg-warning-light rounded-full flex items-center justify-center mx-auto mb-6">
          <Pause className="w-8 h-8 md:w-10 md:h-10 text-warning" />
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-2">
          웨이팅이 잠시 정지되었어요
        </h2>

        <p className="text-neutral-600 mb-6">
          {pauseMessage || '잠시만 기다려주세요.'}
        </p>

        {/* Waiting Stats */}
        <div className="flex justify-center gap-8 mb-8">
          <div className="text-center">
            <p className="text-sm text-neutral-500 mb-1">현재 웨이팅</p>
            <p className="text-2xl font-bold text-neutral-900">{totalWaiting}팀</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-neutral-500 mb-1">예상 시간</p>
            <p className="text-2xl font-bold text-neutral-400">?분</p>
          </div>
        </div>

        {/* Info Message */}
        <p className="text-sm text-neutral-500 mb-6">
          이전에 등록하셨던 분이라면
        </p>

        {/* Action Button */}
        {onCheckWaiting && (
          <Button
            onClick={onCheckWaiting}
            variant="outline"
            size="lg"
            className="w-full"
          >
            <Clock className="w-5 h-5 mr-2" />
            웨이팅 목록 확인하기
          </Button>
        )}
      </div>
    </div>
  );
}
