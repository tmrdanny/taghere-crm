'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
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
  ChevronLeft,
  MessageSquare,
  ExternalLink,
  AlertTriangle,
  Store,
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
  customer: { name: string | null; phone: string | null };
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

export default function FranchiseAutomationSettingPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const type = params.type as string;
  const storeId = searchParams.get('storeId') || '';
  const isBulk = storeId === 'ALL';
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
  const [storeName, setStoreName] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');
  const [naverPlaceUrlInput, setNaverPlaceUrlInput] = useState('');
  const [isSavingNaverUrl, setIsSavingNaverUrl] = useState(false);

  const meta = SCENARIO_META[type];

  const getHeaders = () => {
    const token = localStorage.getItem('franchiseToken');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    if (!meta) {
      router.push('/franchise/campaigns/automation');
      return;
    }
    if (!storeId) {
      router.push('/franchise/campaigns/automation');
      return;
    }
    if (!isBulk) {
      fetchData();
    } else {
      setIsLoading(false);
    }
  }, [type, storeId]);

  const fetchData = async () => {
    try {
      const headers = getHeaders();
      const [rulesRes, previewRes, logsRes] = await Promise.all([
        fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/rules`, { headers }),
        fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/preview/${type}`, { headers }),
        fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/rules/${type}/logs?limit=10`, { headers }),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setStoreName(data.storeName || '');
        setNaverPlaceUrl(data.naverPlaceUrl || '');
        setNaverPlaceUrlInput(data.naverPlaceUrl || '');

        const r = data.rules.find((r: AutomationRule) => r.type === type);
        if (r) {
          setRule(r);
          setEnabled(r.enabled);
          setCouponEnabled(r.couponEnabled);
          setCouponContent(r.couponContent || '');
          setCouponValidDays(r.couponValidDays);
          setSendTimeHour(r.sendTimeHour);
          if (type === 'BIRTHDAY' && r.triggerConfig?.daysBefore) setDaysBefore(r.triggerConfig.daysBefore);
          if (type === 'CHURN_PREVENTION' && r.triggerConfig?.daysInactive) setDaysInactive(r.triggerConfig.daysInactive);
          if (type === 'ANNIVERSARY' && r.triggerConfig?.daysBefore) setDaysBefore(r.triggerConfig.daysBefore);
          if (type === 'FIRST_VISIT_FOLLOWUP' && r.triggerConfig?.daysAfterFirstVisit) setDaysAfterFirstVisit(r.triggerConfig.daysAfterFirstVisit);
          if (type === 'VIP_MILESTONE' && r.triggerConfig?.milestones) setMilestones(r.triggerConfig.milestones.join(', '));
          if (type === 'WINBACK' && r.triggerConfig?.daysInactive) setWinbackDaysInactive(r.triggerConfig.daysInactive);
          if (type === 'SLOW_DAY' && r.triggerConfig?.slowDays) setSlowDays(r.triggerConfig.slowDays);
        }
      }

      if (previewRes.ok) setPreview(await previewRes.json());
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

  const handleSaveNaverUrl = async () => {
    if (!naverPlaceUrlInput.trim()) {
      showToast('네이버 플레이스 링크를 입력해주세요.', 'error');
      return;
    }
    setIsSavingNaverUrl(true);
    try {
      const res = await fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/naver-place-url`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverPlaceUrl: naverPlaceUrlInput.trim() }),
      });
      if (res.ok) {
        setNaverPlaceUrl(naverPlaceUrlInput.trim());
        showToast('네이버 플레이스 링크가 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setIsSavingNaverUrl(false);
    }
  };

  const handleSave = async () => {
    if (enabled && !naverPlaceUrl && !isBulk) {
      showToast('네이버 플레이스 링크가 없으면 자동 마케팅을 활성화할 수 없습니다.', 'error');
      return;
    }

    setIsSaving(true);
    try {
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

      const body = {
        enabled,
        triggerConfig,
        couponEnabled,
        couponContent: couponContent.trim() || null,
        couponValidDays,
        sendTimeHour,
      };

      const url = isBulk
        ? `${apiUrl}/api/franchise/automation/bulk/rules/${type}`
        : `${apiUrl}/api/franchise/automation/stores/${storeId}/rules/${type}`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        if (isBulk) {
          const data = await res.json();
          if (data.skippedStores.length > 0) {
            showToast(`${data.updatedCount}개 가맹점 적용 완료. ${data.skippedStores.length}개는 네이버 링크 미설정으로 활성화 제외.`, 'success');
          } else {
            showToast(`전체 ${data.updatedCount}개 가맹점에 설정이 저장되었습니다.`, 'success');
          }
        } else {
          showToast('설정이 저장되었습니다.', 'success');
        }
      } else {
        const error = await res.json();
        showToast(error.error || '저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!meta) return null;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
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
          onClick={() => router.push('/franchise/campaigns/automation')}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          자동 마케팅
        </button>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            enabled ? 'bg-franchise-100 text-franchise-700' : 'bg-slate-100 text-slate-500'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">{meta.label} 설정</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isBulk ? (
                <span className="inline-flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  전체 가맹점 일괄 설정
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  {storeName}
                </span>
              )}
            </p>
          </div>
          {!isBulk && (
            <Switch
              checked={enabled}
              onCheckedChange={(v) => {
                if (v && !naverPlaceUrl) {
                  showToast('네이버 플레이스 링크가 없으면 활성화할 수 없습니다.', 'error');
                  return;
                }
                setEnabled(v);
              }}
            />
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* 발송 조건 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-600" />
              <CardTitle className="text-lg">발송 조건</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {type === 'BIRTHDAY' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">발송 시점</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">생일</span>
                  <Input type="number" min={1} max={14} value={daysBefore} onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일 전</span>
                </div>
              </div>
            )}
            {type === 'CHURN_PREVENTION' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">미방문 기간</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">마지막 방문 후</span>
                  <Input type="number" min={7} max={180} value={daysInactive} onChange={(e) => setDaysInactive(parseInt(e.target.value) || 30)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일 이상 미방문 시</span>
                </div>
              </div>
            )}
            {type === 'ANNIVERSARY' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">발송 시점</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">가입 기념일</span>
                  <Input type="number" min={1} max={14} value={daysBefore} onChange={(e) => setDaysBefore(parseInt(e.target.value) || 3)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일 전</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">고객의 첫 등록일을 기준으로 매년 기념일 쿠폰을 보냅니다</p>
              </div>
            )}
            {type === 'FIRST_VISIT_FOLLOWUP' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">발송 시점</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">첫 방문</span>
                  <Input type="number" min={1} max={14} value={daysAfterFirstVisit} onChange={(e) => setDaysAfterFirstVisit(parseInt(e.target.value) || 3)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일 후</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">첫 방문 고객에게 감사 메시지와 재방문 쿠폰을 보냅니다</p>
              </div>
            )}
            {type === 'VIP_MILESTONE' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">마일스톤 설정</label>
                <Input value={milestones} onChange={(e) => setMilestones(e.target.value)} placeholder="10, 20, 30, 50, 100" />
                <p className="text-xs text-slate-400 mt-1">방문 횟수가 해당 숫자에 도달하면 감사 쿠폰을 발송합니다 (쉼표로 구분)</p>
              </div>
            )}
            {type === 'WINBACK' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">미방문 기간</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">마지막 방문 후</span>
                  <Input type="number" min={60} max={365} value={winbackDaysInactive} onChange={(e) => setWinbackDaysInactive(parseInt(e.target.value) || 90)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일 이상 미방문 시</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">이탈 방지보다 긴 기간 미방문 고객에게 특별 할인을 보냅니다</p>
              </div>
            )}
            {type === 'SLOW_DAY' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">비수기 요일</label>
                <div className="flex gap-2 flex-wrap">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSlowDays((prev) => prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort())}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        slowDays.includes(idx) ? 'bg-franchise-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">선택한 요일에 방문 이력 있는 고객에게 프로모션을 발송합니다</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">발송 시각</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">매일 오전/오후</span>
                <select
                  value={sendTimeHour}
                  onChange={(e) => setSendTimeHour(parseInt(e.target.value))}
                  className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
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
                <Gift className="w-5 h-5 text-slate-600" />
                <CardTitle className="text-lg">쿠폰 내용</CardTitle>
              </div>
              <Switch checked={couponEnabled} onCheckedChange={setCouponEnabled} />
            </div>
          </CardHeader>
          {couponEnabled && (
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">쿠폰 내용</label>
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
                <p className="text-xs text-slate-400 mt-1">고객에게 표시되는 쿠폰 혜택 내용입니다</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">유효기간</label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={90} value={couponValidDays} onChange={(e) => setCouponValidDays(parseInt(e.target.value) || 14)} className="w-20 text-center" />
                  <span className="text-sm text-slate-600">일</span>
                </div>
              </div>

              {/* 네이버 플레이스 링크 */}
              {!isBulk && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">네이버 플레이스 링크</label>
                  {naverPlaceUrl ? (
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700 truncate flex-1">{naverPlaceUrl}</span>
                      <a href={naverPlaceUrl} target="_blank" rel="noopener noreferrer" className="text-franchise-600 hover:text-franchise-700 flex-shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-amber-800">네이버 플레이스 링크가 설정되지 않았습니다</p>
                          <p className="text-xs text-amber-600 mt-0.5">링크가 없으면 자동 마케팅을 활성화할 수 없습니다</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={naverPlaceUrlInput}
                          onChange={(e) => setNaverPlaceUrlInput(e.target.value)}
                          placeholder="https://naver.me/..."
                          className="flex-1"
                        />
                        <Button
                          onClick={handleSaveNaverUrl}
                          disabled={isSavingNaverUrl || !naverPlaceUrlInput.trim()}
                          className="flex-shrink-0"
                        >
                          {isSavingNaverUrl ? '저장 중...' : '저장'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">알림톡에 포함되는 네이버 길찾기 링크입니다</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* 카카오톡 메시지 미리보기 */}
        {couponEnabled && !isBulk && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-600" />
                <CardTitle className="text-lg">메시지 미리보기</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div className="w-56 h-[440px] bg-slate-800 rounded-[2rem] p-1.5 shadow-xl">
                  <div className="w-full h-full bg-[#B2C7D9] rounded-[1.5rem] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 pt-8 pb-1.5">
                      <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
                      <span className="font-medium text-[10px] text-slate-800">태그히어</span>
                      <div className="w-3.5" />
                    </div>
                    <div className="flex justify-center mb-2">
                      <span className="text-[8px] bg-slate-500/30 text-slate-700 px-1.5 py-0.5 rounded-full">
                        {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex-1 pl-1.5 pr-3 overflow-auto">
                      <div className="flex gap-1">
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="text-[8px] text-slate-600 mb-0.5">태그히어</p>
                          <div className="relative">
                            <div className="absolute -top-1 -right-1 z-10">
                              <span className="bg-slate-700 text-white text-[6px] px-0.5 py-px rounded-full font-medium">kakao</span>
                            </div>
                            <div className="bg-[#FEE500] rounded-t-md px-1.5 py-1">
                              <span className="text-[9px] font-medium text-slate-800">알림톡 도착</span>
                            </div>
                            <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                              <img src="/images/coupon_kakao.png" alt="쿠폰 이미지" className="w-full h-auto" />
                              <div className="px-2.5 py-2.5">
                                <p className="text-[9px] font-semibold text-slate-800 mb-2">태그히어 고객 대상 쿠폰</p>
                                <div className="space-y-0.5 text-[9px] text-slate-700">
                                  <p><span className="text-[#6BA3FF]">{storeName || '매장명'}</span>에서 쿠폰을 보냈어요!</p>
                                  <p className="text-slate-500 mb-2">태그히어 이용 고객에게만 제공되는 쿠폰이에요.</p>
                                  <div className="space-y-0.5 mb-2">
                                    <p>📌 {couponContent || (
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
                                  <p className="text-slate-500">결제 시 직원 확인을 통해 사용할 수 있어요.</p>
                                </div>
                              </div>
                              <div className="px-2.5 pb-2.5 space-y-1">
                                <div className={`w-full py-1.5 text-center text-[8px] font-medium rounded border ${
                                  naverPlaceUrl ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}>네이버 길찾기</div>
                                <div className="w-full py-1.5 bg-white text-slate-800 text-[8px] font-medium rounded border border-slate-300 text-center">직원 확인</div>
                              </div>
                            </div>
                          </div>
                          <p className="text-[7px] text-slate-500 mt-0.5 text-right">오후 12:30</p>
                        </div>
                      </div>
                    </div>
                    <div className="h-4" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center mt-3">실제 고객에게 발송되는 카카오 알림톡 형태입니다</p>
            </CardContent>
          </Card>
        )}

        {/* 대상 미리보기 */}
        {preview && !isBulk && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-600" />
                <CardTitle className="text-lg">현재 대상 미리보기</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">
                    {type === 'BIRTHDAY' ? '생일 정보가 있는 고객' :
                     type === 'CHURN_PREVENTION' ? '재방문 가능 고객' :
                     type === 'ANNIVERSARY' ? '등록 고객' :
                     type === 'FIRST_VISIT_FOLLOWUP' ? '첫 방문 고객' :
                     type === 'VIP_MILESTONE' ? 'VIP 후보 고객' :
                     type === 'WINBACK' ? '장기 미방문 고객' :
                     '프로모션 대상 고객'}
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{preview.totalEligible}명</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">
                    {(type === 'CHURN_PREVENTION' || type === 'WINBACK') ? '현재 대상' : '이번 달 예상 발송'}
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ~{(type === 'CHURN_PREVENTION' || type === 'WINBACK') ? preview.currentChurnRisk : preview.thisMonthEstimate}건
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                예상 비용: ~{preview.estimatedMonthlyCost.toLocaleString()}원/월 (무료 크레딧 적용 전)
              </p>
            </CardContent>
          </Card>
        )}

        {/* 최근 발송 이력 */}
        {logs.length > 0 && !isBulk && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">최근 발송 이력</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 text-sm py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-400 w-16 flex-shrink-0">
                      {new Date(log.sentAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <span className="text-slate-700 flex-1 truncate">
                      {log.customer.name ? `${log.customer.name.charAt(0)}${'O'.repeat(log.customer.name.length - 1)}` : '고객'}
                    </span>
                    <span className="text-slate-500 flex-shrink-0">쿠폰 발송</span>
                    {log.couponUsed ? (
                      <span className="flex items-center gap-1 text-green-600 flex-shrink-0">
                        <Check className="w-3.5 h-3.5" />사용
                        {log.resultAmount && <span className="text-slate-500">({log.resultAmount.toLocaleString()}원)</span>}
                      </span>
                    ) : (
                      <span className="text-slate-400 flex-shrink-0">미사용</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 저장 버튼 */}
        <div className="flex justify-end pt-2 pb-8">
          <Button onClick={handleSave} disabled={isSaving} className="px-8">
            {isSaving ? '저장 중...' : isBulk ? '전체 가맹점에 저장' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
