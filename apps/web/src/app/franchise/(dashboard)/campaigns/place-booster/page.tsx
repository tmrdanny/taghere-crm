'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Rocket, ChevronLeft, Info, Wallet, Banknote, X, Loader2 } from 'lucide-react';
import { BoosterCreateForm, toDateInput, BoosterTargetResult } from '@/components/place-booster/booster-create-form';
import { BoosterReport, CampaignInputCard } from '@/components/place-booster/booster-report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const BOOSTER_PRICE = 544500;
const API_PREFIX = '/api/franchise/place-booster';

const getAuthToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('franchiseToken') || 'dev-token' : 'dev-token';

interface SubStore {
  id: string;
  name: string;
  phone?: string | null;
}
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
  storeName?: string | null;
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

const won = (n: number) => n.toLocaleString('ko-KR');

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '결제 대기', cls: 'bg-neutral-100 text-neutral-600' },
  SCHEDULED: { label: '발송 예정', cls: 'bg-blue-100 text-blue-700' },
  RUNNING: { label: '발송 중', cls: 'bg-green-100 text-green-700' },
  COMPLETED: { label: '완료', cls: 'bg-neutral-200 text-neutral-700' },
  CANCELLED: { label: '취소됨', cls: 'bg-red-100 text-red-600' },
};

export default function FranchisePlaceBoosterPage() {
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'edit'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 하위 매장 선택
  const [subStores, setSubStores] = useState<SubStore[]>([]);
  const [selectedSubStoreId, setSelectedSubStoreId] = useState('');

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
      const res = await authFetch(`${API_PREFIX}/campaigns`);
      if (res.ok) setCampaigns(await res.json());
      else setError('캠페인 목록을 불러오지 못했습니다.');
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
        const res = await authFetch(`${API_PREFIX}/campaigns/${id}`);
        if (res.ok) {
          setReport(await res.json());
          setView('detail');
        } else setError('캠페인을 불러오지 못했습니다.');
      } catch {
        setError('네트워크 오류로 캠페인을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // 하위 매장 목록
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/franchise/stores');
        if (res.ok) {
          const data = await res.json();
          const list: SubStore[] = (data.stores || data || []).map((s: any) => ({ id: s.id, name: s.name, phone: s.phone }));
          setSubStores(list);
          if (list.length > 0) setSelectedSubStoreId((prev) => prev || list[0].id);
        }
      } catch {
        /* noop */
      }
    })();
  }, [authFetch]);

  const selectedStorePhone = subStores.find((s) => s.id === selectedSubStoreId)?.phone || '';

  const renderSubStoreSelect = () => (
    <select
      value={selectedSubStoreId}
      onChange={(e) => setSelectedSubStoreId(e.target.value)}
      className="w-full px-4 py-3 border border-neutral-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {subStores.length === 0 && <option value="">등록된 매장이 없습니다</option>}
      {subStores.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );

  const getTargetPayload = (): BoosterTargetResult =>
    selectedSubStoreId
      ? { ok: true, payload: { subStoreId: selectedSubStoreId } }
      : { ok: false, error: '캠페인을 진행할 하위 매장을 선택해주세요.' };

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

      {view === 'list' && (
        <ListView campaigns={campaigns} loading={loading} onCreate={() => setView('create')} onOpen={openDetail} />
      )}
      {view === 'create' && (
        <BoosterCreateForm
          apiPrefix={API_PREFIX}
          fetcher={authFetch}
          prefillPhone={selectedStorePhone}
          renderTarget={renderSubStoreSelect}
          getTargetPayload={getTargetPayload}
          submitLabel="캠페인 생성 후 결제"
          onBack={() => setView('list')}
          onCreated={async (id) => {
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
          apiPrefix={API_PREFIX}
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
          submitNote="결제 전 캠페인만 수정됩니다. 발송 일정·인원 변경 시 회차가 재생성됩니다."
          onBack={() => setView('detail')}
          onSaved={async (id) => {
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
  loading,
  onCreate,
  onOpen,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-start gap-4 mb-5">
        <p className="text-[15px] text-neutral-500 leading-relaxed">
          하위 매장을 선택해 인근 신규 고객에게 알림톡으로 쿠폰을 보내고 네이버 플레이스 유입을 높입니다.
        </p>
        <Button size="lg" className="shrink-0" onClick={onCreate}>
          <Rocket className="w-4 h-4 mr-1.5" /> 새 캠페인
        </Button>
      </div>
      {loading && <p className="text-[15px] text-neutral-400">불러오는 중…</p>}
      {!loading && campaigns.length === 0 && (
        <Card className="p-12 text-center text-[15px] text-neutral-500">
          아직 캠페인이 없습니다. 첫 캠페인을 만들어보세요.
        </Card>
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
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">입금 확인 대기</span>
                  )}
                </div>
                <div className="text-sm text-neutral-500 mt-1.5">
                  {c.storeName && <span className="text-neutral-700 font-medium">{c.storeName}</span>}
                  {c.storeName && ' · '}
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
    if (!testPhone.trim()) {
      setTestMsg('테스트로 받을 번호를 입력해주세요.');
      return;
    }
    setTestSending(true);
    try {
      const res = await authFetch(`${API_PREFIX}/campaigns/${c.id}/test-send`, {
        method: 'POST',
        body: JSON.stringify({ phone: testPhone }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) trackEvent('franchise_booster_test_send', { stage: 'campaign' });
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
        {c.status === 'DRAFT' && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            수정
          </Button>
        )}
      </div>

      <Card className="p-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{c.keyword}</h2>
            {c.storeName && <p className="text-sm text-neutral-500 mt-0.5">{c.storeName}</p>}
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

      <BoosterReport totals={report.totals} rows={report.rows} fetcher={authFetch} apiPrefix={API_PREFIX} reload={reload} />

      {showPay && (
        <PaymentModal campaignId={c.id} authFetch={authFetch} onClose={() => setShowPay(false)} onPaid={reload} setError={setError} />
      )}
    </div>
  );
}

/* ---------------- 결제 모달 (프랜차이즈 지갑 크레딧 / 계좌이체) ---------------- */
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
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const payCredit = async () => {
    setProcessing(true);
    try {
      const res = await authFetch(`${API_PREFIX}/campaigns/${campaignId}/pay/credit`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        trackEvent('franchise_booster_payment', { method: 'credit' });
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
      const res = await authFetch(`${API_PREFIX}/campaigns/${campaignId}/pay/bank-transfer`, { method: 'POST' });
      if (res.ok) {
        trackEvent('franchise_booster_payment', { method: 'bank' });
        onClose();
        onPaid();
      } else setError('요청에 실패했습니다.');
    } catch {
      setError('네트워크 오류로 요청에 실패했습니다.');
    } finally {
      setProcessing(false);
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
          <button onClick={onClose}>
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        <div className="space-y-3">
          <PayOption
            icon={<Wallet className="w-5 h-5" />}
            title="크레딧(잔액) 차감"
            desc="프랜차이즈 잔액에서 차감 후 즉시 시작"
            onClick={payCredit}
            disabled={processing}
          />
          <PayOption
            icon={<Banknote className="w-5 h-5" />}
            title="계좌이체"
            desc="입금 확인 후 담당자 승인 시 시작"
            onClick={requestBank}
            disabled={processing}
          />
        </div>
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
