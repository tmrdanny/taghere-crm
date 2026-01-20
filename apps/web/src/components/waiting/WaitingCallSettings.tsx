'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { WaitingSetting } from './types';

interface WaitingCallSettingsProps {
  settings: Partial<WaitingSetting>;
  onChange: (key: keyof WaitingSetting, value: any) => void;
  errors?: Record<string, string>;
}

export function WaitingCallSettings({
  settings,
  onChange,
  errors = {},
}: WaitingCallSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Call Settings */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">호출 설정</h3>
        <Card className="p-4 space-y-4">
          {/* Call Timeout Minutes */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                호출 후 대기 시간
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                호출 후 이 시간 내에 착석하지 않으면 알림이 표시됩니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={settings.callTimeoutMinutes || 3}
                onChange={(e) => onChange('callTimeoutMinutes', parseInt(e.target.value))}
                className="w-20 h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
              >
                {[1, 2, 3, 4, 5, 7, 10].map((min) => (
                  <option key={min} value={min}>
                    {min}
                  </option>
                ))}
              </select>
              <span className="text-neutral-600">분</span>
            </div>
          </div>

          {/* Max Call Count */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                최대 호출 횟수
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                최초 호출 포함 최대 호출 가능 횟수입니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={settings.maxCallCount || 2}
                onChange={(e) => onChange('maxCallCount', parseInt(e.target.value))}
                className="w-20 h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
              <span className="text-neutral-600">회</span>
            </div>
          </div>

          {/* Auto Cancel */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                자동 취소
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                최대 호출 횟수 초과 시 자동으로 노쇼 처리됩니다.
              </p>
            </div>
            <Switch
              checked={settings.autoCancel ?? true}
              onCheckedChange={(checked) => onChange('autoCancel', checked)}
            />
          </div>
        </Card>
      </div>

      {/* Other Settings */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">기타 설정</h3>
        <Card className="p-4 space-y-4">
          {/* Max Waiting Count */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                최대 대기 팀 수
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                이 수를 초과하면 새 웨이팅 등록이 제한됩니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={500}
                value={settings.maxWaitingCount || 50}
                onChange={(e) => onChange('maxWaitingCount', parseInt(e.target.value) || 50)}
                className="w-24"
              />
              <span className="text-neutral-600">팀</span>
            </div>
            {errors.maxWaitingCount && (
              <p className="text-xs text-error">{errors.maxWaitingCount}</p>
            )}
          </div>

          {/* Show Estimated Time */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                예상 시간 노출
              </label>
              <p className="text-xs text-neutral-500 mt-0.5">
                고객에게 예상 대기 시간을 표시합니다.
              </p>
            </div>
            <Switch
              checked={settings.showEstimatedTime ?? true}
              onCheckedChange={(checked) => onChange('showEstimatedTime', checked)}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
