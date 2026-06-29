'use client';

/**
 * 플레이스 부스터 성과 리포트 본문 (사장님/운영자 공용)
 *
 * 성과 요약(발송수/클릭/클릭율/ROI) + 주차별 표(데스크탑) / 카드(모바일).
 * 회차 결과(쿠폰사용/평균객단/매출)는 인라인 편집·저장. 저장 엔드포인트는 apiPrefix로 분기.
 */

import { useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Info, ChevronDown } from 'lucide-react';
import { fmtDateTime } from './booster-create-form';

const won = (n: number) => (n ?? 0).toLocaleString('ko-KR');

export const ROI_TOOLTIP =
  'ROI (투자수익률) — 광고에 쓴 비용 대비 얼마의 매출이 돌아왔는지를 나타내는 수치입니다. 100%면 쓴 비용만큼 매출이 발생한 것이고, 100%를 넘을수록 비용 대비 수익이 좋았다는 의미입니다. (예: 300%면 광고비의 3배 매출)';

export interface ReportRow {
  batchId: string;
  weekNo: number;
  scheduledAt: string | Date;
  status?: string;
  sentCount: number;
  clickCount: number;
  clickRate: number;
  couponUsedCount: number | null;
  avgTicket: number | null;
  revenue: number;
}

export interface ReportTotals {
  sentCount: number;
  clickCount: number;
  clickRate: number;
  roi: number | null;
  revenue?: number;
  adCost?: number;
}

export interface BoosterReportProps {
  totals: ReportTotals;
  rows: ReportRow[];
  fetcher: (p: string, init?: RequestInit) => Promise<Response>;
  apiPrefix: string; // '/api/place-booster' | '/api/admin/place-booster'
  reload: () => void;
  showAdCost?: boolean; // 광고비(ROI 기준) 라인 표시 (운영자)
}

export function BoosterReport({ totals, rows, fetcher, apiPrefix, reload, showAdCost }: BoosterReportProps) {
  return (
    <>
      {/* 성과 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="발송수" value={won(totals.sentCount)} />
        <Stat label="클릭수" value={won(totals.clickCount)} />
        <Stat label="클릭율" value={`${totals.clickRate.toFixed(1)}%`} />
        <Stat label="ROI" value={totals.roi == null ? '-' : `${totals.roi.toFixed(0)}%`} tooltip={ROI_TOOLTIP} />
      </div>

      {showAdCost && totals.adCost != null && (
        <p className="text-xs text-neutral-400 mb-2">광고비(ROI 기준): ₩{won(totals.adCost)} (VAT 제외)</p>
      )}

      {/* 주차별 리포트 — 데스크탑: 표 */}
      <Card className="hidden md:block p-0 overflow-hidden overflow-x-auto">
        <table className="w-full table-fixed text-[15px] whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500 text-sm">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">주차</th>
              <th className="px-3 py-3 text-left font-semibold">발송 일시</th>
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
            {rows.map((r) => (
              <BatchRow key={`${r.batchId}:${r.couponUsedCount ?? ''}:${r.avgTicket ?? ''}`} row={r} fetcher={fetcher} apiPrefix={apiPrefix} reload={reload} />
            ))}
          </tbody>
        </table>
      </Card>

      {/* 주차별 리포트 — 모바일: 카드 */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <BatchCard key={`${r.batchId}:${r.couponUsedCount ?? ''}:${r.avgTicket ?? ''}`} row={r} fetcher={fetcher} apiPrefix={apiPrefix} reload={reload} />
        ))}
      </div>
    </>
  );
}

export interface CampaignInputFields {
  keyword: string;
  naverPlaceUrl?: string | null;
  couponContent: string;
  couponCode?: string | null;
  couponAmount?: string | null;
  couponValidUntil?: string | Date | null;
  ownerPhone?: string | null;
}

function fmtValidUntil(v?: string | Date | null): string {
  if (!v) return '-';
  const d = typeof v === 'string' ? v : v.toISOString();
  return d.slice(0, 10).replace(/-/g, '.');
}

/** 캠페인 입력값 그대로 표시 (취소 후 재등록 시 참고용) — 기본 접힘, 펼치기 가능 */
export function CampaignInputCard({ fields }: { fields: CampaignInputFields }) {
  const [open, setOpen] = useState(false);
  const rows: { label: string; value: ReactNode }[] = [
    { label: '유입 키워드', value: fields.keyword || '-' },
    {
      label: '플레이스 URL',
      value: fields.naverPlaceUrl ? (
        <a href={fields.naverPlaceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-800 underline break-all">
          {fields.naverPlaceUrl}
        </a>
      ) : (
        '-'
      ),
    },
    { label: '쿠폰 내용', value: fields.couponContent || '-' },
    { label: '쿠폰 코드', value: fields.couponCode || '-' },
    { label: '쿠폰 금액', value: fields.couponAmount || '-' },
    { label: '유효기간', value: fmtValidUntil(fields.couponValidUntil) },
    ...(fields.ownerPhone ? [{ label: '사장님 번호', value: fields.ownerPhone }] : []),
  ];
  return (
    <Card className="p-5 mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] font-semibold text-neutral-800">캠페인 입력 정보</span>
        <ChevronDown className={`w-5 h-5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="space-y-2.5 mt-3">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
              <dt className="text-sm text-neutral-500 sm:w-28 shrink-0">{r.label}</dt>
              <dd className="text-[15px] text-neutral-800 break-words min-w-0 whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

export function Stat({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
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

export function InfoTip({ text }: { text: string }) {
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

type BatchRowProps = {
  row: ReportRow;
  fetcher: (p: string, i?: RequestInit) => Promise<Response>;
  apiPrefix: string;
  reload: () => void;
};

// 회차 결과 편집 로직 (데스크탑 표 행 / 모바일 카드 공용)
function useBatchEdit({ row, fetcher, apiPrefix, reload }: BatchRowProps) {
  const [editing, setEditing] = useState(false);
  const [used, setUsed] = useState(row.couponUsedCount?.toString() ?? '');
  const [avg, setAvg] = useState(row.avgTicket?.toString() ?? '');
  const liveRevenue = (Number(used) || 0) * (Number(avg) || 0); // 편집 중 매출 미리보기
  const save = async () => {
    await fetcher(`${apiPrefix}/batches/${row.batchId}/results`, {
      method: 'PATCH',
      body: JSON.stringify({
        couponUsedCount: used ? parseInt(used, 10) : null,
        avgTicket: avg ? parseInt(avg, 10) : null,
      }),
    });
    trackEvent('owner_booster_report_save', { week_no: row.weekNo });
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
      <td className="px-3 py-3 text-neutral-500 whitespace-nowrap">{fmtDateTime(row.scheduledAt)}</td>
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
        <span className="text-sm text-neutral-500">{fmtDateTime(row.scheduledAt)}</span>
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
