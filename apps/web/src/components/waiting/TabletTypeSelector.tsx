'use client';

import { cn } from '@/lib/utils';
import { Users, Package, ChevronRight, Clock } from 'lucide-react';

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  waitingCount: number;
  estimatedMinutes: number;
}

interface TabletTypeSelectorProps {
  waitingTypes: WaitingType[];
  onSelectType: (typeId: string) => void;
  className?: string;
}

export function TabletTypeSelector({
  waitingTypes,
  onSelectType,
  className,
}: TabletTypeSelectorProps) {
  // Get icon for waiting type based on name
  const getTypeIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('포장') || lowerName.includes('takeout') || lowerName.includes('take out')) {
      return Package;
    }
    return Users;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <h2 className="text-2xl font-bold text-neutral-900 text-center mb-6">
        웨이팅 유형을 선택해주세요
      </h2>

      <div className="space-y-3">
        {waitingTypes.map((type) => {
          const Icon = getTypeIcon(type.name);
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelectType(type.id)}
              className={cn(
                'w-full bg-white rounded-xl p-5 text-left transition-all',
                'border-2 border-neutral-200 hover:border-brand-800 hover:shadow-lg',
                'flex items-center justify-between gap-4',
                'min-h-[80px]'
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-brand-800" />
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-900">{type.name}</p>
                  {type.description && (
                    <p className="text-sm text-neutral-500">{type.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-neutral-600 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{type.waitingCount}팀</span>
                  </div>
                  <div className="flex items-center gap-1 text-neutral-500 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{type.estimatedMinutes}분</span>
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-neutral-400" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
