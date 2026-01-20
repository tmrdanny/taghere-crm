'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WaitingType } from './types';
import { Plus, GripVertical, Pencil, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaitingTypeManagerProps {
  types: WaitingType[];
  onAdd: () => void;
  onEdit: (type: WaitingType) => void;
  onReorder: (orderedIds: string[]) => void;
  isReordering?: boolean;
}

export function WaitingTypeManager({
  types,
  onAdd,
  onEdit,
  onReorder,
  isReordering = false,
}: WaitingTypeManagerProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedTypes = [...types].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const draggedIndex = sortedTypes.findIndex((t) => t.id === draggedId);
    const targetIndex = sortedTypes.findIndex((t) => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Reorder
    const newOrder = [...sortedTypes];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    const orderedIds = newOrder.map((t) => t.id);
    onReorder(orderedIds);

    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">웨이팅 유형 관리</h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            드래그하여 순서를 변경할 수 있습니다. 최소 1개의 활성 유형이 필요합니다.
          </p>
        </div>
        <Button onClick={onAdd} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          유형 추가
        </Button>
      </div>

      <div className="space-y-2">
        {sortedTypes.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-neutral-500">웨이팅 유형이 없습니다.</p>
            <p className="text-sm text-neutral-400 mt-1">
              + 유형 추가 버튼을 클릭하여 추가해주세요.
            </p>
          </Card>
        ) : (
          sortedTypes.map((type) => (
            <Card
              key={type.id}
              draggable
              onDragStart={(e) => handleDragStart(e, type.id)}
              onDragOver={(e) => handleDragOver(e, type.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, type.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-3 p-4 cursor-move transition-all',
                draggedId === type.id && 'opacity-50',
                dragOverId === type.id && 'border-brand-500 bg-brand-50/50',
                !type.isActive && 'bg-neutral-50'
              )}
            >
              {/* Drag Handle */}
              <div className="flex-shrink-0 text-neutral-400 hover:text-neutral-600">
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Type Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-medium truncate',
                      type.isActive ? 'text-neutral-900' : 'text-neutral-500'
                    )}
                  >
                    {type.name}
                  </span>
                  {!type.isActive && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-neutral-200 text-neutral-600">
                      비활성
                    </span>
                  )}
                </div>
                {type.description && (
                  <p className="text-sm text-neutral-500 truncate mt-0.5">
                    {type.description}
                  </p>
                )}
              </div>

              {/* Avg Wait Time */}
              <div className="flex items-center gap-1.5 text-sm text-neutral-600 flex-shrink-0">
                <Clock className="w-4 h-4" />
                <span>예상 대기: {type.avgWaitTimePerTeam}분/팀</span>
              </div>

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(type)}
                className="flex-shrink-0"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
