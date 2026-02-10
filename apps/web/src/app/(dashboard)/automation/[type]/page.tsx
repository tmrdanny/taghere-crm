'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import {
  ArrowLeft,
  Clock,
  Gift,
  Users,
  Check,
  Cake,
  Bell,
  Heart,
  HandMetal,
  Star,
  Moon,
  Calendar,
} from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AutomationRule {
  id: string;
  type: string;
  enabled: boolean;
  triggerConfig: any;
  couponEnabled: boolean;
  couponContent: string | null;
  couponDiscountType: string | null;
  couponDiscountValue: number | null;
  couponValidDays: number;
  messageTemplate: string | null;
  cooldownDays: number;
  monthlyMaxSends: number | null;
  sendTimeHour: number;
}

interface PreviewData {
  totalEligible: number;
  thisMonthEstimate?: number;
  currentChurnRisk?: number;
  estimatedMonthlyCost: number;
}

interface LogEntry {
  id: string;
  sentAt: string;
  couponCode: string | null;
  couponUsed: boolean;
  couponUsedAt: string | null;
  resultAmount: number | null;
  customer: {
    name: string | null;
    phone: string | null;
  };
}

const SCENARIO_META: Record<string, { label: string; icon: any }> = {
  BIRTHDAY: { label: '생일 축하', icon: Cake },
  CHURN_PREVENTION: { label: '이탈 방지', icon: Bell },
  ANNIVERSARY: { label: '가입 기념일', icon: Heart },
  FIRST_VISIT_FOLLOWUP: { label: '첫 방문 팔로업', icon: HandMetal },
  VIP_MILESTONE: { label: 'VIP 마일스톤', icon: Star },
  WINBACK: { label: '장기 미방문 윈백', icon: Moon },
  SLOW_DAY: { label: '비수기 프로모션', icon: Calendar },
};

export default function AutomationSettingPage() {
  const router = useRouter();
  const params = useParams();
  const type = params.type as string;
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 폼 상태
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(3);
  const [daysInactive, setDaysInactive] = useState(30);
  const [daysAfterFirstVisit, setDaysAfterFirstVisit] = useState(3);
  const [milestones, setMilestones] = useState('10, 20, 30, 50, 100');
  const [winbackDaysInactive, setWinbackDaysInactive] = useState(90);
  const [slowDays, setSlowDays] = useState<number[]>([1, 2]);
  const [sendTimeHour, setSendTimeHour] = useState(10);
  const [couponEnabled, setCouponEnabled] = useState(true);
  const [couponContent, setCouponContent] = useState('');
  const [couponValidDays, setCouponValidDays] = useState(14);

  const meta = SCENARIO_META[type];

  useEffect(() => {
    if (!meta) {
      router.push('/automation');
      return;
    }
    fetchData();
  }, [type]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rulesRes, previewRes, logsRes] = await Promise.all([
        fetch(`${apiUrl}/api/automation/rules`, { headers }),
        fetch(`${apiUrl}/api/automation/preview/${type}`, { headers }),
        fetch(`${apiUrl}/api/automation/rules/${type}/logs?limit=10`, { headers }),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        const r = data.rules.find((r: AutomationRule) => r.type === type);
        if (r) {
          setRule(r);
          setEnabled(r.enabled);
          setCouponEnabled(r.couponEnabled);
          setCouponContent(r.couponContent || '');
          setCouponValidDays(r.couponValidDays);
          setSendTimeHour(r.sendTimeHour);
          if (type === 'BIRTHDAY' && r.triggerConfig?.daysBefore) {
            setDaysBefore(r.triggerConfig.daysBefore);
          }
          if (type === 'CHURN_PREVENTION' && r.triggerConfig?.daysInactive) {
            setDaysInactive(r.triggerConfig.daysInactive);
          }
          if (type === 'ANNIVERSARY' && r.triggerConfig?.daysBefore) {
            setDaysBefore(r.triggerConfig.daysBefore);
          }
          if (type === 'FIRST_VISIT_FOLLOWUP' && r.triggerConfig?.daysAfterFirstVisit) {
            setDaysAfterFirstVisit(r.triggerConfig.daysAfterFirstVisit);
          }
          if (type === 'VIP_MILESTONE' && r.triggerConfig?.milestones) {
            setMilestones(r.triggerConfig.milestones.join(', '));
          }
          if (type === 'WINBACK' && r.triggerConfig?.daysInactive) {
            setWinbackDaysInactive(r.triggerConfig.daysInactive);
          }
          if (type === 'SLOW_DAY' && r.triggerConfig?.slowDays) {
            setSlowDays(r.triggerConfig.slowDays);
          }
        }
      }

      if (previewRes.ok) {
        setPreview(await previewRes.json());
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch automation setting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');

      const triggerConfigMap: Record<string, object> = {
        BIRTHDAY: { daysBefore },
        CHURN_PREVENTION: { daysInactive },
        ANNIVERSARY: { daysBefore },
        FIRST_VISIT_FOLLOWUP: { daysAfterFirstVisit },
        VIP_MILESTONE: { milestones: milestones.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n > 0) },
        WINBACK: { daysInactive: winbackDaysInactive },
        SLOW_DAY: { slowDays },
      };
      const triggerConfig = triggerConfigMap[type] || {};

      const res = await fetch(`${apiUrl}/api/automation/rules/${type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled,
          triggerConfig,
          couponEnabled,
          couponContent: couponContent.trim() || null,
          couponValidDays,
          sendTimeHour,
        }),
      });

      if (res.ok) {
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save automation setting:', error);
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!meta) return null;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  const Icon = meta.icon;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* 헤더 */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/automation')}
          className="flex items-center gap-1 text-neutral-500 hover:text-neutral-700 text-sm mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          자동 마케팅
        </button>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            enabled ? 'bg-brand-100 text-brand-700' : 'bg-neutral-100 text-neutral-500'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-neutral-900">
              {meta.label} 설정
            </h1>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* 발송 조건 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">발송 조건</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {type === 'BIRTHDAY' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">생일</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일 전</span>
                </div>
              </div>
            )}

            {type === 'CHURN_PREVENTION' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  미방문 기간
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">마지막 방문 후</span>
                  <Input
                    type="number"
                    min={7}
                    max={180}
                    value={daysInactive}
                    onChange={(e) => setDaysInactive(parseInt(e.target.value) || 30)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일 이상 미방문 시</span>
                </div>
              </div>
            )}

            {type === 'ANNIVERSARY' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">가입 기념일</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일 전</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">고객의 첫 등록일을 기준으로 매년 기념일 쿠폰을 보냅니다</p>
              </div>
            )}

            {type === 'FIRST_VISIT_FOLLOWUP' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">첫 방문</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysAfterFirstVisit}
                    onChange={(e) => setDaysAfterFirstVisit(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일 후</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">첫 방문 고객에게 감사 메시지와 재방문 쿠폰을 보냅니다</p>
              </div>
            )}

            {type === 'VIP_MILESTONE' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  마일스톤 설정
                </label>
                <Input
                  value={milestones}
                  onChange={(e) => setMilestones(e.target.value)}
                  placeholder="10, 20, 30, 50, 100"
                />
                <p className="text-xs text-neutral-400 mt-1">방문 횟수가 해당 숫자에 도달하면 감사 쿠폰을 발송합니다 (쉼표로 구분)</p>
              </div>
            )}

            {type === 'WINBACK' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  미방문 기간
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">마지막 방문 후</span>
                  <Input
                    type="number"
                    min={60}
                    max={365}
                    value={winbackDaysInactive}
                    onChange={(e) => setWinbackDaysInactive(parseInt(e.target.value) || 90)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일 이상 미방문 시</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">이탈 방지보다 긴 기간 미방문 고객에게 특별 할인을 보냅니다</p>
              </div>
            )}

            {type === 'SLOW_DAY' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  비수기 요일
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSlowDays((prev) =>
                          prev.includes(idx)
                            ? prev.filter((d) => d !== idx)
                            : [...prev, idx].sort()
                        );
                      }}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        slowDays.includes(idx)
                          ? 'bg-brand-500 text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 mt-1">선택한 요일에 방문 이력 있는 고객에게 프로모션을 발송합니다</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                발송 시각
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">매일 오전/오후</span>
                <select
                  value={sendTimeHour}
                  onChange={(e) => setSendTimeHour(parseInt(e.target.value))}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i < 12 ? `오전 ${i === 0 ? 12 : i}시` : `오후 ${i === 12 ? 12 : i - 12}시`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 쿠폰 설정 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">쿠폰 내용</CardTitle>
              </div>
              <Switch
                checked={couponEnabled}
                onCheckedChange={setCouponEnabled}
              />
            </div>
          </CardHeader>
          {couponEnabled && (
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  쿠폰 내용
                </label>
                <Input
                  value={couponContent}
                  onChange={(e) => setCouponContent(e.target.value)}
                  placeholder={
                    type === 'BIRTHDAY' ? '생일 축하 10% 할인' :
                    type === 'ANNIVERSARY' ? '가입 기념일 축하 10% 할인' :
                    type === 'FIRST_VISIT_FOLLOWUP' ? '첫 방문 감사 10% 할인' :
                    type === 'VIP_MILESTONE' ? 'VIP 감사 특별 할인' :
                    type === 'WINBACK' ? '다시 만나고 싶어요! 20% 할인' :
                    type === 'SLOW_DAY' ? '오늘만의 특별 할인 10%' :
                    '재방문 감사 10% 할인'
                  }
                  maxLength={50}
                />
                <p className="text-xs text-neutral-400 mt-1">
                  고객에게 표시되는 쿠폰 혜택 내용입니다
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  유효기간
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={couponValidDays}
                    onChange={(e) => setCouponValidDays(parseInt(e.target.value) || 14)}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-neutral-600">일</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 대상 미리보기 */}
        {preview && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">현재 대상 미리보기</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <div className="text-sm text-neutral-500">
                    {type === 'BIRTHDAY' ? '생일 정보가 있는 고객' :
                     type === 'CHURN_PREVENTION' ? '재방문 가능 고객' :
                     type === 'ANNIVERSARY' ? '등록 고객' :
                     type === 'FIRST_VISIT_FOLLOWUP' ? '첫 방문 고객' :
                     type === 'VIP_MILESTONE' ? 'VIP 후보 고객' :
                     type === 'WINBACK' ? '장기 미방문 고객' :
                     '프로모션 대상 고객'}
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1">
                    {preview.totalEligible}명
                  </div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <div className="text-sm text-neutral-500">
                    {(type === 'CHURN_PREVENTION' || type === 'WINBACK') ? '현재 대상' : '이번 달 예상 발송'}
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1">
                    ~{(type === 'CHURN_PREVENTION' || type === 'WINBACK')
                      ? preview.currentChurnRisk
                      : preview.thisMonthEstimate}건
                  </div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-3">
                예상 비용: ~{preview.estimatedMonthlyCost.toLocaleString()}원/월 (무료 크레딧 적용 전)
              </p>
            </CardContent>
          </Card>
        )}

        {/* 최근 발송 이력 */}
        {logs.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">최근 발송 이력</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 text-sm py-2 border-b border-neutral-100 last:border-0"
                  >
                    <span className="text-neutral-400 w-16 flex-shrink-0">
                      {new Date(log.sentAt).toLocaleDateString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-neutral-700 flex-1 truncate">
                      {log.customer.name
                        ? `${log.customer.name.charAt(0)}${'O'.repeat(log.customer.name.length - 1)}`
                        : '고객'}
                    </span>
                    <span className="text-neutral-500 flex-shrink-0">
                      쿠폰 발송
                    </span>
                    {log.couponUsed ? (
                      <span className="flex items-center gap-1 text-green-600 flex-shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        사용
                        {log.resultAmount && (
                          <span className="text-neutral-500">
                            ({log.resultAmount.toLocaleString()}원)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-neutral-400 flex-shrink-0">미사용</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 저장 버튼 */}
        <div className="flex justify-end pt-2 pb-8">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="px-8"
          >
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
