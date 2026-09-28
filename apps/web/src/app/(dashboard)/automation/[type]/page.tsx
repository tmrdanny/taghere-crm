'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  ChevronLeft,
  MessageSquare,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';


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
  const [resendingLogId, setResendingLogId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const skipAutoSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [storeName, setStoreName] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');

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

      const [rulesRes, previewRes, logsRes, storeRes] = await Promise.all([
        fetch(`${API_BASE}/api/automation/rules`, { headers }),
        fetch(`${API_BASE}/api/automation/preview/${type}`, { headers }),
        fetch(`${API_BASE}/api/automation/rules/${type}/logs?limit=10`, { headers }),
        fetch(`${API_BASE}/api/retarget-coupon/settings`, { headers }),
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

      if (storeRes.ok) {
        const storeData = await storeRes.json();
        setStoreName(storeData.storeName || '');
        setNaverPlaceUrl(storeData.naverPlaceUrl || '');
      }
    } catch (error) {
      console.error('Failed to fetch automation setting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 현재 문구로 해당 고객에게 재발송 (잘못 발송한 쿠폰 문구 정정용)
  const handleResend = async (logId: string) => {
    if (!confirm('현재 저장된 쿠폰 문구로 이 고객에게 다시 발송합니다. (새 쿠폰 발급, 발송 비용 1건 차감)\n계속할까요?')) return;
    setResendingLogId(logId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/automation/logs/${logId}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '재발송에 실패했습니다.');
      showToast('현재 문구로 재발송했습니다.', 'success');
      // 이력 갱신
      const logsRes = await fetch(`${API_BASE}/api/automation/rules/${type}/logs?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (logsRes.ok) setLogs((await logsRes.json()).logs);
    } catch (e: any) {
      showToast(e.message || '재발송에 실패했습니다.', 'error');
    } finally {
      setResendingLogId(null);
    }
  };

  // 저장 (자동 저장 시 silent=true — 성공 토스트 없이 상태 표시만)
  const handleSave = async (silent = false) => {
    if (enabled && !naverPlaceUrl) {
      if (!silent) showToast('네이버 플레이스 링크가 없으면 자동 마케팅을 활성화할 수 없습니다. 매장 설정에서 입력해주세요.', 'error');
      return;
    }

    // 쿠폰 내용 없이는 절대 켜진 상태로 두지 않는다.
    // (내용을 지우면 UI만 꺼진 것처럼 보이고 서버는 켜진 채 이전 문구로 계속 발송되는 문제 방지 →
    //  enabled=false 를 실제로 저장해 서버 상태까지 동기화)
    const effectiveEnabled = enabled && !!couponContent.trim();
    if (enabled && !effectiveEnabled) {
      skipAutoSave.current = true;
      setEnabled(false);
      showToast('쿠폰 내용이 없어 자동 마케팅을 껐습니다. 문구를 입력한 뒤 다시 켜주세요.', 'error');
    }

    setIsSaving(true);
    setSaveState('saving');
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

      const res = await fetch(`${API_BASE}/api/automation/rules/${type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: effectiveEnabled,
          triggerConfig,
          couponEnabled,
          couponContent: couponContent.trim() || null,
          couponValidDays,
          sendTimeHour,
        }),
      });

      if (res.ok) {
        setSaveState('saved');
        if (!silent) showToast('설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json().catch(() => ({}));
        setSaveState('error');
        showToast(error.error || '저장에 실패했습니다.', 'error');
        // 쿠폰 내용 미입력으로 활성화가 거부된 경우 토글을 원래대로 되돌린다
        if (error.code === 'coupon_content_required') {
          skipAutoSave.current = true;
          setEnabled(false);
        }
      }
    } catch (error) {
      console.error('Failed to save automation setting:', error);
      setSaveState('error');
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 최신 저장 함수를 ref로 유지 (언마운트 시 대기 중 저장 flush 용)
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  // 자동 저장: 설정 변경 후 800ms 뒤 저장 (하단 저장 버튼을 못 보고 나가는 문제 해결)
  useEffect(() => {
    if (isLoading) return;
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      saveRef.current(true);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, couponEnabled, couponContent, couponValidDays, sendTimeHour,
      daysBefore, daysInactive, daysAfterFirstVisit, milestones, winbackDaysInactive, slowDays, isLoading]);

  // 페이지를 떠날 때 대기 중인 변경사항 즉시 저장
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveRef.current(true);
      }
    };
  }, []);

  if (!meta) return null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      </div>
    );
  }

  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* 헤더 */}
      <div className="mb-5">
        <button
          onClick={() => router.push('/automation')}
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-[color:var(--ad-muted)] transition-colors hover:text-[color:var(--ad-ink)]"
        >
          <ArrowLeft className="w-4 h-4" />
          자동 마케팅
        </button>
        <div className="flex items-center gap-3">
          <Icon
            className={`h-4 w-4 flex-shrink-0 ${enabled ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'}`}
            strokeWidth={1.8}
          />
          <div className="flex-1">
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">
              {meta.label} 설정
            </h1>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              if (v && !naverPlaceUrl) {
                showToast('네이버 플레이스 링크가 없으면 활성화할 수 없습니다. 매장 설정에서 입력해주세요.', 'error');
                return;
              }
              setEnabled(v);
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {/* 발송 조건 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">발송 조건</h2>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {type === 'BIRTHDAY' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">생일</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일 전</span>
                </div>
              </div>
            )}

            {type === 'CHURN_PREVENTION' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  미방문 기간
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">마지막 방문 후</span>
                  <Input
                    type="number"
                    min={7}
                    max={180}
                    value={daysInactive}
                    onChange={(e) => setDaysInactive(parseInt(e.target.value) || 30)}
                    className="w-20 text-center"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일 이상 미방문 시</span>
                </div>
              </div>
            )}

            {type === 'ANNIVERSARY' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">가입 기념일</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일 전</span>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">고객의 첫 등록일을 기준으로 매년 기념일 쿠폰을 보냅니다</p>
              </div>
            )}

            {type === 'FIRST_VISIT_FOLLOWUP' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  발송 시점
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">첫 방문</span>
                  <Input
                    type="number"
                    min={1}
                    max={14}
                    value={daysAfterFirstVisit}
                    onChange={(e) => setDaysAfterFirstVisit(parseInt(e.target.value) || 3)}
                    className="w-20 text-center"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일 후</span>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">첫 방문 고객에게 감사 메시지와 재방문 쿠폰을 보냅니다</p>
              </div>
            )}

            {type === 'VIP_MILESTONE' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  마일스톤 설정
                </label>
                <Input
                  value={milestones}
                  onChange={(e) => setMilestones(e.target.value)}
                  placeholder="10, 20, 30, 50, 100"
                />
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">방문 횟수가 해당 숫자에 도달하면 감사 쿠폰을 발송합니다 (쉼표로 구분)</p>
              </div>
            )}

            {type === 'WINBACK' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  미방문 기간
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">마지막 방문 후</span>
                  <Input
                    type="number"
                    min={60}
                    max={365}
                    value={winbackDaysInactive}
                    onChange={(e) => setWinbackDaysInactive(parseInt(e.target.value) || 90)}
                    className="w-20 text-center"
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일 이상 미방문 시</span>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">이탈 방지보다 긴 기간 미방문 고객에게 특별 할인을 보냅니다</p>
              </div>
            )}

            {type === 'SLOW_DAY' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
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
                      className={`ad-press h-10 w-10 rounded-[10px] text-[13px] font-medium transition-colors ${
                        slowDays.includes(idx)
                          ? 'bg-[color:var(--ad-ink)] text-white'
                          : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-line)]'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">선택한 요일에 방문 이력 있는 고객에게 프로모션을 발송합니다</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                발송 시각
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[color:var(--ad-ink-2)]">매일 오전/오후</span>
                <select
                  value={sendTimeHour}
                  onChange={(e) => setSendTimeHour(parseInt(e.target.value))}
                  className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] focus:border-[color:var(--ad-ink)] focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i < 12 ? `오전 ${i === 0 ? 12 : i}시` : `오후 ${i === 12 ? 12 : i - 12}시`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 쿠폰 설정 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">쿠폰 내용</h2>
              </div>
              <Switch
                checked={couponEnabled}
                onCheckedChange={setCouponEnabled}
              />
            </div>
          </div>
          {couponEnabled && (
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  쿠폰 내용
                </label>
                <Textarea
                  value={couponContent}
                  onChange={(e) => setCouponContent(e.target.value)}
                  placeholder={
                    type === 'BIRTHDAY' ? '🥳 생일 축하 특별 20% 할인' :
                    type === 'ANNIVERSARY' ? '🎉 가입 1주년 기념 15% 할인' :
                    type === 'FIRST_VISIT_FOLLOWUP' ? '💝 재방문 시 아메리카노 1잔 무료' :
                    type === 'VIP_MILESTONE' ? '👑 VIP 고객님 전 메뉴 30% 할인' :
                    type === 'WINBACK' ? '🙌 오랜만에 오시면 5,000원 할인' :
                    type === 'SLOW_DAY' ? '⚡ 오늘만 전 메뉴 10% 할인' :
                    '😊 재방문 감사 3,000원 할인'
                  }
                  maxLength={100}
                  rows={3}
                  className="resize-y"
                />
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
                  고객에게 표시되는 쿠폰 혜택 내용입니다 · 엔터로 줄바꿈할 수 있어요 (최대 100자)
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
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
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">일</span>
                </div>
              </div>

              {/* 네이버 플레이스 링크 */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                  네이버 플레이스 링크
                </label>
                {naverPlaceUrl ? (
                  <div className="flex items-center gap-2 rounded-[10px] bg-[color:var(--ad-bg-alt)] p-2.5">
                    <span className="flex-1 truncate text-[13px] text-[color:var(--ad-ink-2)]">{naverPlaceUrl}</span>
                    <a
                      href={naverPlaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-[color:var(--ad-link)] hover:opacity-80"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <div>
                      <p className="text-[13px] text-[color:var(--ad-ink-2)]">
                        네이버 플레이스 링크가 설정되지 않았습니다
                      </p>
                      <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">
                        링크가 없으면 알림톡의 &quot;네이버 길찾기&quot; 버튼이 작동하지 않습니다
                      </p>
                      <button
                        onClick={() => router.push('/settings')}
                        className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                      >
                        매장 설정에서 입력하기
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
                  알림톡에 포함되는 네이버 길찾기 링크입니다. 매장 설정에서 변경할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 카카오톡 메시지 미리보기 */}
        {couponEnabled && (
          <div className="ad-card">
            <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">메시지 미리보기</h2>
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-center">
                {/* 폰 프레임 */}
                <div className="w-56 h-[440px] bg-neutral-800 rounded-[2rem] p-1.5 shadow-xl">
                  <div className="w-full h-full bg-[#B2C7D9] rounded-[1.5rem] overflow-hidden flex flex-col">
                    {/* 카카오 헤더 */}
                    <div className="flex items-center justify-between px-3 pt-8 pb-1.5">
                      <ChevronLeft className="w-3.5 h-3.5 text-neutral-700" />
                      <span className="font-medium text-[10px] text-neutral-800">태그히어</span>
                      <div className="w-3.5" />
                    </div>

                    {/* 날짜 뱃지 */}
                    <div className="flex justify-center mb-2">
                      <span className="text-[8px] bg-neutral-500/30 text-neutral-700 px-1.5 py-0.5 rounded-full">
                        {new Date().toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* 메시지 영역 */}
                    <div className="flex-1 pl-1.5 pr-3 overflow-auto">
                      <div className="flex gap-1">
                        {/* 프로필 아이콘 */}
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-neutral-300" />
                        </div>

                        {/* 메시지 콘텐츠 */}
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="text-[8px] text-neutral-600 mb-0.5">태그히어</p>

                          {/* 알림톡 버블 */}
                          <div className="relative">
                            {/* kakao 뱃지 */}
                            <div className="absolute -top-1 -right-1 z-10">
                              <span className="bg-neutral-700 text-white text-[6px] px-0.5 py-px rounded-full font-medium">
                                kakao
                              </span>
                            </div>

                            {/* 알림톡 도착 배너 */}
                            <div className="bg-[#FEE500] rounded-t-md px-1.5 py-1">
                              <span className="text-[9px] font-medium text-neutral-800">알림톡 도착</span>
                            </div>

                            <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                              {/* 쿠폰 이미지 */}
                              <img
                                src="/images/coupon_kakao.png"
                                alt="쿠폰 이미지"
                                className="w-full h-auto"
                              />

                              {/* 메시지 본문 */}
                              <div className="px-2.5 py-2.5">
                                <p className="text-[9px] font-semibold text-neutral-800 mb-2">
                                  태그히어 고객 대상 쿠폰
                                </p>
                                <div className="space-y-0.5 text-[9px] text-neutral-700">
                                  <p>
                                    <span className="text-[#6BA3FF]">{storeName || '매장명'}</span>에서 쿠폰을 보냈어요!
                                  </p>
                                  <p className="text-neutral-500 mb-2">
                                    태그히어 이용 고객에게만 제공되는 쿠폰이에요.
                                  </p>
                                  <div className="space-y-0.5 mb-2">
                                    <p className="whitespace-pre-line">📌 {couponContent || (
                                      type === 'BIRTHDAY' ? '생일 축하 10% 할인' :
                                      type === 'ANNIVERSARY' ? '가입 기념일 축하 10% 할인' :
                                      type === 'FIRST_VISIT_FOLLOWUP' ? '첫 방문 감사 10% 할인' :
                                      type === 'VIP_MILESTONE' ? 'VIP 감사 특별 할인' :
                                      type === 'WINBACK' ? '다시 만나고 싶어요! 20% 할인' :
                                      type === 'SLOW_DAY' ? '오늘만의 특별 할인 10%' :
                                      '재방문 감사 10% 할인'
                                    )}</p>
                                    <p>📌 {(() => {
                                      const d = new Date();
                                      d.setDate(d.getDate() + couponValidDays);
                                      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}까지`;
                                    })()}</p>
                                  </div>
                                  <p className="text-neutral-500">
                                    결제 시 직원 확인을 통해 사용할 수 있어요.
                                  </p>
                                </div>
                              </div>

                              {/* 버튼 */}
                              <div className="px-2.5 pb-2.5 space-y-1">
                                <div className={`w-full py-1.5 text-center text-[8px] font-medium rounded border ${
                                  naverPlaceUrl
                                    ? 'bg-white text-neutral-800 border-neutral-300'
                                    : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                                }`}>
                                  네이버 길찾기
                                </div>
                                <div className="w-full py-1.5 bg-white text-neutral-800 text-[8px] font-medium rounded border border-neutral-300 text-center">
                                  직원 확인
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 시간 */}
                          <p className="text-[7px] text-neutral-500 mt-0.5 text-right">
                            오후 12:30
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 하단 세이프 영역 */}
                    <div className="h-4" />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[12px] text-[color:var(--ad-faint)]">
                실제 고객에게 발송되는 카카오 알림톡 형태입니다
              </p>
            </div>
          </div>
        )}

        {/* 대상 미리보기 */}
        {preview && (
          <div className="ad-card">
            <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">현재 대상 미리보기</h2>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 rounded-[12px] border border-[color:var(--ad-line)]">
                <div className="p-4">
                  <div className="text-[12px] text-[color:var(--ad-muted)]">
                    {type === 'BIRTHDAY' ? '생일 정보가 있는 고객' :
                     type === 'CHURN_PREVENTION' ? '재방문 가능 고객' :
                     type === 'ANNIVERSARY' ? '등록 고객' :
                     type === 'FIRST_VISIT_FOLLOWUP' ? '첫 방문 고객' :
                     type === 'VIP_MILESTONE' ? 'VIP 후보 고객' :
                     type === 'WINBACK' ? '장기 미방문 고객' :
                     '프로모션 대상 고객'}
                  </div>
                  <div className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                    {preview.totalEligible}명
                  </div>
                </div>
                <div className="border-l border-[color:var(--ad-line)] p-4">
                  <div className="text-[12px] text-[color:var(--ad-muted)]">
                    {(type === 'CHURN_PREVENTION' || type === 'WINBACK') ? '현재 대상' : '이번 달 예상 발송'}
                  </div>
                  <div className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                    ~{(type === 'CHURN_PREVENTION' || type === 'WINBACK')
                      ? preview.currentChurnRisk
                      : preview.thisMonthEstimate}건
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-[color:var(--ad-faint)]">
                예상 비용: ~{preview.estimatedMonthlyCost.toLocaleString()}원/월 (무료 크레딧 적용 전)
              </p>
            </div>
          </div>
        )}

        {/* 최근 발송 이력 */}
        {logs.length > 0 && (
          <div className="ad-card">
            <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">최근 발송 이력</h2>
            </div>
            <div className="p-5">
              <div className="divide-y divide-[color:var(--ad-line)]">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 py-2.5 text-[13px]"
                  >
                    <span className="ad-tnum w-16 flex-shrink-0 text-[color:var(--ad-faint)]">
                      {new Date(log.sentAt).toLocaleDateString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="flex-1 truncate text-[color:var(--ad-ink-2)]">
                      {log.customer.name
                        ? `${log.customer.name.charAt(0)}${'O'.repeat(log.customer.name.length - 1)}`
                        : '고객'}
                    </span>
                    <span className="flex-shrink-0 text-[color:var(--ad-muted)]">
                      쿠폰 발송
                    </span>
                    {log.couponUsed ? (
                      <span className="flex flex-shrink-0 items-center gap-1 text-[color:var(--ad-pos)]">
                        <Check className="w-3.5 h-3.5" />
                        사용
                        {log.resultAmount && (
                          <span className="ad-tnum text-[color:var(--ad-muted)]">
                            ({log.resultAmount.toLocaleString()}원)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex-shrink-0 text-[color:var(--ad-faint)]">미사용</span>
                    )}
                    <button
                      onClick={() => handleResend(log.id)}
                      disabled={resendingLogId === log.id}
                      className="ad-press inline-flex h-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-white px-2.5 text-[12px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                      title="현재 저장된 쿠폰 문구로 이 고객에게 다시 발송합니다"
                    >
                      {resendingLogId === log.id ? '발송 중...' : '문구 재발송'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 저장 상태 (자동 저장) */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveState === 'saving' && (
            <span className="text-[13px] text-[color:var(--ad-muted)]">저장 중...</span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1.5 text-[13px] text-[color:var(--ad-pos)]">
              <Check className="w-4 h-4" />
              변경사항이 자동 저장되었습니다
            </span>
          )}
          {saveState === 'error' && (
            <>
              <span className="text-[13px] text-[color:var(--ad-neg)]">저장에 실패했습니다</span>
              <button onClick={() => handleSave(false)} disabled={isSaving} className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
                다시 저장
              </button>
            </>
          )}
          {saveState === 'idle' && (
            <span className="text-[13px] text-[color:var(--ad-faint)]">변경하면 자동으로 저장됩니다</span>
          )}
        </div>
      </div>
    </div>
  );
}
