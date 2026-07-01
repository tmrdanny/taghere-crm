'use client';

/**
 * 플레이스 부스터 캠페인 생성 폼 (사장님/운영자 공용)
 *
 * 사장님 페이지와 운영자(어드민) 페이지가 동일한 2단 레이아웃(좌: 입력 / 우: 알림톡 미리보기)을 공유한다.
 * 운영자 전용 기능(매장 선택 / 외부 고객)은 renderTarget + getTargetPayload 로 주입한다.
 */

import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Rocket, Ticket, Calendar, ChevronLeft, Loader2, ExternalLink, Store } from 'lucide-react';
import { buildBoosterSearchUrl } from '@/lib/booster-link';
import { Button } from '@/components/ui/button';

const KST_OFFSET = 9 * 60 * 60 * 1000;

export const PRESETS = [
  { key: '1000x5', label: '1,000명 × 5주', perBatchCount: 1000, totalWeeks: 5 },
  { key: '500x10', label: '500명 × 10주', perBatchCount: 500, totalWeeks: 10 },
];

// JS getDay 기준: 일=0 ~ 토=6
export const WEEKDAYS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

function previewDates(weekday: number, sendTime: string, totalWeeks: number): Date[] {
  if (!/^\d{2}:\d{2}$/.test(sendTime)) return [];
  const [hh, mm] = sendTime.split(':').map((v) => parseInt(v, 10));
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const dayDiff = (weekday - nowKst.getUTCDay() + 7) % 7;
  let firstKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + dayDiff, hh, mm));
  if (firstKst.getTime() <= nowKst.getTime()) firstKst = new Date(firstKst.getTime() + 7 * 864e5);
  return Array.from({ length: totalWeeks }, (_, i) => new Date(firstKst.getTime() + i * 7 * 864e5 - KST_OFFSET));
}

export function fmtDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const kst = new Date(date.getTime() + KST_OFFSET);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${'일월화수목금토'[kst.getUTCDay()]})`;
}

/** DateTime(ISO) → 'YYYY-MM-DD' (KST 기준, date input 프리필용) */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET);
  return kst.toISOString().slice(0, 10);
}

/** 발송일 + 시각 (KST) 예: 7/1(수) 18:00 */
export function fmtDateTime(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const kst = new Date(date.getTime() + KST_OFFSET);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${'일월화수목금토'[kst.getUTCDay()]}) ${hh}:${mm}`;
}

export interface BoosterTargetResult {
  ok: boolean;
  error?: string;
  payload?: Record<string, unknown>; // 예: { storeId } 또는 { campaignName }
}

/** 수정(edit) 모드 프리필 값 */
export interface BoosterFormValues {
  keyword: string;
  naverPlaceUrl: string;
  placeId: string;
  placeName?: string;
  placeAddress?: string | null;
  couponContent: string;
  couponCode: string;
  couponAmount: string;
  couponValidUntil: string; // 'YYYY-MM-DD'
  ownerPhone: string;
  weekday: number;
  sendTime: string;
  perBatchCount: number;
  totalWeeks: number;
}

export interface BoosterCreateFormProps {
  apiPrefix: string; // '/api/place-booster' | '/api/admin/place-booster'
  fetcher: (p: string, init?: RequestInit) => Promise<Response>;
  onBack: () => void;
  onCreated?: (id: string) => void; // create 완료 콜백 (edit 모드는 onSaved 사용)
  submitLabel: string; // 준비됐을 때 CTA 문구
  submitNote?: React.ReactNode; // CTA 아래 안내문
  storeInfoEndpoint?: string; // 사장님: 매장 연락처로 사장님 번호 프리필
  prefillPhone?: string; // 운영자: 선택한 매장 연락처로 프리필
  renderTarget?: () => React.ReactNode; // 운영자: 매장 선택 / 외부 고객 UI
  getTargetPayload?: () => BoosterTargetResult; // 운영자: storeId/campaignName 검증·payload
  mode?: 'create' | 'edit'; // 기본 create
  campaignId?: string; // edit 모드: 대상 캠페인 id
  initialValues?: BoosterFormValues; // edit 모드: 프리필 값
  onSaved?: (id: string) => void; // edit 모드 저장 완료 콜백 (없으면 onCreated)
}

export function BoosterCreateForm({
  apiPrefix,
  fetcher,
  onBack,
  onCreated,
  submitLabel,
  submitNote,
  storeInfoEndpoint,
  prefillPhone,
  renderTarget,
  getTargetPayload,
  mode = 'create',
  campaignId,
  initialValues: iv,
  onSaved,
}: BoosterCreateFormProps) {
  const isEdit = mode === 'edit' && !!campaignId;
  const [keyword, setKeyword] = useState(iv?.keyword ?? '');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState(iv?.naverPlaceUrl ?? '');
  // edit: 저장된 placeId로 placeInfo 시드 → 재검증 없이 제출 가능(주소는 비어도 백엔드가 placeId 동일 시 지역 유지)
  const [placeInfo, setPlaceInfo] = useState<{ placeId: string; name: string; category: string | null; address: string | null } | null>(
    iv?.placeId ? { placeId: iv.placeId, name: iv.placeName ?? '', category: null, address: iv.placeAddress ?? null } : null
  );
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState('');
  const [couponContent, setCouponContent] = useState(iv?.couponContent ?? '');
  const [couponCode, setCouponCode] = useState(iv?.couponCode ?? '');
  const [couponAmount, setCouponAmount] = useState(iv?.couponAmount ?? '');
  const [couponValidUntil, setCouponValidUntil] = useState(iv?.couponValidUntil ?? '');
  const [ownerPhone, setOwnerPhone] = useState(iv?.ownerPhone ?? '');
  const [preset, setPreset] = useState(
    () => PRESETS.find((p) => p.perBatchCount === iv?.perBatchCount && p.totalWeeks === iv?.totalWeeks) ?? PRESETS[0]
  );
  const [weekday, setWeekday] = useState(iv?.weekday ?? 2);
  const [sendTime, setSendTime] = useState(iv?.sendTime ?? '18:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  // 사장님 번호 자동 채우기(매장 연락처) — 수정 가능, 비어있을 때만
  useEffect(() => {
    if (!storeInfoEndpoint) return;
    fetcher(storeInfoEndpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.phone) setOwnerPhone((prev) => prev || d.phone); })
      .catch(() => {});
  }, [storeInfoEndpoint, fetcher]);

  useEffect(() => {
    if (prefillPhone) setOwnerPhone((prev) => prev || prefillPhone);
  }, [prefillPhone]);

  const dates = previewDates(weekday, sendTime, preset.totalWeeks);
  const linkPreview = keyword.trim() && placeInfo ? buildBoosterSearchUrl(keyword.trim(), placeInfo.placeId) : '';

  const verifyPlace = async () => {
    setVerifyErr('');
    setError('');
    if (!naverPlaceUrl.trim()) { setVerifyErr('플레이스 URL을 입력해주세요.'); return; }
    setVerifying(true);
    try {
      const res = await fetcher(`${apiPrefix}/verify-place`, { method: 'POST', body: JSON.stringify({ url: naverPlaceUrl }) });
      const d = await res.json();
      if (res.ok) setPlaceInfo(d);
      else { setPlaceInfo(null); setVerifyErr(d.error || '매장 정보를 확인하지 못했습니다.'); }
    } catch { setVerifyErr('네트워크 오류가 발생했습니다.'); }
    finally { setVerifying(false); }
  };

  const sendTestPreview = async () => {
    setTestMsg('');
    if (!testPhone.trim()) { setTestMsg('테스트로 받을 번호를 입력해주세요.'); return; }
    setTestSending(true);
    try {
      const res = await fetcher(`${apiPrefix}/test-send-preview`, {
        method: 'POST',
        body: JSON.stringify({ phone: testPhone, keyword, naverPlaceUrl, couponContent, couponCode, couponAmount, couponValidUntil }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) trackEvent('owner_booster_test_send', { stage: 'preview' });
      setTestMsg(res.ok ? '✓ 테스트 알림톡을 발송했어요. 카카오톡을 확인해보세요.' : d.error || '발송에 실패했습니다.');
    } catch { setTestMsg('네트워크 오류가 발생했습니다.'); }
    finally { setTestSending(false); }
  };

  const submit = async () => {
    setError('');
    let targetPayload: Record<string, unknown> = {};
    if (getTargetPayload) {
      const t = getTargetPayload();
      if (!t.ok) { setError(t.error || '대상을 확인해주세요.'); return; }
      targetPayload = t.payload || {};
    }
    if (!placeInfo) { setError('매장 정보 확인을 먼저 해주세요.'); return; }
    if (!keyword.trim() || !couponContent.trim() || !couponCode.trim() || !couponAmount.trim() || !couponValidUntil || !ownerPhone.trim()) {
      setError('키워드, 쿠폰 내용/코드/금액, 유효기간, 사장님 번호를 모두 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetcher(
        isEdit ? `${apiPrefix}/campaigns/${campaignId}` : `${apiPrefix}/campaigns`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...targetPayload,
            keyword,
            naverPlaceUrl,
            placeAddress: placeInfo.address,
            couponContent,
            couponCode,
            couponAmount,
            couponValidUntil,
            ownerPhone,
            weekday,
            sendTime,
            perBatchCount: preset.perBatchCount,
            totalWeeks: preset.totalWeeks,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || (isEdit ? '수정에 실패했습니다.' : '생성에 실패했습니다.')); return; }
      if (isEdit) {
        (onSaved ?? onCreated)?.(data.id ?? campaignId!);
      } else {
        trackEvent('owner_booster_create', { keyword, total_target_count: preset.perBatchCount * preset.totalWeeks });
        onCreated?.(data.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-0.5 text-[15px] text-neutral-500 hover:text-neutral-700 mb-5">
        <ChevronLeft className="w-5 h-5" /> 목록으로
      </button>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      <div className="grid lg:grid-cols-[1fr,340px] gap-6 items-start">
        <div className="space-y-5">
          {/* (운영자 전용) 대상 매장 / 외부 고객 */}
          {renderTarget && (
            <Section icon={Store} title="대상" desc="기존 매장을 선택하거나 외부 고객으로 진행하세요">
              {renderTarget()}
            </Section>
          )}

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
                  onChange={(e) => { setNaverPlaceUrl(e.target.value); setPlaceInfo(null); setVerifyErr(''); }}
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
                  {placeInfo.name || '저장된 플레이스 정보'}
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
                <a href={linkPreview} target="_blank" rel="noopener noreferrer" className="block text-sm text-brand-800 underline break-all mb-3">{linkPreview}</a>
                <a href={linkPreview} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button type="button" variant="secondary" size="sm">링크 열어서 확인 <ExternalLink className="w-4 h-4 ml-1" /></Button>
                </a>
              </div>
            )}
          </Section>

          {/* ② 쿠폰 */}
          <Section icon={Ticket} title="쿠폰" desc="네이버 플레이스에 등록한 쿠폰을 안내해요">
            <Field label="쿠폰 내용">
              <textarea className="input" rows={3} value={couponContent} onChange={(e) => setCouponContent(e.target.value)} placeholder="예: 성수 곱도리탕 맛집 다주막의 10% 할인" />
            </Field>
            <Field label="쿠폰 코드">
              <input className="input" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="예: 다주막 네이버 쿠폰" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="쿠폰 금액">
                <input className="input" value={couponAmount} onChange={(e) => setCouponAmount(e.target.value)} placeholder="예: 10% 할인" />
              </Field>
              <Field label="유효기간">
                <input type="date" className="input cursor-pointer" value={couponValidUntil} onChange={(e) => setCouponValidUntil(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
              </Field>
            </div>
            <Field label="사장님 번호" hint="발송 때마다 이 번호로도 동일 알림톡이 전송됩니다 (사장님 확인용)">
              <input className="input" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="예: 010-1234-5678" inputMode="tel" />
            </Field>
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
                      preset.key === p.key ? 'border-brand-800 bg-brand-50 text-brand-800' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
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

          {/* 생성 전 테스트 발송 */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[15px] font-semibold text-neutral-800 mb-1">생성 전 테스트 발송</div>
            <p className="text-sm text-neutral-400 mb-3">지금 입력한 내용 그대로 알림톡 1건을 받아볼 수 있어요. (캠페인 생성·결제 전)</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input flex-1"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="받을 휴대폰 번호 (예: 01012345678)"
                inputMode="numeric"
              />
              <Button type="button" variant="secondary" size="lg" className="shrink-0" onClick={sendTestPreview} disabled={testSending}>
                {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : '테스트 발송'}
              </Button>
            </div>
            {testMsg && <p className={`text-sm mt-2 ${testMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>}
          </div>

          <Button className="w-full" size="lg" onClick={submit} disabled={submitting || !placeInfo}>
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : !placeInfo ? '매장 정보 확인 필요' : submitLabel}
          </Button>
          {submitNote && <p className="text-sm text-neutral-400">{submitNote}</p>}
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
  const COUPON_GUIDE = '쿠폰 다운받기 > 네이버 길찾기 앱 진입 후 하단 스크롤 > 네이버 쿠폰 다운로드 > 매장 방문시 직원에게 보여주세요.';
  const contentText = couponContent.trim() || '{쿠폰 내용}';
  const codeText = couponCode.trim() || '{쿠폰 코드}';
  const amountText = couponAmount.trim() || '{쿠폰 금액}';
  const validBase = couponValidUntil ? `${couponValidUntil.replace(/-/g, '.')}까지` : '{유효기간}';
  const validText = `${validBase}\n\n${COUPON_GUIDE}`;

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
                        <p className="text-xs text-neutral-700 mb-3 whitespace-pre-line">
                          <span className="font-semibold">{contentText}</span> 쿠폰이 도착했어요.
                        </p>
                        <div className="space-y-1 mb-3">
                          <p className="text-xs text-neutral-700 whitespace-pre-line">▶ 쿠폰 코드: {codeText}</p>
                          <p className="text-xs text-neutral-700 whitespace-pre-line">▶ 쿠폰: {amountText}</p>
                          <p className="text-xs text-neutral-700 whitespace-pre-line">▶ 유효기간: {validText}</p>
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
