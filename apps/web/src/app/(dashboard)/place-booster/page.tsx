'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { BoosterCreateForm, fmtDate } from '@/components/place-booster/booster-create-form';
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

export default function PlaceBoosterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

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

      {view === 'list' && (
        <ListView
          campaigns={campaigns}
          loading={loading}
          onCreate={() => setView('create')}
          onOpen={openDetail}
        />
      )}
      {view === 'create' && (
        <BoosterCreateForm
          apiPrefix="/api/place-booster"
          fetcher={authFetch}
          storeInfoEndpoint="/api/place-booster/store-info"
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
          reload={() => openDetail(report.campaign.id)}
          setError={setError}
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
          매장 인근 신규 고객에게 알림톡으로 쿠폰을 보내고 네이버 플레이스 유입을 높입니다.
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
  reload,
  setError,
}: {
  report: Report;
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  onBack: () => void;
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
      setTestMsg(res.ok ? '✓ 테스트 알림톡을 발송했어요. 카카오톡을 확인해보세요.' : d.error || '발송에 실패했습니다.');
    } catch {
      setTestMsg('네트워크 오류가 발생했습니다.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-0.5 text-[15px] text-neutral-500 hover:text-neutral-700 mb-5">
        <ChevronLeft className="w-5 h-5" /> 목록으로
      </button>

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

      {/* 성과 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="발송수" value={won(report.totals.sentCount)} />
        <Stat label="클릭수" value={won(report.totals.clickCount)} />
        <Stat label="클릭율" value={`${report.totals.clickRate.toFixed(1)}%`} />
        <Stat
          label="ROI"
          value={report.totals.roi == null ? '-' : `${report.totals.roi.toFixed(0)}%`}
          tooltip="ROI (투자수익률) — 광고에 쓴 비용 대비 얼마의 매출이 돌아왔는지를 나타내는 수치입니다. 100%면 쓴 비용만큼 매출이 발생한 것이고, 100%를 넘을수록 비용 대비 수익이 좋았다는 의미입니다. (예: 300%면 광고비의 3배 매출)"
        />
      </div>

      {/* 주차별 리포트 — 데스크탑: 표 */}
      <Card className="hidden md:block p-0 overflow-hidden overflow-x-auto">
        <table className="w-full table-fixed text-[15px] whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500 text-sm">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">주차</th>
              <th className="px-3 py-3 text-left font-semibold">발송일</th>
              <th className="px-3 py-3 text-right font-semibold">발송</th>
              <th className="px-3 py-3 text-right font-semibold">클릭</th>
              <th className="px-3 py-3 text-right font-semibold">클릭율</th>
              <th className="px-3 py-3 text-right font-semibold">쿠폰사용</th>
              <th className="px-3 py-3 text-right font-semibold w-36">평균객단</th>
              <th className="px-3 py-3 text-right font-semibold w-36">매출</th>
              <th className="px-3 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <BatchRow key={`${r.batchId}:${r.couponUsedCount ?? ''}:${r.avgTicket ?? ''}`} row={r} authFetch={authFetch} reload={reload} />
            ))}
          </tbody>
        </table>
      </Card>

      {/* 주차별 리포트 — 모바일: 카드 */}
      <div className="md:hidden space-y-3">
        {report.rows.map((r) => (
          <BatchCard key={`${r.batchId}:${r.couponUsedCount ?? ''}:${r.avgTicket ?? ''}`} row={r} authFetch={authFetch} reload={reload} />
        ))}
      </div>

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

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center align-middle group/tip">
      <button type="button" aria-label={text} className="text-neutral-400 cursor-help focus:outline-none">
        <Info className="w-3.5 h-3.5" />
      </button>
      <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-60 rounded-lg bg-neutral-800 px-3 py-2 text-xs leading-relaxed text-white text-left shadow-lg group-hover/tip:block group-focus-within/tip:block">
        {text}
      </span>
    </span>
  );
}

function Stat({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-sm text-neutral-500 flex items-center justify-center gap-1">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div className="text-2xl font-bold text-neutral-900 mt-1.5">{value}</div>
    </Card>
  );
}

type BatchRowProps = {
  row: ReportRow;
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  reload: () => void;
};

// 회차 결과 편집 로직 (데스크탑 표 행 / 모바일 카드 공용)
function useBatchEdit({ row, authFetch, reload }: BatchRowProps) {
  const [editing, setEditing] = useState(false);
  const [used, setUsed] = useState(row.couponUsedCount?.toString() ?? '');
  const [avg, setAvg] = useState(row.avgTicket?.toString() ?? '');
  const liveRevenue = (Number(used) || 0) * (Number(avg) || 0); // 편집 중 매출 미리보기
  const save = async () => {
    await authFetch(`/api/place-booster/batches/${row.batchId}/results`, {
      method: 'PATCH',
      body: JSON.stringify({
        couponUsedCount: used ? parseInt(used, 10) : null,
        avgTicket: avg ? parseInt(avg, 10) : null,
      }),
    });
    setEditing(false);
    reload();
  };
  return { editing, setEditing, used, setUsed, avg, setAvg, liveRevenue, save };
}

/* 데스크탑: 표 행 */
function BatchRow(props: BatchRowProps) {
  const { row } = props;
  const { editing, setEditing, used, setUsed, avg, setAvg, liveRevenue, save } = useBatchEdit(props);

  return (
    <tr className="border-t">
      <td className="px-3 py-3">{row.weekNo}주</td>
      <td className="px-3 py-3 text-neutral-500">{fmtDate(row.scheduledAt)}</td>
      <td className="px-3 py-3 text-right">{won(row.sentCount)}</td>
      <td className="px-3 py-3 text-right">{won(row.clickCount)}</td>
      <td className="px-3 py-3 text-right">{row.clickRate.toFixed(1)}%</td>
      {editing ? (
        <>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">
              <input className="w-full h-8 border rounded px-1.5 text-right text-sm" value={used} onChange={(e) => setUsed(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">
              <input className="w-full h-8 border rounded px-1.5 text-right text-sm" value={avg} onChange={(e) => setAvg(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end text-neutral-500">{liveRevenue ? won(liveRevenue) : '-'}</div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">
              <button className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-800 text-white hover:bg-brand-900" onClick={save}>저장</button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">{row.couponUsedCount ?? '-'}</div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">{row.avgTicket ? won(row.avgTicket) : '-'}</div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">{row.revenue ? won(row.revenue) : '-'}</div>
          </td>
          <td className="px-3 py-3">
            <div className="flex h-8 items-center justify-end">
              <button className="text-xs font-medium px-2.5 py-1 rounded-lg border border-neutral-300 text-neutral-600 bg-white hover:bg-neutral-50" onClick={() => setEditing(true)}>{row.revenue ? '수정' : '입력'}</button>
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

/* 모바일: 카드 */
function BatchCard(props: BatchRowProps) {
  const { row } = props;
  const { editing, setEditing, used, setUsed, avg, setAvg, liveRevenue, save } = useBatchEdit(props);
  const Cell = ({ label, value }: { label: string; value: string | number }) => (
    <div>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-sm font-medium text-neutral-800">{value}</div>
    </div>
  );
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-base font-bold text-neutral-900">{row.weekNo}주차</span>
        <span className="text-sm text-neutral-500">{fmtDate(row.scheduledAt)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b border-neutral-100">
        <Cell label="발송" value={won(row.sentCount)} />
        <Cell label="클릭" value={won(row.clickCount)} />
        <Cell label="클릭율" value={`${row.clickRate.toFixed(1)}%`} />
      </div>
      {editing ? (
        <div className="space-y-2.5 pt-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-500">쿠폰사용</span>
            <input className="w-36 h-10 border rounded-lg px-2.5 text-right text-base" inputMode="numeric" value={used} onChange={(e) => setUsed(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-500">평균객단</span>
            <input className="w-36 h-10 border rounded-lg px-2.5 text-right text-base" inputMode="numeric" value={avg} onChange={(e) => setAvg(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">매출(예상)</span>
            <span className="font-semibold text-neutral-800">{liveRevenue ? won(liveRevenue) : '-'}</span>
          </div>
          <button className="w-full mt-1 py-3 rounded-lg bg-brand-800 text-white text-base font-semibold" onClick={save}>저장</button>
        </div>
      ) : (
        <div className="pt-3">
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <Cell label="쿠폰사용" value={row.couponUsedCount ?? '-'} />
            <Cell label="평균객단" value={row.avgTicket ? won(row.avgTicket) : '-'} />
            <Cell label="매출" value={row.revenue ? won(row.revenue) : '-'} />
          </div>
          <button className="w-full py-2.5 rounded-lg border border-neutral-300 text-neutral-600 text-sm font-medium" onClick={() => setEditing(true)}>
            {row.revenue ? '매출 수정' : '매출 입력'}
          </button>
        </div>
      )}
    </Card>
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
