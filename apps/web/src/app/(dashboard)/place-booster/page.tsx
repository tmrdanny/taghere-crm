'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import {
  Rocket,
  ChevronLeft,
  Info,
  Calendar,
  Ticket,
  CreditCard,
  Wallet,
  Banknote,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { buildBoosterSearchUrl } from '@/lib/booster-link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';
const BOOSTER_PRICE = 544500;
// 카드 결제(토스 위젯)는 잠시 보류 — 크레딧/계좌이체만 노출. 재개하려면 true로.
const CARD_PAYMENT_ENABLED = false;

const PRESETS = [
  { key: '1000x5', label: '1,000명 × 5주', perBatchCount: 1000, totalWeeks: 5 },
  { key: '500x10', label: '500명 × 10주', perBatchCount: 500, totalWeeks: 10 },
];

// JS getDay 기준: 일=0 ~ 토=6
const WEEKDAYS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

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

const KST_OFFSET = 9 * 60 * 60 * 1000;
function previewDates(weekday: number, sendTime: string, totalWeeks: number): Date[] {
  if (!/^\d{2}:\d{2}$/.test(sendTime)) return [];
  const [hh, mm] = sendTime.split(':').map((v) => parseInt(v, 10));
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const dayDiff = (weekday - nowKst.getUTCDay() + 7) % 7;
  let firstKst = new Date(
    Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + dayDiff, hh, mm)
  );
  if (firstKst.getTime() <= nowKst.getTime()) firstKst = new Date(firstKst.getTime() + 7 * 864e5);
  return Array.from({ length: totalWeeks }, (_, i) => new Date(firstKst.getTime() + i * 7 * 864e5 - KST_OFFSET));
}
function fmtDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const kst = new Date(date.getTime() + KST_OFFSET);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${'일월화수목금토'[kst.getUTCDay()]})`;
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
        <CreateView
          authFetch={authFetch}
          onBack={() => setView('list')}
          onCreated={async (id) => {
            await loadCampaigns();
            await openDetail(id);
          }}
          setError={setError}
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

/* ---------------- 생성 ---------------- */
function CreateView({
  authFetch,
  onBack,
  onCreated,
  setError,
}: {
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  onBack: () => void;
  onCreated: (id: string) => void;
  setError: (s: string) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');
  const [placeInfo, setPlaceInfo] = useState<{ placeId: string; name: string; category: string | null; address: string | null } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState('');
  const [couponContent, setCouponContent] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponAmount, setCouponAmount] = useState('');
  const [couponValidUntil, setCouponValidUntil] = useState('');
  const [preset, setPreset] = useState(PRESETS[0]);
  const [weekday, setWeekday] = useState(2);
  const [sendTime, setSendTime] = useState('18:00');
  const [submitting, setSubmitting] = useState(false);

  const dates = previewDates(weekday, sendTime, preset.totalWeeks);
  // 키워드 + 확인된 플레이스가 모두 있으면 '쿠폰받기' 도착 링크 미리보기
  const linkPreview = keyword.trim() && placeInfo ? buildBoosterSearchUrl(keyword.trim(), placeInfo.placeId) : '';

  const verifyPlace = async () => {
    setVerifyErr('');
    setError('');
    if (!naverPlaceUrl.trim()) {
      setVerifyErr('플레이스 URL을 입력해주세요.');
      return;
    }
    setVerifying(true);
    try {
      const res = await authFetch('/api/place-booster/verify-place', {
        method: 'POST',
        body: JSON.stringify({ url: naverPlaceUrl }),
      });
      const d = await res.json();
      if (res.ok) setPlaceInfo(d);
      else {
        setPlaceInfo(null);
        setVerifyErr(d.error || '매장 정보를 확인하지 못했습니다.');
      }
    } catch {
      setVerifyErr('네트워크 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    setError('');
    if (!placeInfo) {
      setError('매장 정보 확인을 먼저 해주세요.');
      return;
    }
    if (!keyword.trim() || !couponContent.trim() || !couponCode.trim() || !couponAmount.trim() || !couponValidUntil) {
      setError('키워드, 쿠폰 내용, 쿠폰 코드, 쿠폰 금액, 유효기간을 모두 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/place-booster/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          keyword,
          naverPlaceUrl,
          placeAddress: placeInfo.address,
          couponContent,
          couponCode,
          couponAmount,
          couponValidUntil,
          weekday,
          sendTime,
          perBatchCount: preset.perBatchCount,
          totalWeeks: preset.totalWeeks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '생성에 실패했습니다.');
        return;
      }
      onCreated(data.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-0.5 text-[15px] text-neutral-500 hover:text-neutral-700 mb-5">
        <ChevronLeft className="w-5 h-5" /> 목록으로
      </button>
      <div className="grid lg:grid-cols-[1fr,340px] gap-6 items-start">
        <div className="space-y-5">
        {/* ① 매장 & 키워드 */}
        <Section icon={Rocket} title="매장 & 키워드" desc="노출할 검색 키워드와 대상 매장을 확인하세요">
          <Field label="네이버 유입 키워드" hint="예: 용산 버거 맛집">
            <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="노출시킬 검색 키워드 1개" />
          </Field>
          <Field label="매장 플레이스 URL" hint="네이버 지도에서 매장 상세 페이지 URL을 붙여넣고 '매장 정보 확인'을 눌러주세요">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input flex-1"
                value={naverPlaceUrl}
                onChange={(e) => {
                  setNaverPlaceUrl(e.target.value);
                  setPlaceInfo(null);
                  setVerifyErr('');
                }}
                placeholder="https://map.naver.com/p/.../place/..."
              />
              <Button type="button" variant="secondary" size="lg" className="shrink-0" onClick={verifyPlace} disabled={verifying}>
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : '매장 정보 확인'}
              </Button>
            </div>
          </Field>
          {verifyErr && <p className="text-sm text-red-600 -mt-1">{verifyErr}</p>}
          {placeInfo && (
            <div className="rounded-xl border border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-lg font-bold text-neutral-900">
                {placeInfo.name}
                <span className="text-sm font-medium text-green-700">✓ 확인됨</span>
              </div>
              {placeInfo.category && <div className="text-sm text-neutral-500 mt-1">{placeInfo.category}</div>}
              {placeInfo.address && <div className="text-sm text-neutral-500">{placeInfo.address}</div>}
              <div className="text-xs text-neutral-400 mt-2">이 매장이 맞는지 확인 후 진행해주세요.</div>
            </div>
          )}
          {linkPreview && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-[15px] font-semibold text-neutral-800 mb-1">쿠폰받기 링크 미리보기</div>
              <p className="text-sm text-neutral-500 mb-2">알림톡 ‘쿠폰 받기’ 버튼을 누르면 도착하는 링크예요. 직접 열어 키워드 검색·매장이 맞는지 확인해보세요.</p>
              <a href={linkPreview} target="_blank" rel="noopener noreferrer" className="block text-sm text-brand-800 underline break-all mb-3">
                {linkPreview}
              </a>
              <a href={linkPreview} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button type="button" variant="secondary" size="sm">
                  링크 열어서 확인 <ExternalLink className="w-4 h-4 ml-1" />
                </Button>
              </a>
            </div>
          )}
        </Section>

        {/* ② 쿠폰 */}
        <Section icon={Ticket} title="쿠폰" desc="네이버 플레이스에 등록한 쿠폰을 안내해요">
          <Field label="쿠폰 내용">
            <input className="input" value={couponContent} onChange={(e) => setCouponContent(e.target.value)} placeholder="예: 10,000원 할인" />
          </Field>
          <Field label="쿠폰 코드">
            <input className="input" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="예: 10,000원 할인" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="쿠폰 금액">
              <input className="input" value={couponAmount} onChange={(e) => setCouponAmount(e.target.value)} placeholder="예: 10,000원" />
            </Field>
            <Field label="유효기간">
              <input type="date" className="input cursor-pointer" value={couponValidUntil} onChange={(e) => setCouponValidUntil(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
            </Field>
          </div>
        </Section>

        {/* ③ 발송 설정 */}
        <Section icon={Calendar} title="발송 설정" desc="언제, 몇 명에게 보낼지 정하세요">
          <Field label="발송 방식">
            <div className="grid grid-cols-2 gap-3">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p)}
                  className={`rounded-xl border px-4 py-4 text-base font-semibold transition-colors ${
                    preset.key === p.key
                      ? 'border-brand-800 bg-brand-50 text-brand-800'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="발송 요일">
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setWeekday(d.value)}
                  className={`w-12 h-12 rounded-xl text-base font-medium transition-colors ${
                    weekday === d.value ? 'bg-brand-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="발송 시각">
            <input type="time" className="input w-44 cursor-pointer" value={sendTime} onChange={(e) => setSendTime(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
          </Field>
          <div className="rounded-xl bg-brand-50 p-4">
            <div className="text-base font-semibold text-neutral-800">
              발송 대상 <span className="text-brand-800">{(preset.perBatchCount * preset.totalWeeks).toLocaleString()}명</span>
              <span className="text-neutral-400"> · </span>
              매주 {WEEKDAYS.find((w) => w.value === weekday)?.label}요일 {sendTime}
            </div>
            <div className="text-sm text-neutral-500 mt-1.5">발송 예정일 · {dates.map((d) => fmtDate(d)).join(' · ')}</div>
          </div>
        </Section>

          <Button className="w-full" size="lg" onClick={submit} disabled={submitting || !placeInfo}>
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : !placeInfo ? '매장 정보 확인 필요' : '캠페인 생성 후 결제'}
          </Button>
        </div>
        <div className="lg:sticky lg:top-6">
          <p className="text-center text-[15px] font-semibold text-neutral-500 mb-3">알림톡 미리보기</p>
          <AlimtalkPreview couponContent={couponContent} couponCode={couponCode} couponAmount={couponAmount} couponValidUntil={couponValidUntil} />
          <p className="text-center text-xs text-neutral-400 mt-3">실제 발송되는 알림톡과 동일한 형식입니다.</p>
        </div>
      </div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #d4d4d4;
          border-radius: 0.625rem;
          padding: 0.75rem 0.875rem;
          font-size: 1rem;
          min-height: 3rem;
          color: #171717;
        }
        :global(.input::placeholder) {
          color: #a3a3a3;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #737373;
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-neutral-900 leading-tight">{title}</h2>
          {desc && <p className="text-sm text-neutral-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[15px] font-semibold text-neutral-800 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-sm text-neutral-400 mt-1.5">{hint}</p>}
    </div>
  );
}

/** 카카오 알림톡 미리보기 (실제 발송되는 템플릿 UG_5628 형식과 동일) */
function AlimtalkPreview({
  couponContent,
  couponCode,
  couponAmount,
  couponValidUntil,
}: {
  couponContent: string;
  couponCode: string;
  couponAmount: string;
  couponValidUntil: string;
}) {
  // 입력 필드 ↔ 미리보기 변수 1:1 매핑 (값이 비면 {필드명}으로 표시)
  const contentText = couponContent.trim() || '{쿠폰 내용}';
  const codeText = couponCode.trim() || '{쿠폰 코드}';
  const amountText = couponAmount.trim() || '{쿠폰 금액}';
  const validText = couponValidUntil ? `${couponValidUntil.replace(/-/g, '.')}까지` : '{유효기간}';

  const now = new Date();
  return (
    <div className="flex justify-center">
      <div className="relative w-72 h-[580px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
        <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
          <div className="w-full h-full bg-[#B2C7D9] rounded-[1.75rem] overflow-hidden flex flex-col relative">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />
            <div className="flex items-center justify-between px-4 pt-10 pb-2">
              <ChevronLeft className="w-4 h-4 text-neutral-700" />
              <span className="font-medium text-xs text-neutral-800">태그히어 플레이스</span>
              <span className="text-base leading-none text-neutral-700">≡</span>
            </div>
            <div className="flex justify-center mb-3">
              <span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">
                {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="flex-1 pl-2 pr-4 overflow-auto">
              <div className="flex gap-1.5">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-neutral-300" />
                </div>
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-[10px] text-neutral-600 mb-0.5">태그히어 플레이스</p>
                  <div className="relative">
                    <div className="absolute -top-1 -right-1 z-10">
                      <span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">kakao</span>
                    </div>
                    <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                      <span className="text-xs font-medium text-neutral-800">알림톡 도착</span>
                    </div>
                    <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                      <div className="border-b border-neutral-200 px-4 py-4 text-center">
                        <div className="text-2xl mb-1">🎟️</div>
                        <div className="text-xs font-bold text-neutral-900">쿠폰 발급 완료</div>
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-xs text-neutral-700 mb-3">
                          <span className="font-semibold">{contentText}</span> 쿠폰이 도착했어요.
                        </p>
                        <div className="space-y-1 mb-3">
                          <p className="text-xs text-neutral-700">▶ 쿠폰 코드: {codeText}</p>
                          <p className="text-xs text-neutral-700">▶ 쿠폰: {amountText}</p>
                          <p className="text-xs text-neutral-700">▶ 유효기간: {validText}</p>
                        </div>
                        <p className="text-[10px] text-neutral-400 mb-3 leading-relaxed">
                          [태그히어 플레이스] 이 메시지는 고객님이 참여한 이벤트 당첨으로 지급된 쿠폰 안내 메시지입니다.
                        </p>
                        <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">
                          쿠폰 받기
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
            {c.status === 'DRAFT' && (
              <Button size="sm" className="ml-auto" onClick={() => setShowPay(true)}>
                결제하기
              </Button>
            )}
          </div>
        )}

      </Card>

      {/* 성과 요약 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat label="발송수" value={won(report.totals.sentCount)} />
        <Stat label="클릭수" value={won(report.totals.clickCount)} />
        <Stat label="클릭율" value={`${report.totals.clickRate.toFixed(1)}%`} />
        <Stat
          label="ROI"
          value={report.totals.roi == null ? '-' : `${report.totals.roi.toFixed(0)}%`}
          tooltip="ROI (투자수익률) — 광고에 쓴 비용 대비 얼마의 매출이 돌아왔는지를 나타내는 수치입니다. 100%면 쓴 비용만큼 매출이 발생한 것이고, 100%를 넘을수록 비용 대비 수익이 좋았다는 의미입니다. (예: 300%면 광고비의 3배 매출)"
        />
      </div>

      {/* 주차별 리포트 */}
      <Card className="p-0 overflow-hidden overflow-x-auto">
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

function BatchRow({
  row,
  authFetch,
  reload,
}: {
  row: ReportRow;
  authFetch: (p: string, i?: RequestInit) => Promise<Response>;
  reload: () => void;
}) {
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
