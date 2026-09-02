import * as XLSX from 'xlsx';

/**
 * 인사이트 차트의 원본(집계) 데이터를 엑셀로 저장한다.
 *
 * 개인정보 보호: 여기서 내보내는 값은 모두 날짜/언어 단위로 집계된 수치이며
 * 고객 이름·연락처 등 식별 정보는 포함하지 않는다.
 */

export interface DailyVisitorRow {
  date: string;
  visitors: number;
  autoVisitors: number;
  overridden: boolean;
}

export interface LanguageRow {
  language: string;
  count: number;
  percentage: number;
}

function download(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name);
  }
  XLSX.writeFile(wb, filename);
}

/** 기간 라벨을 파일명에 쓸 수 있는 형태로 만든다 */
export function periodLabel(range: { from: string; to: string } | null, days: number): string {
  return range ? `${range.from}_${range.to}` : `최근${days}일`;
}

export function exportDailyVisitors(
  rows: DailyVisitorRow[],
  period: string,
  scope: string
): void {
  download(
    [
      {
        name: '일별방문객',
        rows: rows.map((r) => ({
          날짜: r.date,
          방문객수: r.visitors,
          '자동 집계': r.autoVisitors,
          '직접 입력': r.overridden ? 'Y' : 'N',
        })),
      },
    ],
    `taghere_일별방문객_${scope}_${period}.xlsx`
  );
}

export function exportOrderLanguages(
  rows: LanguageRow[],
  labelOf: (code: string) => string,
  totals: { totalOrders: number; identifiedOrders: number; unknownCount: number },
  period: string,
  scope: string
): void {
  download(
    [
      {
        name: '언어분포',
        rows: rows.map((r) => ({
          언어: labelOf(r.language),
          코드: r.language,
          주문수: r.count,
          비율: `${r.percentage.toFixed(1)}%`,
        })),
      },
      {
        name: '요약',
        rows: [
          { 항목: '조회 기간', 값: period },
          { 항목: '대상', 값: scope },
          { 항목: '전체 주문 수', 값: totals.totalOrders },
          { 항목: '언어 식별된 주문 수', 값: totals.identifiedOrders },
          { 항목: '언어 미상 주문 수', 값: totals.unknownCount },
        ],
      },
    ],
    `taghere_주문언어_${scope}_${period}.xlsx`
  );
}
