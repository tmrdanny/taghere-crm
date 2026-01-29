'use client';

import { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { WaitingType } from './types';
import { Loader2, Trash2 } from 'lucide-react';

interface WaitingTypeEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: WaitingType | null; // null for new type
  onSave: (data: {
    id?: string;
    name: string;
    avgWaitTimePerTeam: number;
    minPartySize: number;
    maxPartySize: number;
    description: string | null;
    isActive: boolean;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isSaving?: boolean;
  isDeleting?: boolean;
  canDelete?: boolean; // Cannot delete if it's the last active type
}

export function WaitingTypeEditModal({
  open,
  onOpenChange,
  type,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
  canDelete = true,
}: WaitingTypeEditModalProps) {
  const [name, setName] = useState('');
  const [avgWaitTimePerTeam, setAvgWaitTimePerTeam] = useState(5);
  const [minPartySize, setMinPartySize] = useState(0);
  const [maxPartySize, setMaxPartySize] = useState(20);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isNew = !type;

  // Reset form when modal opens/closes or type changes
  useEffect(() => {
    if (open && type) {
      setName(type.name);
      setAvgWaitTimePerTeam(type.avgWaitTimePerTeam);
      setMinPartySize(type.minPartySize ?? 0);
      setMaxPartySize(type.maxPartySize || 20);
      setDescription(type.description || '');
      setIsActive(type.isActive);
      setErrors({});
    } else if (open && !type) {
      setName('');
      setAvgWaitTimePerTeam(5);
      setMinPartySize(0);
      setMaxPartySize(20);
      setDescription('');
      setIsActive(true);
      setErrors({});
    }
  }, [open, type]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = '유형 이름을 입력해주세요.';
    }

    if (avgWaitTimePerTeam < 1 || avgWaitTimePerTeam > 60) {
      newErrors.avgWaitTimePerTeam = '1~60분 사이로 입력해주세요.';
    }

    if (minPartySize < 0 || minPartySize > 100) {
      newErrors.minPartySize = '0~100명 사이로 입력해주세요.';
    }

    if (maxPartySize < 1 || maxPartySize > 100) {
      newErrors.maxPartySize = '1~100명 사이로 입력해주세요.';
    }

    if (minPartySize > 0 && minPartySize > maxPartySize) {
      newErrors.minPartySize = '최소 인원은 최대 인원보다 클 수 없습니다.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    await onSave({
      id: type?.id,
      name: name.trim(),
      avgWaitTimePerTeam,
      minPartySize,
      maxPartySize,
      description: description.trim() || null,
      isActive,
    });
  };

  const handleDelete = async () => {
    if (!type?.id || !onDelete) return;

    if (window.confirm('이 웨이팅 유형을 삭제하시겠습니까?\n삭제된 유형은 복구할 수 없습니다.')) {
      await onDelete(type.id);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>
            {isNew ? '웨이팅 유형 추가' : '웨이팅 유형 편집'}
          </ModalTitle>
        </ModalHeader>

        <div className="space-y-5 py-2">
          {/* Type Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              유형 이름 <span className="text-error">*</span>
            </label>
            <Input
              type="text"
              placeholder="예: 홀 2인석"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-xs text-error">{errors.name}</p>
            )}
          </div>

          {/* Avg Wait Time */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              1팀당 예상 대기 시간 <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                value={avgWaitTimePerTeam}
                onChange={(e) => setAvgWaitTimePerTeam(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-neutral-600">분</span>
            </div>
            {errors.avgWaitTimePerTeam && (
              <p className="text-xs text-error">{errors.avgWaitTimePerTeam}</p>
            )}
          </div>

          {/* Min Party Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              최소 인원 제한
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={minPartySize}
                onChange={(e) => setMinPartySize(parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <span className="text-neutral-600">명</span>
            </div>
            <p className="text-xs text-neutral-500">0이면 제한 없음. 고객이 이 인원 미만으로 선택할 수 없습니다.</p>
            {errors.minPartySize && (
              <p className="text-xs text-error">{errors.minPartySize}</p>
            )}
          </div>

          {/* Max Party Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              최대 인원 제한 <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                value={maxPartySize}
                onChange={(e) => setMaxPartySize(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-neutral-600">명</span>
            </div>
            <p className="text-xs text-neutral-500">고객이 이 인원 이상 선택할 수 없습니다.</p>
            {errors.maxPartySize && (
              <p className="text-xs text-error">{errors.maxPartySize}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              설명 <span className="text-neutral-400">(선택)</span>
            </label>
            <Input
              type="text"
              placeholder="예: 2인 테이블 좌석"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                사용 여부
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                비활성화하면 웨이팅 등록 시 선택 불가
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <ModalFooter className="mt-4">
          {!isNew && onDelete && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={isSaving || isDeleting || !canDelete}
              className="mr-auto text-error hover:text-error hover:border-error"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  삭제
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting}
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
