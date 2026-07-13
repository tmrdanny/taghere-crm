'use client';

/**
 * 플레이스 부스터 광고 성과 리포트 — 벡터 PDF (광고주 보고용)
 *
 * 화면 캡처(html2canvas) 대신, 어드민에 이미 로드된 리포트 데이터로
 * @react-pdf/renderer 를 사용해 벡터 텍스트 문서를 직접 그린다.
 * 이 모듈은 페이지에서 "동적 import" 로만 로드된다(SSR/초기 번들 제외).
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import type { ReportRow, ReportTotals } from './booster-report';

// ── 폰트: 로컬 Pretendard TTF (public/fonts) 임베드 ──
Font.register({
  family: 'Pretendard',
  fonts: [
    { src: '/fonts/Pretendard-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Pretendard-SemiBold.ttf', fontWeight: 600 },
    { src: '/fonts/Pretendard-Bold.ttf', fontWeight: 700 },
  ],
});
// 라틴 단어 자동 하이픈 분절 방지(URL 등은 아래 breakable로 별도 처리)
Font.registerHyphenationCallback((word) => [word]);

// ── 입력 데이터(어드민 AdminReportData 와 구조 호환) ──
export interface BoosterReportData {
  campaign: {
    keyword: string;
    couponContent: string;
    campaignName: string | null;
    status: string;
    perBatchCount: number;
    totalWeeks: number;
    totalTargetCount: number;
    naverPlaceUrl: string;
    couponCode: string | null;
    couponAmount: string | null;
    couponValidUntil: string | null;
    ownerPhone: string | null;
  };
  store: { name: string; ownerName: string | null } | null;
  isExternal: boolean;
  totals: ReportTotals;
  rows: ReportRow[];
}

// ── 포맷 유틸 ──
const won = (n: number | null | undefined) => (n ?? 0).toLocaleString('ko-KR');
const pct = (n: number | null | undefined, digits = 1) =>
  n == null ? '-' : `${n.toFixed(digits)}%`;

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '-';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}`;
}

// 이모지 제거(Pretendard 글리프 부재로 두부박스 방지)
function stripEmoji(s: string): string {
  return (s || '').replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
    '',
  );
}

// 공백 없는 긴 URL을 일정 길이마다 개행으로 나눠 박스 오버플로 방지
// (ZWSP 등 글리프 없는 문자는 react-pdf textkit 크래시를 유발하므로 사용하지 않음)
function breakable(url: string): string {
  const clean = url || '';
  return clean.length <= 72 ? clean : clean.replace(/(.{72})/g, '$1\n');
}

interface ReportModel {
  storeName: string;
  isExternal: boolean;
  periodStart: string;
  periodEnd: string;
  docNo: string;
  issuedAt: string;
  keyword: string;
  naverPlaceUrl: string;
  couponContent: string;
  couponMeta: string;
  composition: string;
  totals: ReportTotals;
  rows: ReportRow[];
}

function buildReportModel(data: BoosterReportData, displayName: string): ReportModel {
  const c = data.campaign;
  const sorted = [...data.rows].sort((a, b) => a.weekNo - b.weekNo);
  const times = sorted
    .map((r) => new Date(r.scheduledAt).getTime())
    .filter((t) => !isNaN(t));
  const periodStart = times.length ? fmtDate(new Date(Math.min(...times))) : '-';
  const periodEnd = times.length ? fmtDate(new Date(Math.max(...times))) : '-';

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const docNo = `THP-ADR-${now.getFullYear()}-${mm}${dd}`;
  const issuedAt = fmtDate(now);

  const couponMeta = [
    c.couponAmount ? `쿠폰 금액 ${stripEmoji(c.couponAmount)}` : '',
    c.couponCode ? `코드 ${c.couponCode}` : '',
    c.couponValidUntil ? `유효기간 ~ ${fmtDate(c.couponValidUntil)}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');

  const composition = `${c.perBatchCount.toLocaleString('ko-KR')}명 × ${c.totalWeeks}주 (총 ${c.totalTargetCount.toLocaleString('ko-KR')}명)`;

  return {
    storeName: displayName,
    isExternal: data.isExternal,
    periodStart,
    periodEnd,
    docNo,
    issuedAt,
    keyword: stripEmoji(c.keyword),
    naverPlaceUrl: c.naverPlaceUrl || '',
    couponContent: stripEmoji(c.couponContent),
    couponMeta,
    composition,
    totals: data.totals,
    rows: sorted,
  };
}

// ── 색/타이포 ──
const NAVY = '#26324F';
const INK = '#2B2F38';
const SUB = '#6B7280';
const LINE = '#E5E7EB';
const PANEL = '#F4F6F8';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Pretendard',
    fontSize: 9,
    color: INK,
    paddingTop: 92,
    paddingBottom: 60,
    paddingHorizontal: 44,
    lineHeight: 1.45,
  },
  // 헤더
  header: {
    position: 'absolute',
    top: 36,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    paddingBottom: 8,
  },
  wordmark: { fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: 0.2 },
  headerMeta: { fontSize: 8, color: SUB, textAlign: 'right', lineHeight: 1.5 },
  // 타이틀
  title: { fontSize: 20, fontWeight: 700, color: NAVY, lineHeight: 1.2, marginBottom: 9 },
  subtitle: { fontSize: 10, color: SUB, marginBottom: 16 },
  subtitleStrong: { color: INK, fontWeight: 600 },
  // KPI
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  kpiBox: {
    width: '32.4%',
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  kpiValue: { fontSize: 20, fontWeight: 700, color: NAVY },
  kpiLabel: { fontSize: 8.5, color: SUB, marginTop: 9 },
  // 내부지표 스트립
  strip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  stripCell: { flexDirection: 'row', alignItems: 'baseline', marginRight: 20 },
  stripLabel: { fontSize: 8.5, color: SUB, marginRight: 5 },
  stripValue: { fontSize: 10, fontWeight: 700, color: INK },
  stripNote: { fontSize: 7.5, color: SUB, marginLeft: 2 },
  // 섹션
  section: { marginTop: 18 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  secChip: {
    width: 15,
    height: 15,
    backgroundColor: NAVY,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  secChipText: { color: '#FFFFFF', fontSize: 9, fontWeight: 700 },
  secTitle: { fontSize: 11.5, fontWeight: 700, color: INK },
  // 개요 정의 리스트
  defRow: { flexDirection: 'row', marginBottom: 5 },
  defLabel: { width: 76, fontSize: 9, color: SUB },
  defValue: { flex: 1, fontSize: 9.5, color: INK },
  link: { fontSize: 8, color: '#3A4A70' },
  // 표
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  tHead: { flexDirection: 'row', backgroundColor: NAVY },
  th: { color: '#FFFFFF', fontSize: 8, fontWeight: 700, paddingVertical: 7, paddingHorizontal: 5 },
  tRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE },
  td: { fontSize: 8.5, paddingVertical: 6, paddingHorizontal: 5, color: INK },
  tTotal: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: NAVY, backgroundColor: '#FAFBFC' },
  tdTotal: { fontSize: 8.5, fontWeight: 700, paddingVertical: 7, paddingHorizontal: 5, color: INK },
  footnote: { fontSize: 7.5, color: SUB, marginTop: 6 },
  // 프로모션
  promo: { borderLeftWidth: 3, borderLeftColor: NAVY, backgroundColor: PANEL, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 2 },
  promoTitle: { fontSize: 13, fontWeight: 700, color: INK },
  promoMeta: { fontSize: 9, color: SUB, marginTop: 5 },
  promoDesc: { fontSize: 8.5, color: SUB, marginTop: 8 },
  // 푸터
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
  },
  footText: { fontSize: 7.5, color: SUB },
});

// 표 컬럼 폭(%)
const COLS = { div: '9%', date: '16%', sent: '12%', ctr: '10%', click: '12%', used: '12%', avg: '14%', rev: '15%' } as const;

function TableHeader() {
  return (
    <View style={s.tHead} fixed>
      <Text style={[s.th, { width: COLS.div }]}>구분</Text>
      <Text style={[s.th, { width: COLS.date }]}>발송일자</Text>
      <Text style={[s.th, { width: COLS.sent, textAlign: 'right' }]}>발송 수 (건)</Text>
      <Text style={[s.th, { width: COLS.ctr, textAlign: 'right' }]}>CTR</Text>
      <Text style={[s.th, { width: COLS.click, textAlign: 'right' }]}>클릭 (회)</Text>
      <Text style={[s.th, { width: COLS.used, textAlign: 'right' }]}>쿠폰사용</Text>
      <Text style={[s.th, { width: COLS.avg, textAlign: 'right' }]}>평균객단</Text>
      <Text style={[s.th, { width: COLS.rev, textAlign: 'right' }]}>매출</Text>
    </View>
  );
}

function SectionHead({ no, title }: { no: number; title: string }) {
  return (
    <View style={s.secHead}>
      <View style={s.secChip}>
        <Text style={s.secChipText}>{no}</Text>
      </View>
      <Text style={s.secTitle}>{title}</Text>
    </View>
  );
}

export function BoosterReportDocument({ model }: { model: ReportModel }) {
  const t = model.totals;
  const hasInternal = t.adCost != null || t.revenue != null || t.roi != null;
  return (
    <Document title={`플레이스 부스터 광고 성과 리포트 - ${model.storeName}`} author="TagHere">
      <Page size="A4" style={s.page}>
        {/* 헤더 (매 페이지 고정) */}
        <View style={s.header} fixed>
          <Text style={s.wordmark}>TagHere</Text>
          <Text style={s.headerMeta}>{`문서번호 ${model.docNo}\n발행일 ${model.issuedAt}`}</Text>
        </View>

        {/* 타이틀 */}
        <Text style={s.title}>플레이스 부스터 광고 성과 리포트</Text>
        <Text style={s.subtitle}>
          매장명 <Text style={s.subtitleStrong}>{model.storeName}</Text> · 캠페인 기간 {model.periodStart} – {model.periodEnd}
        </Text>

        {/* KPI 밴드 */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiValue}>{won(t.sentCount)}</Text>
            <Text style={s.kpiLabel}>총 발송 (건)</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiValue}>{won(t.clickCount)}</Text>
            <Text style={s.kpiLabel}>총 플레이스 링크 클릭 (회)</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiValue}>{pct(t.clickRate, 2)}</Text>
            <Text style={s.kpiLabel}>종합 클릭률 (CTR)</Text>
          </View>
        </View>

        {/* 내부지표 요약 스트립 */}
        {hasInternal && (
          <View style={s.strip}>
            <View style={s.stripCell}>
              <Text style={s.stripLabel}>광고비</Text>
              <Text style={s.stripValue}>₩{won(t.adCost)}</Text>
              <Text style={s.stripNote}>(VAT 제외)</Text>
            </View>
            <View style={s.stripCell}>
              <Text style={s.stripLabel}>매출</Text>
              <Text style={s.stripValue}>₩{won(t.revenue)}</Text>
            </View>
            <View style={s.stripCell}>
              <Text style={s.stripLabel}>ROI</Text>
              <Text style={s.stripValue}>{t.roi == null ? '-' : `${t.roi.toFixed(0)}%`}</Text>
            </View>
          </View>
        )}

        {/* 1. 캠페인 개요 */}
        <View style={s.section}>
          <SectionHead no={1} title="캠페인 개요" />
          <Def label="광고 상품" value="TagHere 플레이스 부스터 (네이버 플레이스 검색 상위 노출)" />
          <Def label="타깃 키워드" value={model.keyword || '-'} strong />
          <Def label="발송 방식" value="카카오톡 알림 발송 (인근 TagHere 고객 대상)" />
          <Def label="유입 채널" value={`네이버 지도 '${model.keyword}' 검색결과 내 매장 플레이스`} />
          {!!model.naverPlaceUrl && (
            <View style={s.defRow}>
              <Text style={s.defLabel}>유입 링크</Text>
              <Text style={[s.defValue, s.link]}>{breakable(model.naverPlaceUrl)}</Text>
            </View>
          )}
          <Def label="발송 구성" value={model.composition} />
        </View>

        {/* 2. 발송 및 성과 */}
        <View style={s.section}>
          <SectionHead no={2} title="발송 및 성과" />
          <View style={s.table}>
            <TableHeader />
            {model.rows.length === 0 ? (
              <View style={s.tRow}>
                <Text style={[s.td, { width: '100%', textAlign: 'center', color: SUB }]}>발송 내역이 없습니다.</Text>
              </View>
            ) : (
              model.rows.map((r) => (
                <View style={s.tRow} key={r.batchId} wrap={false}>
                  <Text style={[s.td, { width: COLS.div }]}>{r.weekNo}차</Text>
                  <Text style={[s.td, { width: COLS.date }]}>{fmtDate(r.scheduledAt)}</Text>
                  <Text style={[s.td, { width: COLS.sent, textAlign: 'right' }]}>{won(r.sentCount)}</Text>
                  <Text style={[s.td, { width: COLS.ctr, textAlign: 'right' }]}>{pct(r.clickRate)}</Text>
                  <Text style={[s.td, { width: COLS.click, textAlign: 'right' }]}>{won(r.clickCount)}</Text>
                  <Text style={[s.td, { width: COLS.used, textAlign: 'right' }]}>{r.couponUsedCount == null ? '-' : won(r.couponUsedCount)}</Text>
                  <Text style={[s.td, { width: COLS.avg, textAlign: 'right' }]}>{r.avgTicket ? `₩${won(r.avgTicket)}` : '-'}</Text>
                  <Text style={[s.td, { width: COLS.rev, textAlign: 'right' }]}>{r.revenue ? `₩${won(r.revenue)}` : '-'}</Text>
                </View>
              ))
            )}
            {model.rows.length > 0 && (
              <View style={s.tTotal}>
                <Text style={[s.tdTotal, { width: COLS.div }]}>합계</Text>
                <Text style={[s.tdTotal, { width: COLS.date }]}>-</Text>
                <Text style={[s.tdTotal, { width: COLS.sent, textAlign: 'right' }]}>{won(t.sentCount)}</Text>
                <Text style={[s.tdTotal, { width: COLS.ctr, textAlign: 'right' }]}>{pct(t.clickRate, 2)}</Text>
                <Text style={[s.tdTotal, { width: COLS.click, textAlign: 'right' }]}>{won(t.clickCount)}</Text>
                <Text style={[s.tdTotal, { width: COLS.used, textAlign: 'right' }]}>-</Text>
                <Text style={[s.tdTotal, { width: COLS.avg, textAlign: 'right' }]}>-</Text>
                <Text style={[s.tdTotal, { width: COLS.rev, textAlign: 'right' }]}>{t.revenue ? `₩${won(t.revenue)}` : '-'}</Text>
              </View>
            )}
          </View>
          <Text style={s.footnote}>
            ※ CTR은 플레이스 링크 클릭수 ÷ 발송 수 기준이며, 매출은 쿠폰 사용 건수 × 평균객단으로 산출한 추정치입니다.
          </Text>
        </View>

        {/* 3. 고객 대상 프로모션 — 페이지 중간에 잘리지 않게 통째로 유지 */}
        <View style={s.section} wrap={false}>
          <SectionHead no={3} title="고객 대상 프로모션" />
          <View style={s.promo}>
            <Text style={s.promoTitle}>{model.couponContent || '-'}</Text>
            {!!model.couponMeta && <Text style={s.promoMeta}>{model.couponMeta}</Text>}
          </View>
          <Text style={s.promoDesc}>광고 유입 고객의 매장 방문 및 결제 전환을 유도하기 위해 제공된 혜택입니다.</Text>
        </View>

        {/* 푸터 (매 페이지 고정) */}
        <View style={s.footer} fixed>
          <Text style={s.footText}>TMR Founders Co., Ltd. | TagHere</Text>
          <Text style={s.footText} render={({ pageNumber }) => `- ${pageNumber} -`} />
          <Text style={s.footText}>본 문서는 광고주 보고용 자료로 외부 공유를 제한합니다.</Text>
        </View>
      </Page>
    </Document>
  );
}

function Def({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.defRow}>
      <Text style={s.defLabel}>{label}</Text>
      <Text style={[s.defValue, strong ? { fontWeight: 700 } : {}]}>{value}</Text>
    </View>
  );
}

/** 어드민 리포트 데이터로 벡터 PDF를 생성해 즉시 다운로드한다. */
export async function downloadBoosterReportPdf(data: BoosterReportData, displayName: string): Promise<void> {
  const model = buildReportModel(data, displayName);
  const blob = await pdf(<BoosterReportDocument model={model} />).toBlob();
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `성과리포트_${displayName || '캠페인'}_${ymd}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
