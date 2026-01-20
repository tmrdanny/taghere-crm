'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WaitingType } from './types';

interface WaitingTypeCardsProps {
  types: WaitingType[];
  stats: {
    typeId: string;
    typeName: string;
    teams: number;
    estimatedMinutes: number;
  }[];
  onAddClick: (typeId: string) => void;
  isLoading?: boolean;
}

export function WaitingTypeCards({
  types,
  stats,
  onAddClick,
  isLoading = false,
}: WaitingTypeCardsProps) {
  const getStatsByTypeId = (typeId: string) => {
    return stats.find((s) => s.typeId === typeId) || {
      teams: 0,
      estimatedMinutes: 0,
    };
  };

  if (!types || !Array.isArray(types) || types.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        <p>웨이팅 유형이 없습니다.</p>
        <p className="text-sm mt-1">설정에서 유형을 추가해주세요.</p>
      </div>
    );
  }

  const activeTypes = types.filter((t) => t.isActive);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {activeTypes.map((type) => {
        const typeStats = getStatsByTypeId(type.id);

        return (
          <Card
            key={type.id}
            className={cn(
              'p-4 border border-neutral-200',
              'hover:border-brand-200 hover:shadow-sm transition-all'
            )}
          >
            <div className="flex flex-col h-full">
              {/* Type Name */}
              <h3 className="font-semibold text-neutral-900 truncate mb-3">
                {type.name}
              </h3>

              {/* Stats */}
              <div className="flex items-center gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1.5 text-neutral-600">
                  <Users className="w-4 h-4" />
                  <span className="font-medium text-neutral-900">
                    {typeStats.teams}팀
                  </span>
                  <span className="text-neutral-400">대기</span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-600">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium text-neutral-900">
                    {typeStats.estimatedMinutes}분
                  </span>
                </div>
              </div>

              {/* Add Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddClick(type.id)}
                disabled={isLoading}
                className="w-full mt-auto"
              >
                <Plus className="w-4 h-4 mr-1" />
                등록
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
