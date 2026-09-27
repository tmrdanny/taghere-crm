'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Rocket, ChevronLeft, Info, Wallet, Banknote, X, Loader2, Check } from 'lucide-react';
import { BoosterCreateForm, validUntilText, BoosterTargetResult } from '@/components/place-booster/booster-create-form';
import { BoosterReport, CampaignInputCard } from '@/components/place-booster/booster-report';

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
    couponValidUntil: string | null; couponValidUntilText: string | null;
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
  DRAFT: { label: '결제 대기', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  SCHEDULED: { label: '발송 예정', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  RUNNING: { label: '발송 중', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  COMPLETED: { label: '완료', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  CANCELLED: { label: '취소됨', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
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
      className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-ink)] focus:outline-none"
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      <div className="mb-5 flex items-center gap-2">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">네이버 플레이스 부스터</h1>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[12px] bg-[#fff2f5] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
          <Info className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} /> {error}
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
            couponValidUntilText: validUntilText(report.campaign),
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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-[color:var(--ad-muted)]">
          하위 매장을 선택해 인근 신규 고객에게 알림톡으로 쿠폰을 보내고 네이버 플레이스 유입을 높입니다.
        </p>
        <button onClick={onCreate} className="shrink-0 ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
          <Rocket className="h-4 w-4" strokeWidth={1.8} /> 새 캠페인
        </button>
      </div>
      {loading && <p className="text-[13px] text-[color:var(--ad-faint)]">불러오는 중…</p>}
      {!loading && campaigns.length === 0 && (
        <div className="ad-card p-12 text-center text-[13px] text-[color:var(--ad-faint)]">
          아직 캠페인이 없습니다. 첫 캠페인을 만들어보세요.
        </div>
      )}
      <div className="space-y-3">
        {campaigns.map((c) => {
          const st = STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT;
          const sent = (c.batches || []).filter((b) => b.status === 'SENT').length;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              className="ad-card flex cursor-pointer items-center justify-between gap-3 p-5 transition-colors hover:bg-[color:var(--ad-bg-alt)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ad-ink)]"
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
                  <span className="text-[15px] font-semibold text-[color:var(--ad-ink)]">{c.keyword}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  {c.paymentStatus === 'PENDING_APPROVAL' && (
                    <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">입금 확인 대기</span>
                  )}
                </div>
                <div className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
                  {c.storeName && <span className="font-medium text-[color:var(--ad-ink-2)]">{c.storeName}</span>}
                  {c.storeName && ' · '}
                  {c.perBatchCount.toLocaleString()}명 × {c.totalWeeks}주 · 진행 {sent}/{c.totalWeeks}주차
                </div>
              </div>
              <ChevronLeft className="h-5 w-5 shrink-0 rotate-180 text-[color:var(--ad-faint)]" />
            </div>
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
        <button onClick={onBack} className="inline-flex items-center gap-0.5 text-[13px] text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]">
          <ChevronLeft className="h-4 w-4" /> 목록으로
        </button>
        {c.status === 'DRAFT' && (
          <button onClick={onEdit} className="ad-press inline-flex h-8 items-center justify-center gap-1 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40">
            수정
          </button>
        )}
      </div>

      <div className="ad-card mb-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[color:var(--ad-ink)]">{c.keyword}</h2>
            {c.storeName && <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">{c.storeName}</p>}
            <p className="mt-1 text-[13.5px] text-[color:var(--ad-ink-2)]">{c.couponContent}</p>
            <div className="ad-tnum mt-1 text-[12.5px] text-[color:var(--ad-faint)]">
              {c.perBatchCount.toLocaleString()}명 × {c.totalWeeks}주 (총 {c.totalTargetCount.toLocaleString()}명)
            </div>
          </div>
          <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${(STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT).cls}`}>
            {(STATUS_LABEL[c.status] || STATUS_LABEL.DRAFT).label}
          </span>
        </div>

        {needsPayment && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
            <Info className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
            {c.paymentStatus === 'PENDING_APPROVAL'
              ? '계좌이체 입금 확인 후 담당자가 승인하면 발송이 시작됩니다.'
              : '결제가 완료되어야 발송이 시작됩니다.'}
            {c.status === 'DRAFT' && c.paymentStatus !== 'PENDING_APPROVAL' && (
              <button onClick={() => setShowPay(true)} className="ml-auto ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
                결제하기
              </button>
            )}
          </div>
        )}
      </div>

      <CampaignInputCard
        fields={{
          keyword: c.keyword,
          naverPlaceUrl: c.naverPlaceUrl,
          couponContent: c.couponContent,
          couponCode: c.couponCode,
          couponAmount: c.couponAmount,
          couponValidUntil: c.couponValidUntil,
          couponValidUntilText: c.couponValidUntilText,
          ownerPhone: c.ownerPhone,
        }}
      />

      <div className="ad-card mb-4 p-5">
        <div className="mb-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">테스트 발송</div>
        <p className="mb-3 text-[12px] text-[color:var(--ad-faint)]">입력한 번호로 실제와 똑같은 알림톡 1건을 즉시 보냅니다. (발송 대상·회차·결제와 무관)</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="h-10 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="받을 휴대폰 번호 (예: 01012345678)"
            inputMode="numeric"
          />
          <button type="button" onClick={sendTest} disabled={testSending} className="shrink-0 ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40">
            {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : '테스트 발송'}
          </button>
        </div>
        {testMsg && <p className={`mt-2 flex items-center gap-1.5 text-[13px] ${testMsg.startsWith('✓') ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'}`}>{testMsg.startsWith('✓') && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}{testMsg.replace(/^✓\s*/, '')}</p>}
      </div>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="네이버 플레이스 부스터 결제"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[20px] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] font-semibold text-[color:var(--ad-ink)]">결제 (₩{won(BOOSTER_PRICE)} · VAT 포함)</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-[color:var(--ad-faint)]" />
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
      className="ad-press flex w-full items-center gap-3 rounded-[14px] border border-[color:var(--ad-line-strong)] bg-white p-4 text-left transition-colors hover:border-[color:var(--ad-ink)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50"
    >
      <span className="text-[color:var(--ad-faint)]">{icon}</span>
      <span>
        <span className="block text-[14px] font-medium text-[color:var(--ad-ink)]">{title}</span>
        <span className="block text-[12px] text-[color:var(--ad-muted)]">{desc}</span>
      </span>
    </button>
  );
}
