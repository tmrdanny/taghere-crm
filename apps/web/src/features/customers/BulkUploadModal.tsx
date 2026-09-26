import { RefObject } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Download, Upload, Info } from 'lucide-react';
import { BulkRow, BulkUploadProgress, BulkUploadResult } from './types';

// 엑셀 대량 고객 등록 모달. 파싱 데이터·결과·핸들러는 부모에서 관리하고 props로 전달.
export function BulkUploadModal({
  open,
  onOpenChange,
  fileInputRef,
  parsedData,
  result,
  uploading,
  progress,
  maxRows,
  clientErrorCount,
  consentAttested,
  onConsentAttestedChange,
  onDownloadErrors,
  onDownloadSample,
  onFileChange,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  parsedData: BulkRow[];
  result: BulkUploadResult | null;
  uploading: boolean;
  progress: BulkUploadProgress | null;
  maxRows: number;
  clientErrorCount: number;
  consentAttested: boolean;
  onConsentAttestedChange: (value: boolean) => void;
  onDownloadErrors: () => void;
  onDownloadSample: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}) {
  const hasConsentColumn = parsedData.some((row) => row.consentMarketing !== undefined);
  const progressPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    // 업로드 중에는 닫히지 않게 한다 (닫으면 남은 청크 전송이 중단된 것처럼 보임)
    <Modal open={open} onOpenChange={(next) => { if (!uploading) onOpenChange(next); }}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-2xl">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">대량 고객 등록</ModalTitle>
        </ModalHeader>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 안내 + 샘플 다운로드 */}
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] text-[color:var(--ad-muted)]">
              <Info className="h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              엑셀 파일로 고객을 일괄 등록할 수 있습니다. (최대 {maxRows.toLocaleString()}건)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadSample}
              className="ad-press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              <Download className="h-4 w-4" />
              샘플 다운로드
            </Button>
          </div>

          {/* 파일 업로드 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full rounded-[12px] border-2 border-dashed border-[color:var(--ad-line-strong)] bg-white py-8 text-[13px] font-medium text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-5 h-5 mr-2" />
              {parsedData.length > 0
                ? `${parsedData.length.toLocaleString()}건 로드됨 (다시 선택하려면 클릭)`
                : '엑셀 파일 선택 (.xlsx, .xls, .csv)'}
            </Button>
          </div>

          {/* 미리보기 테이블 */}
          {parsedData.length > 0 && !result && (
            <div>
              <p className="text-[13px] font-medium text-[#383c40] mb-2">
                미리보기 (처음 10건)
              </p>
              <div className="overflow-x-auto border rounded-[10px]">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#f8f9fa]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">#</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">전화번호*</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">이름</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">성별</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">생년</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">생일</th>
                      <th className="px-3 py-2 text-left font-medium text-[#383c40]">메모</th>
                      {hasConsentColumn && (
                        <th className="px-3 py-2 text-left font-medium text-[#383c40]">수신동의</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className={`border-t ${!row.phone ? 'bg-[#fff0f3]' : ''}`}>
                        <td className="px-3 py-2 text-[#55595e]">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {row.phone || <span className="text-[#cc0832] text-[12px]">전화번호 없음</span>}
                        </td>
                        <td className="px-3 py-2">{row.name || '-'}</td>
                        <td className="px-3 py-2">{row.gender || '-'}</td>
                        <td className="px-3 py-2">{row.birthYear || '-'}</td>
                        <td className="px-3 py-2">{row.birthday || '-'}</td>
                        <td className="px-3 py-2">{row.memo || '-'}</td>
                        {hasConsentColumn && <td className="px-3 py-2">{row.consentMarketing || '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.length > 10 && (
                <p className="text-[12px] text-[#55595e] mt-1">
                  외 {(parsedData.length - 10).toLocaleString()}건 더 있음
                </p>
              )}
              {clientErrorCount > 0 && (
                <p className="text-[12px] text-[color:var(--ad-muted)] mt-1">
                  파일 내 중복 전화번호 {clientErrorCount.toLocaleString()}건은 제외됩니다.
                </p>
              )}
            </div>
          )}

          {/* 마케팅 수신 동의 확인 — 동의 열이 있을 때만 */}
          {parsedData.length > 0 && !result && hasConsentColumn && (
            <label className="flex items-start gap-2 p-3 border border-[#ebeced] rounded-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={consentAttested}
                onChange={(e) => onConsentAttestedChange(e.target.checked)}
                disabled={uploading}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span className="text-[13px] text-[#383c40]">
                &apos;마케팅 수신동의&apos;가 Y인 고객은 광고성 정보 수신에 직접 동의한 고객임을 확인합니다.
                <span className="block text-[12px] text-[#55595e] mt-0.5">
                  체크하지 않으면 모든 고객이 수신 미동의로 등록되어 마케팅 메시지 대상에서 제외됩니다.
                </span>
              </span>
            </label>
          )}

          {/* 진행률 */}
          {progress && !result && (
            <div>
              <div className="flex justify-between text-[12px] text-[#383c40] mb-1">
                <span>등록 중... 창을 닫지 마세요</span>
                <span>
                  {progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({progressPct}%)
                </span>
              </div>
              <div className="h-2 bg-[#f2f3f4] rounded-full overflow-hidden">
                <div className="h-full bg-[color:var(--ad-ink)] transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* 결과 표시 */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-[color:var(--ad-bg-alt)] rounded-[10px] text-center">
                  <p className="text-[20px] font-medium tracking-[-0.03em] tabular-nums text-[color:var(--ad-ink)]">{result.created.toLocaleString()}</p>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">등록 성공</p>
                </div>
                <div className="p-3 bg-[color:var(--ad-bg-alt)] rounded-[10px] text-center">
                  <p className="text-[20px] font-medium tracking-[-0.03em] tabular-nums text-[color:var(--ad-ink)]">{result.skipped.toLocaleString()}</p>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">중복 스킵</p>
                </div>
                <div className="p-3 bg-[color:var(--ad-bg-alt)] rounded-[10px] text-center">
                  <p className="text-[20px] font-medium tracking-[-0.03em] tabular-nums text-[color:var(--ad-neg)]">{result.errors.length.toLocaleString()}</p>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">오류</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="p-3 bg-[#fff2f5] rounded-[10px]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[13px] font-medium text-[#cc0832]">오류 목록:</p>
                    <Button variant="outline" size="sm" onClick={onDownloadErrors} className="ad-press inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]">
                      <Download className="h-4 w-4" />
                      오류 행 다운로드
                    </Button>
                  </div>
                  <ul className="text-[12px] text-[#cc0832] space-y-1">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>행 {err.row}: {err.phone ? `${err.phone} - ` : ''}{err.reason}</li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>외 {(result.errors.length - 10).toLocaleString()}건...</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <ModalFooter className="flex-shrink-0">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            {result ? '닫기' : '취소'}
          </Button>
          {!result && (
            <Button
              onClick={onUpload}
              disabled={parsedData.length === 0 || uploading}
              className="flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
            >
              {uploading ? `등록 중... ${progressPct}%` : `${parsedData.length.toLocaleString()}건 등록하기`}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
