'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Users, Settings, Info } from 'lucide-react';

type TabletMode = 'register' | 'manage';

interface TabletModeSelectorProps {
  onSelectMode: (mode: TabletMode) => void;
  className?: string;
}

export function TabletModeSelector({
  onSelectMode,
  className,
}: TabletModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<TabletMode>('register');

  const handleConfirm = () => {
    // Save to localStorage
    localStorage.setItem('tabletMode', selectedMode);
    onSelectMode(selectedMode);
  };

  return (
    <div
      className={cn(
        'min-h-screen bg-neutral-100 flex items-center justify-center p-8',
        className
      )}
    >
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">
            웨이팅 모드 선택
          </h1>
          <p className="text-neutral-600 text-lg">
            운영하고자 하는 모드를 선택해주세요.
          </p>
          <p className="text-neutral-500 text-sm mt-1">
            로그인 시 선택한 모드로 자동 실행됩니다.
          </p>
        </div>

        {/* Mode Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Register Mode */}
          <button
            type="button"
            onClick={() => setSelectedMode('register')}
            className={cn(
              'bg-white rounded-2xl p-6 text-left transition-all shadow-sm',
              'border-2',
              selectedMode === 'register'
                ? 'border-brand-800 shadow-lg'
                : 'border-transparent hover:border-neutral-200'
            )}
          >
            {/* Preview Image Placeholder */}
            <div className="aspect-video bg-neutral-100 rounded-lg mb-4 flex items-center justify-center">
              <div className="text-center text-neutral-400">
                <Users className="w-12 h-12 mx-auto mb-2" />
                <span className="text-sm">등록 화면 미리보기</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  selectedMode === 'register'
                    ? 'border-brand-800'
                    : 'border-neutral-300'
                )}
              >
                {selectedMode === 'register' && (
                  <div className="w-2.5 h-2.5 bg-brand-800 rounded-full" />
                )}
              </div>
              <h3 className="text-xl font-bold text-neutral-900">등록 모드</h3>
            </div>
            <p className="text-neutral-600 pl-8">
              고객이 웨이팅을 등록하기 위한 모드
            </p>
          </button>

          {/* Manage Mode */}
          <button
            type="button"
            onClick={() => setSelectedMode('manage')}
            className={cn(
              'bg-white rounded-2xl p-6 text-left transition-all shadow-sm',
              'border-2',
              selectedMode === 'manage'
                ? 'border-brand-800 shadow-lg'
                : 'border-transparent hover:border-neutral-200'
            )}
          >
            {/* Preview Image Placeholder */}
            <div className="aspect-video bg-neutral-100 rounded-lg mb-4 flex items-center justify-center">
              <div className="text-center text-neutral-400">
                <Settings className="w-12 h-12 mx-auto mb-2" />
                <span className="text-sm">관리 화면 미리보기</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  selectedMode === 'manage'
                    ? 'border-brand-800'
                    : 'border-neutral-300'
                )}
              >
                {selectedMode === 'manage' && (
                  <div className="w-2.5 h-2.5 bg-brand-800 rounded-full" />
                )}
              </div>
              <h3 className="text-xl font-bold text-neutral-900">관리 모드</h3>
            </div>
            <p className="text-neutral-600 pl-8">
              고객을 호출하고 관리하기 위한 모드
            </p>
          </button>
        </div>

        {/* Info Note */}
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 mb-8">
          <Info className="w-4 h-4" />
          <span>선택한 모드는 설정에서 언제든 변경할 수 있습니다.</span>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-4">
          <Button
            onClick={handleConfirm}
            size="xl"
            className="min-w-[240px]"
          >
            선택한 모드로 시작하기
          </Button>
        </div>
      </div>
    </div>
  );
}
