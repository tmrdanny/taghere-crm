'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import {
  Rocket,
  ChevronLeft,
  Info,
  CreditCard,
  Wallet,
  Banknote,
  X,
  Loader2,
} from 'lucide-react';
import { BoosterCreateForm, toDateInput, BoosterFormValues } from '@/components/place-booster/booster-create-form';
import { BoosterReport, CampaignInputCard } from '@/components/place-booster/booster-report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';
const BOOSTER_PRICE = 544500;
// 카드 결제(토스 위젯)는 잠시 보류 — 크레딧/계좌이체만 노출. 재개하려면 true로.
const CARD_PAYMENT_ENABLED = false;

const getAuthToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';

interface BatchSummary {
  status: string;
  sentCount: number;
}
interface Campaign {
  id: string;
  keyword: string;
  status: string;
  paymentStatus: string;
  perBatchCount: number;
  totalWeeks: number;
  totalTargetCount: number;
  createdAt: string;
  batches?: BatchSummary[];
}
interface ReportRow {
  batchId: string;
  weekNo: number;
  scheduledAt: string;
  status: string;
  sentCount: number;
  clickCount: number;
  clickRate: number;
  couponUsedCount: number | null;
  avgTicket: number | null;
  revenue: number;
}
interface Report {
  campaign: Campaign & {
    couponContent: string;
    couponCode: string | null;
    couponAmount: string | null;
    couponValidUntil: string | null;
    naverPlaceUrl: string;
    placeId: string;
    ownerPhone: string | null;
    sendTime: string;
    weekday: number;
  };
  rows: ReportRow[];
  totals: {
    sentCount: number;
    clickCount: number;
    clickRate: number;
    revenue: number;
    adCost: number;
    roi: number | null;
  };
}

interface Draft {
  id: string;
  formData: BoosterFormValues;
  updatedAt: string;
}

const won = (n: number) => n.toLocaleString('ko-KR');

const EDITABLE_STATUSES = ['DRAFT', 'SCHEDULED', 'RUNNING'];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '결제 대기', cls: 'bg-neutral-100 text-neutral-600' },
  SCHEDULED: { label: '발송 예정', cls: 'bg-blue-100 text-blue-700' },
  RUNNING: { label: '발송 중', cls: 'bg-green-100 text-green-700' },
  COMPLETED: { label: '완료', cls: 'bg-neutral-200 text-neutral-700' },
  CANCELLED: { label: '취소됨', cls: 'bg-red-100 text-red-600' },
};

export default function PlaceBoosterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'edit'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftInitial, setDraftInitial] = useState<BoosterFormValues | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const confirmingRef = useRef(false);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
          ...(init?.headers || {}),
        },
      }),
    []
  );

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/place-booster/campaigns');
      if (res.ok) {
        setCampaigns(await res.json());
      } else {
        setError('캠페인 목록을 불러오지 못했습니다.');
      }
    } catch {
      setError('네트워크 오류로 캠페인 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const openDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/place-booster/campaigns/${id}`);
        if (res.ok) {
          setReport(await res.json());
          setView('detail');
        } else {
          setError('캠페인을 불러오지 못했습니다.');
        }
      } catch {
        setError('네트워크 오류로 캠페인을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [authFetch]
  );

  const loadDrafts = useCallback(async () => {
    try {
      const res = await authFetch('/api/place-booster/drafts');
      if (res.ok) setDrafts(await res.json());
    } catch { /* 무시 */ }
  }, [authFetch]);

  useEffect(() => {
    loadCampaigns();
    loadDrafts();
  }, [loadCampaigns, loadDrafts]);

  // 임시저장: 새 draft면 POST(id 확보), 이어쓰기면 PATCH
  const saveDraftFn = useCallback(async (values: BoosterFormValues) => {
    const res = await authFetch(
      draftId ? `/api/place-booster/drafts/${draftId}` : '/api/place-booster/drafts',
      { method: draftId ? 'PATCH' : 'POST', body: JSON.stringify({ formData: values }) }
    );
    if (res.ok) {
      const d = await res.json();
      if (!draftId && d?.id) setDraftId(d.id);
      setNotice('임시 저장되었습니다.');
    } else {
      throw new Error('임시 저장 실패');
    }
  }, [authFetch, draftId]);

  const resumeDraft = (d: Draft) => {
    setDraftId(d.id);
    setDraftInitial(d.formData);
    setView('create');
  };

  const startCreate = () => {
    setDraftId(null);
    setDraftInitial(null);
    setView('create');
  };

  const deleteDraft = async (id: string) => {
    await authFetch(`/api/place-booster/drafts/${id}`, { method: 'DELETE' });
    await loadDrafts();
  };

  // 카드 결제 복귀 처리 (Toss successUrl → ?pbCampaign=&paymentKey=&orderId=&amount=)
  useEffect(() => {
    if (!CARD_PAYMENT_ENABLED) return; // 카드 결제 보류 중 — 비활성 엔드포인트로의 stale URL POST 방지
    const pbCampaign = searchParams.get('pbCampaign');
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');
    if (pbCampaign && paymentKey && orderId && amount) {
      if (confirmingRef.current) return; // 중복 confirm 방지(StrictMode/재마운트)
      confirmingRef.current = true;
      (async () => {
        try {
          const res = await authFetch(`/api/place-booster/campaigns/${pbCampaign}/pay/card/confirm`, {
            method: 'POST',
            body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount, 10) }),
          });
          if (res.ok) {
            router.replace('/place-booster');
            await loadCampaigns();
            await openDetail(pbCampaign);
          } else {
            const d = await res.json().catch(() => ({}));
            setError(d.error || '카드 결제 승인에 실패했습니다.');
            router.replace('/place-booster');
          }
        } finally {
          confirmingRef.current = false;
        }
      })();
    }
  }, [searchParams, authFetch, router, loadCampaigns, openDetail]);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-10 sm:pt-12 pb-8">
      <div className="flex items-center gap-2.5 mb-7">
        <Rocket className="w-7 h-7 text-brand-800" />
        <h1 className="text-2xl font-bold text-neutral-900">네이버 플레이스 부스터</h1>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
          <Info className="w-4 h-4" /> {error}
          <button className="ml-auto" onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 text-blue-700 px-4 py-3 text-sm">
          <Info className="w-4 h-4" /> {notice}
          <button className="ml-auto" onClick={() => setNotice('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {view === 'list' && (
        <ListView
          campaigns={campaigns}
          drafts={drafts}
          loading={loading}
          onCreate={startCreate}
          onOpen={openDetail}
          onResumeDraft={resumeDraft}
          onDeleteDraft={deleteDraft}
        />
      )}
      {view === 'create' && (
        <BoosterCreateForm
          apiPrefix="/api/place-booster"
          fetcher={authFetch}
          storeInfoEndpoint="/api/place-booster/store-info"
          submitLabel="캠페인 생성 후 결제"
          initialValues={draftInitial ?? undefined}
          onSaveDraft={saveDraftFn}
          onBack={() => { setView('list'); loadDrafts(); }}
          onCreated={async (id) => {
            if (draftId) { await deleteDraft(draftId); setDraftId(null); }
            setDraftInitial(null);
            await loadCampaigns();
            await openDetail(id);
          }}
        />
      )}
      {view === 'detail' && report && (
        <DetailView
          report={report}
          authFetch={authFetch}
          onBack={() => {
            setReport(null);
            setView('list');
            loadCampaigns();
          }}
          onEdit={() => setView('edit')}
          reload={() => openDetail(report.campaign.id)}
          setError={setError}
        />
      )}
      {view === 'edit' && report && (
        <BoosterCreateForm
          apiPrefix="/api/place-booster"
          fetcher={authFetch}
          mode="edit"
          campaignId={report.campaign.id}
          initialValues={{
            keyword: report.campaign.keyword,
            naverPlaceUrl: report.campaign.naverPlaceUrl,
            placeId: report.campaign.placeId,
            placeAddress: null,
            couponContent: report.campaign.couponContent,
            couponCode: report.campaign.couponCode ?? '',
            couponAmount: report.campaign.couponAmount ?? '',
            couponValidUntil: toDateInput(report.campaign.couponValidUntil),
            ownerPhone: report.campaign.ownerPhone ?? '',
            weekday: report.campaign.weekday,
            sendTime: report.campaign.sendTime,
            perBatchCount: report.campaign.perBatchCount,
            totalWeeks: report.campaign.totalWeeks,
          }}
          submitLabel="수정 완료"
          presetLocked={report.campaign.status !== 'DRAFT'}
          submitNote={
            report.campaign.status === 'DRAFT'
              ? '결제 전이라 전체 항목을 수정할 수 있어요. 일정·인원 변경 시 회차가 재생성됩니다.'
              : '이미 발송된 주차는 그대로 두고, 남은 주차만 새 내용으로 재예약됩니다. (남은 주차 수신자는 새로 선정됩니다)'
          }
          onBack={() => setView('detail')}
          onSaved={async (id, meta) => {
            if (meta && typeof meta.restaged === 'number') {
              const failN = meta.failed?.length ?? 0;
              setNotice(
                meta.restaged > 0
                  ? `남은 ${meta.restaged}개 주차를 새 내용으로 재예약했습니다.${failN ? ` (${failN}개 주차는 발송 임박으로 변경 불가)` : ''}`
                  : '변경 가능한 남은 주차가 없습니다.'
              );
            } else {
              setNotice('캠페인을 수정했습니다.');
            }
            await loadCampaigns();
            await openDetail(id);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- 목록 ---------------- */
function ListView({
  campaigns,
  drafts,
  loading,
  onCreate,
  onOpen,
  onResumeDraft,
  onDeleteDraft,
}: {
  campaigns: Campaign[];
  drafts: Draft[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onResumeDraft: (d: Draft) => void;
  onDeleteDraft: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-start gap-4 mb-5">
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          매장 인근 신규 고객에게 알림톡으로 쿠폰을 보내고 네이버 플레이스 유입을 높입니다.
        </p>
        <Button size="lg" className="shrink-0" onClick={onCreate}>
          <Rocket className="w-4 h-4 mr-1.5" /> 새 캠페인
        </Button>
      </div>
      {loading && <p className="text-[15px] text-neutral-400">불러오는 중…</p>}
      {!loading && campaigns.length === 0 && drafts.length === 0 && (
        <Card className="p-12 text-center text-[15px] text-neutral-500">
          아직 캠페인이 없습니다. 첫 캠페인을 만들어보세요.
        </Card>
      )}
      {drafts.length > 0 && (
        <div className="space-y-3 mb-3">
          {drafts.map((d) => (
            <Card key={d.id} className="p-5 flex items-center justify-between gap-3">
              <button className="min-w-0 text-left flex-1" onClick={() => onResumeDraft(d)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-neutral-900">{d.formData?.keyword?.trim() || '(제목 없음)'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600">임시 저장됨</span>
                </div>
                <div className="text-sm text-neutral-500 mt-1.5">이어서 작성하려면 눌러주세요.</div>
              </button>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onDeleteDraft(d.id)}>삭제</Button>
            </Card>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {campaigns.map((c) => {
          const st = STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT;
          const sent = (c.batches || []).filter((b) => b.status === 'SENT').length;
          return (
            <Card
              key={c.id}
              role="button"
              tabIndex={0}
              className="p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-800"
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(c.id);
                }
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-neutral-900">{c.keyword}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  {c.paymentStatus === 'PENDING_APPROVAL' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      입금 확인 대기
                    </span>
                  )}
                </div>
                <div className="text-sm text-neutral-500 mt-1.5">
                  {c.perBatchCount.toLocaleString()}명 × {c.totalWeeks}주 · 진행 {sent}/{c.totalWeeks}주차
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-neutral-300 rotate-180 shrink-0" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 상세 / 리포트 ---------------- */
function DetailView({
  report,
  authFetch,
  onBack,
  onEdit,
  reload,
  setError,
}: {
  report: Report;
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  onBack: () => void;
  onEdit: () => void;
  reload: () => void;
  setError: (s: string) => void;
}) {
  const c = report.campaign;
  const needsPayment = c.paymentStatus !== 'PAID';
  const [showPay, setShowPay] = useState(needsPayment && c.status === 'DRAFT');
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const sendTest = async () => {
    setTestMsg('');
    if (!testPhone.trim()) { setTestMsg('테스트로 받을 번호를 입력해주세요.'); return; }
    setTestSending(true);
    try {
      const res = await authFetch(`/api/place-booster/campaigns/${c.id}/test-send`, {
        method: 'POST',
        body: JSON.stringify({ phone: testPhone }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) trackEvent('owner_booster_test_send', { stage: 'campaign' });
      setTestMsg(res.ok ? '✓ 테스트 알림톡을 발송했어요. 카카오톡을 확인해보세요.' : d.error || '발송에 실패했습니다.');
    } catch {
      setTestMsg('네트워크 오류가 발생했습니다.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-0.5 text-[15px] text-neutral-500 hover:text-neutral-700">
          <ChevronLeft className="w-5 h-5" /> 목록으로
        </button>
        {EDITABLE_STATUSES.includes(c.status) && (
          <Button variant="secondary" size="sm" onClick={onEdit}>수정</Button>
        )}
      </div>

      <Card className="p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{c.keyword}</h2>
            <p className="text-base text-neutral-500 mt-1.5">{c.couponContent}</p>
            <div className="text-sm text-neutral-400 mt-1">
              {c.perBatchCount.toLocaleString()}명 × {c.totalWeeks}주 (총 {c.totalTargetCount.toLocaleString()}명)
            </div>
          </div>
          <span className={`text-sm px-2.5 py-1 rounded-full shrink-0 ${(STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT).cls}`}>
            {(STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT).label}
          </span>
        </div>

        {needsPayment && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
            <Info className="w-4 h-4" />
            {c.paymentStatus === 'PENDING_APPROVAL'
              ? '계좌이체 입금 확인 후 담당자가 승인하면 발송이 시작됩니다.'
              : '결제가 완료되어야 발송이 시작됩니다.'}
            {c.status === 'DRAFT' && c.paymentStatus !== 'PENDING_APPROVAL' && (
              <Button size="sm" className="ml-auto" onClick={() => setShowPay(true)}>
                결제하기
              </Button>
            )}
          </div>
        )}

      </Card>

      {/* 캠페인 입력 정보 (취소 후 재등록 참고용) */}
      <CampaignInputCard
        fields={{
          keyword: c.keyword,
          naverPlaceUrl: c.naverPlaceUrl,
          couponContent: c.couponContent,
          couponCode: c.couponCode,
          couponAmount: c.couponAmount,
          couponValidUntil: c.couponValidUntil,
          ownerPhone: c.ownerPhone,
        }}
      />

      {/* 테스트 발송 */}
      <Card className="p-5 mb-4">
        <div className="text-[15px] font-semibold text-neutral-800 mb-1">테스트 발송</div>
        <p className="text-sm text-neutral-400 mb-3">입력한 번호로 실제와 똑같은 알림톡 1건을 즉시 보냅니다. (발송 대상·회차·결제와 무관)</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 border border-neutral-300 rounded-lg px-3.5 py-3 text-base min-h-12"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="받을 휴대폰 번호 (예: 01012345678)"
            inputMode="numeric"
          />
          <Button type="button" variant="secondary" size="lg" className="shrink-0" onClick={sendTest} disabled={testSending}>
            {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : '테스트 발송'}
          </Button>
        </div>
        {testMsg && <p className={`text-sm mt-2 ${testMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>}
      </Card>

      {/* 성과 요약 + 주차별 리포트 (공용) */}
      <BoosterReport
        totals={report.totals}
        rows={report.rows}
        fetcher={authFetch}
        apiPrefix="/api/place-booster"
        reload={reload}
      />

      {showPay && (
        <PaymentModal
          campaignId={c.id}
          authFetch={authFetch}
          onClose={() => setShowPay(false)}
          onPaid={reload}
          setError={setError}
        />
      )}
    </div>
  );
}

/* ---------------- 결제 모달 ---------------- */
function PaymentModal({
  campaignId,
  authFetch,
  onClose,
  onPaid,
  setError,
}: {
  campaignId: string;
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onPaid: () => void;
  setError: (s: string) => void;
}) {
  const [method, setMethod] = useState<'choice' | 'card'>('choice');
  const [processing, setProcessing] = useState(false);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const payCredit = async () => {
    setProcessing(true);
    try {
      const res = await authFetch(`/api/place-booster/campaigns/${campaignId}/pay/credit`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        trackEvent('owner_booster_payment', { method: 'credit' });
        onClose();
        onPaid();
      } else setError(d.error || '결제에 실패했습니다.');
    } catch {
      setError('네트워크 오류로 결제에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const requestBank = async () => {
    setProcessing(true);
    try {
      const res = await authFetch(`/api/place-booster/campaigns/${campaignId}/pay/bank-transfer`, { method: 'POST' });
      if (res.ok) {
        trackEvent('owner_booster_payment', { method: 'bank' });
        onClose();
        onPaid();
      } else setError('요청에 실패했습니다.');
    } catch {
      setError('네트워크 오류로 요청에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  // 카드: 위젯 초기화 (DOM 컨테이너 마운트 대기 + 정리)
  useEffect(() => {
    if (method !== 'card' || !TOSS_CLIENT_KEY) return;
    let cancelled = false;
    const clearContainers = () => {
      const pm = document.getElementById('pb-payment-methods');
      const ag = document.getElementById('pb-agreement');
      if (pm) pm.innerHTML = '';
      if (ag) ag.innerHTML = '';
    };
    (async () => {
      try {
        // 컨테이너가 커밋될 때까지 폴링 (최대 2초)
        let pm = document.getElementById('pb-payment-methods');
        let ag = document.getElementById('pb-agreement');
        let tries = 0;
        while ((!pm || !ag) && tries < 20 && !cancelled) {
          await new Promise((r) => setTimeout(r, 100));
          pm = document.getElementById('pb-payment-methods');
          ag = document.getElementById('pb-agreement');
          tries++;
        }
        if (cancelled || !pm || !ag) return;
        pm.innerHTML = '';
        ag.innerHTML = '';
        const toss = await loadTossPayments(TOSS_CLIENT_KEY);
        const widgets = toss.widgets({ customerKey: `PB_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` });
        await widgets.setAmount({ currency: 'KRW', value: BOOSTER_PRICE });
        await widgets.renderPaymentMethods({ selector: '#pb-payment-methods', variantKey: 'DEFAULT' });
        await widgets.renderAgreement({ selector: '#pb-agreement', variantKey: 'AGREEMENT' });
        if (!cancelled) {
          widgetsRef.current = widgets;
          setCardReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError('카드 결제 위젯 로딩에 실패했습니다.');
        }
      }
    })();
    return () => {
      cancelled = true;
      widgetsRef.current = null;
      setCardReady(false);
      clearContainers();
    };
  }, [method, setError]);

  const payCard = async () => {
    if (!widgetsRef.current) return;
    setProcessing(true);
    try {
      const startRes = await authFetch(`/api/place-booster/campaigns/${campaignId}/pay/card/start`, { method: 'POST' });
      const { orderId } = await startRes.json();
      await widgetsRef.current.requestPayment({
        orderId,
        orderName: '네이버 플레이스 부스터',
        successUrl: `${window.location.origin}/place-booster?pbCampaign=${campaignId}`,
        failUrl: `${window.location.origin}/place-booster`,
      });
    } catch (e: any) {
      setProcessing(false);
      if (e?.code !== 'USER_CANCEL') setError('카드 결제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="네이버 플레이스 부스터 결제"
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">결제 (₩{won(BOOSTER_PRICE)} · VAT 포함)</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-neutral-400" /></button>
        </div>

        {method === 'choice' && (
          <div className="space-y-3">
            {CARD_PAYMENT_ENABLED && (
              <PayOption icon={<CreditCard className="w-5 h-5" />} title="카드 결제" desc="결제 즉시 발송이 시작됩니다" onClick={() => setMethod('card')} />
            )}
            <PayOption icon={<Wallet className="w-5 h-5" />} title="크레딧(잔액) 차감" desc="충전 잔액에서 차감 후 즉시 시작" onClick={payCredit} disabled={processing} />
            <PayOption icon={<Banknote className="w-5 h-5" />} title="계좌이체" desc="입금 확인 후 담당자 승인 시 시작" onClick={requestBank} disabled={processing} />
          </div>
        )}

        {CARD_PAYMENT_ENABLED && method === 'card' && (
          <div>
            <div id="pb-payment-methods" />
            <div id="pb-agreement" />
            <Button className="w-full mt-4" size="lg" onClick={payCard} disabled={!cardReady || processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : `₩${won(BOOSTER_PRICE)} 결제하기`}
            </Button>
            <button className="w-full text-center text-sm text-neutral-400 mt-2" onClick={() => setMethod('choice')}>
              다른 방법 선택
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PayOption({
  icon,
  title,
  desc,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 p-4 text-left hover:border-brand-800 hover:bg-brand-50 disabled:opacity-50"
    >
      <span className="text-brand-800">{icon}</span>
      <span>
        <span className="block font-medium text-neutral-900">{title}</span>
        <span className="block text-xs text-neutral-500">{desc}</span>
      </span>
    </button>
  );
}
