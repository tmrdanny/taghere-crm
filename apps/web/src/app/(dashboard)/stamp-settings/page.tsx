'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Stamp, Gift, MessageSquare } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface StampSettings {
  enabled: boolean;
  reward5Description: string | null;
  reward10Description: string | null;
  alimtalkEnabled: boolean;
}

export default function StampSettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [enabled, setEnabled] = useState(true);
  const [reward5Description, setReward5Description] = useState('');
  const [reward10Description, setReward10Description] = useState('');
  const [alimtalkEnabled, setAlimtalkEnabled] = useState(true);

  // Fetch stamp settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/stamp-settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data: StampSettings = await res.json();
          setEnabled(data.enabled);
          setReward5Description(data.reward5Description || '');
          setReward10Description(data.reward10Description || '');
          setAlimtalkEnabled(data.alimtalkEnabled);
        }
      } catch (error) {
        console.error('Failed to fetch stamp settings:', error);
        showToast('설정을 불러오는데 실패했습니다.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [apiUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled,
          reward5Description: reward5Description || null,
          reward10Description: reward10Description || null,
          alimtalkEnabled,
        }),
      });

      if (res.ok) {
        showToast('스탬프 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save stamp settings:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (newEnabled: boolean) => {
    setEnabled(newEnabled);
    // 토글 변경 시 즉시 저장
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiUrl}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: newEnabled,
        }),
      });
      showToast(newEnabled ? '스탬프 기능이 활성화되었습니다.' : '스탬프 기능이 비활성화되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to toggle stamp enabled:', error);
      setEnabled(!newEnabled); // 실패 시 롤백
    }
  };

  const handleToggleAlimtalk = async (newEnabled: boolean) => {
    setAlimtalkEnabled(newEnabled);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiUrl}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          alimtalkEnabled: newEnabled,
        }),
      });
      showToast(newEnabled ? '알림톡 발송이 활성화되었습니다.' : '알림톡 발송이 비활성화되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to toggle alimtalk:', error);
      setAlimtalkEnabled(!newEnabled); // 실패 시 롤백
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">스탬프 설정</h1>
        <p className="text-neutral-500 mt-1">
          스탬프 적립 기능과 보상을 설정합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 스탬프 기능 활성화 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">스탬프 기능</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              스탬프 적립 기능을 켜거나 끕니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">스탬프 적립 활성화</p>
                <p className="text-sm text-neutral-500 mt-1">
                  고객이 매장 방문 시 스탬프를 적립할 수 있습니다. (1일 1회)
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 보상 설정 카드 */}
        <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">보상 설정</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              스탬프 5개, 10개 적립 시 제공할 보상을 설정하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 5개 보상 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-amber-700">5</span>
                </div>
                <label className="text-sm font-medium text-neutral-700">
                  스탬프 5개 보상
                </label>
              </div>
              <Input
                value={reward5Description}
                onChange={(e) => setReward5Description(e.target.value)}
                placeholder="예: 아메리카노 1잔 무료"
                disabled={!enabled}
              />
              <p className="text-xs text-neutral-500">
                고객이 스탬프 5개를 모으면 받을 수 있는 보상을 입력하세요.
              </p>
            </div>

            {/* 10개 보상 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-amber-700">10</span>
                </div>
                <label className="text-sm font-medium text-neutral-700">
                  스탬프 10개 보상
                </label>
              </div>
              <Input
                value={reward10Description}
                onChange={(e) => setReward10Description(e.target.value)}
                placeholder="예: 케이크 세트 무료 (음료 포함)"
                disabled={!enabled}
              />
              <p className="text-xs text-neutral-500">
                고객이 스탬프 10개를 모으면 받을 수 있는 보상을 입력하세요.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={isSaving || !enabled}>
                {isSaving ? '저장 중...' : '보상 저장하기'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 알림톡 설정 카드 */}
        <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">알림톡 설정</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              스탬프 적립 시 고객에게 알림톡을 발송합니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">스탬프 적립 알림톡 발송</p>
                <p className="text-sm text-neutral-500 mt-1">
                  스탬프 적립 시 고객에게 현재 스탬프 수와 보상 정보를 알림톡으로 발송합니다.
                </p>
              </div>
              <Switch
                checked={alimtalkEnabled}
                onCheckedChange={handleToggleAlimtalk}
                disabled={!enabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 사용 안내 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">💡 스탬프 사용 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">1</span>
                </div>
                <p>
                  고객이 NFC 태그나 QR 코드를 스캔하면 <strong>1일 1회</strong> 스탬프가 적립됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">2</span>
                </div>
                <p>
                  스탬프는 <strong>무제한 적립</strong>되며, 고객이 5개 또는 10개를 모으면 보상을 사용할 수 있습니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">3</span>
                </div>
                <p>
                  고객이 보상을 요청하면, <strong>고객 목록</strong>에서 해당 고객을 찾아 &quot;5개 사용&quot; 또는 &quot;10개 사용&quot; 버튼을 눌러주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
