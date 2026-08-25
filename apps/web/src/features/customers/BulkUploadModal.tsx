import { RefObject } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { BulkRow, BulkUploadResult } from './types';

// 엑셀 대량 고객 등록 모달. 파싱 데이터·결과·핸들러는 부모에서 관리하고 props로 전달.
export function BulkUploadModal({
  open,
  onOpenChange,
  fileInputRef,
  parsedData,
  result,
  uploading,
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
  onDownloadSample: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-2xl">
        <ModalHeader>
          <ModalTitle>대량 고객 등록</ModalTitle>
        </ModalHeader>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 안내 + 샘플 다운로드 */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              엑셀 파일로 고객을 일괄 등록할 수 있습니다. (최대 500건)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadSample}
            >
              <Download className="w-4 h-4 mr-1" />
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
              className="w-full py-8 border-dashed border-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-5 h-5 mr-2" />
              {parsedData.length > 0
                ? `${parsedData.length}건 로드됨 (다시 선택하려면 클릭)`
                : '엑셀 파일 선택 (.xlsx, .xls, .csv)'}
            </Button>
          </div>

          {/* 미리보기 테이블 */}
          {parsedData.length > 0 && !result && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">
                미리보기 (처음 10건)
              </p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">#</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">전화번호*</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">이름</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">성별</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">생년</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">생일</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-600">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className={`border-t ${!row.phone ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-neutral-500">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {row.phone || <span className="text-red-500 text-xs">전화번호 없음</span>}
                        </td>
                        <td className="px-3 py-2">{row.name || '-'}</td>
                        <td className="px-3 py-2">{row.gender || '-'}</td>
                        <td className="px-3 py-2">{row.birthYear || '-'}</td>
                        <td className="px-3 py-2">{row.birthday || '-'}</td>
                        <td className="px-3 py-2">{row.memo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.length > 10 && (
                <p className="text-xs text-neutral-500 mt-1">
                  외 {parsedData.length - 10}건 더 있음
                </p>
              )}
            </div>
          )}

          {/* 결과 표시 */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600">등록 성공</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-700">{result.skipped}</p>
                  <p className="text-xs text-yellow-600">중복 스킵</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                  <p className="text-xs text-red-600">오류</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-700 mb-1">오류 목록:</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>행 {err.row}: {err.phone ? `${err.phone} - ` : ''}{err.reason}</li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>외 {result.errors.length - 10}건...</li>
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
            className="flex-1"
          >
            {result ? '닫기' : '취소'}
          </Button>
          {!result && (
            <Button
              onClick={onUpload}
              disabled={parsedData.length === 0 || uploading}
              className="flex-1"
            >
              {uploading ? '등록 중...' : `${parsedData.length}건 등록하기`}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
