'use client';

import { API_BASE } from '@/lib/api-config';
import { useState } from 'react';
import * as XLSX from 'xlsx';


const GENDER_LABELS: Record<string, string> = {
  MALE: '남성',
  FEMALE: '여성',
};

const AGE_GROUP_LABELS: Record<string, string> = {
  TEENS: '10대',
  TWENTIES: '20대',
  THIRTIES: '30대',
  FORTIES: '40대',
  FIFTIES: '50대',
  SIXTY_PLUS: '60대 이상',
};

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  // +82 10-XXXX-XXXX → 010-XXXX-XXXX
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+82')) {
    cleaned = '0' + cleaned.slice(3);
  }
  // 숫자만 추출 후 하이픈 포맷팅
  const digits = cleaned.replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminCustomersExportPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const handleExport = async () => {
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE}/api/admin/customers/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '다운로드에 실패했습니다.');
      }

      const data = await res.json();
      const { customers, total } = data;

      // 엑셀 데이터 변환
      const rows = customers.map((c: any) => ({
        '매장명': c.storeName ?? '',
        '고객명': c.name ?? '',
        '전화번호': formatPhone(c.phone),
        '성별': c.gender ? (GENDER_LABELS[c.gender] ?? c.gender) : '',
        '연령대': c.ageGroup ? (AGE_GROUP_LABELS[c.ageGroup] ?? c.ageGroup) : '',
        '생년월일': c.birthday ?? '',
        '출생연도': c.birthYear ?? '',
        '방문횟수': c.visitCount,
        '총포인트': c.totalPoints,
        '총스탬프': c.totalStamps,
        '마지막방문일': formatDate(c.lastVisitAt),
        '마케팅동의': c.consentMarketing ? 'Y' : 'N',
        '방문경로': c.visitSource ?? '',
        '가입일': formatDate(c.createdAt),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '전체고객');

      // 컬럼 너비 설정
      ws['!cols'] = [
        { wch: 20 }, // 매장명
        { wch: 12 }, // 고객명
        { wch: 15 }, // 전화번호
        { wch: 8 },  // 성별
        { wch: 10 }, // 연령대
        { wch: 10 }, // 생년월일
        { wch: 10 }, // 출생연도
        { wch: 10 }, // 방문횟수
        { wch: 10 }, // 총포인트
        { wch: 10 }, // 총스탬프
        { wch: 14 }, // 마지막방문일
        { wch: 10 }, // 마케팅동의
        { wch: 12 }, // 방문경로
        { wch: 14 }, // 가입일
      ];

      const today = new Date();
      const dateStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
      XLSX.writeFile(wb, `taghere_전체고객_${dateStr}.xlsx`);

      setResult(`총 ${total.toLocaleString()}명의 고객 데이터를 다운로드했습니다.`);
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="mb-5 text-[13px] text-[color:var(--ad-muted)]">전체 매장의 고객 데이터를 엑셀 파일로 다운로드합니다.</p>

      <div className="ad-card p-5 max-w-md">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              다운로드 비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleExport()}
              placeholder="비밀번호를 입력하세요"
              className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-[13px] text-[color:var(--ad-neg)]">{error}</p>
          )}

          {result && (
            <p className="text-[13px] text-[color:var(--ad-pos)]">{result}</p>
          )}

          <button
            onClick={handleExport}
            disabled={loading}
            className="ad-press w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
                추출 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                엑셀 다운로드
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
