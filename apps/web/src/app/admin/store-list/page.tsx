'use client';

import { API_BASE } from '@/lib/api-config';
import { STORE_CATEGORIES } from '@/lib/constants';
import { useEffect, useState, useRef, useCallback } from 'react';
import { formatNumber } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface BulkStoreRow {
  storeName: string;
  ownerName: string;
  phone: string;
  email: string;
  businessRegNumber: string;
  address: string;
  category: string;
}

interface BulkResult {
  total: number;
  created: number;
  errors: Array<{ row: number; storeName: string; reason: string }>;
  defaultPassword: string;
  crmOn?: {
    success: number;
    failed: number;
    failures: Array<{ storeName: string; error?: string }>;
  };
}

// 업종 분류
const CATEGORY_OPTIONS = [
  { value: '', label: '전체 업종' },
  { value: 'KOREAN', label: '한식' },
  { value: 'CHINESE', label: '중식' },
  { value: 'JAPANESE', label: '일식' },
  { value: 'WESTERN', label: '양식' },
  { value: 'ASIAN', label: '아시안' },
  { value: 'BUNSIK', label: '분식' },
  { value: 'FASTFOOD', label: '패스트푸드' },
  { value: 'MEAT', label: '고기/구이' },
  { value: 'SEAFOOD', label: '해산물' },
  { value: 'BUFFET', label: '뷔페' },
  { value: 'BRUNCH', label: '브런치' },
  { value: 'CAFE', label: '카페' },
  { value: 'BAKERY', label: '베이커리' },
  { value: 'DESSERT', label: '디저트' },
  { value: 'ICECREAM', label: '아이스크림' },
  { value: 'BEER', label: '호프/맥주' },
  { value: 'IZAKAYA', label: '이자카야' },
  { value: 'WINE_BAR', label: '와인바' },
  { value: 'COCKTAIL_BAR', label: '칵테일바' },
  { value: 'POCHA', label: '포차' },
  { value: 'KOREAN_PUB', label: '한식 주점' },
  { value: 'COOK_PUB', label: '요리주점' },
  { value: 'FOODCOURT', label: '푸드코트' },
  { value: 'OTHER', label: '기타' },
];

interface Store {
  id: string;
  name: string;
  category: string | null;
  slug: string | null;
  ownerName: string | null;
  phone: string | null;
  businessRegNumber: string | null;
  address: string | null;
  createdAt: string;
  ownerEmail: string | null;
  customerCount: number;
  walletBalance: number;
  pointRatePercent: number;
  crmEnabled: boolean;
}

const ITEMS_PER_PAGE = 20;

export default function StoreListPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // 대량 등록
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkParsedData, setBulkParsedData] = useState<BulkStoreRow[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [bulkEnrollmentMode, setBulkEnrollmentMode] = useState<'POINTS' | 'STAMP' | 'MEMBERSHIP'>('POINTS');

  // 검색 디바운스(300ms) → 첫 페이지로
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 서버 페이지네이션 fetch (page/search/category → 서버에서 전 매장 검색·정렬·슬라이스)
  const buildStoresQuery = useCallback(
    (pageSize: number) => {
      const params = new URLSearchParams({ page: String(currentPage), pageSize: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryFilter) params.set('category', categoryFilter);
      return params;
    },
    [currentPage, debouncedSearch, categoryFilter]
  );

  const fetchStores = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores?${buildStoresQuery(ITEMS_PER_PAGE)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    } finally {
      setIsLoading(false);
      setFirstLoad(false);
    }
  }, [buildStoresQuery]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  // 대량등록 샘플 엑셀 다운로드
  const handleDownloadBulkSample = () => {
    const sampleData = [
      {
        '상호명': '맛있는 한식당',
        '대표자명': '홍길동',
        '연락처': '010-1234-5678',
        '점주이메일': 'store1@example.com',
        '사업자등록번호': '123-45-67890',
        '주소': '서울시 강남구 역삼동 123-4',
        '업종': '한식',
      },
      {
        '상호명': '카페 모카',
        '대표자명': '김카페',
        '연락처': '010-9876-5432',
        '점주이메일': 'store2@example.com',
        '사업자등록번호': '123-45-67890',
        '주소': '서울시 서초구 서초동 456-7',
        '업종': '카페',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매장 대량등록');
    XLSX.writeFile(wb, '매장_대량등록_샘플.xlsx');
  };

  // 업종 한글 → enum 매핑
  const categoryLabelToEnum: Record<string, string> = Object.fromEntries(
    Object.entries(STORE_CATEGORIES).map(([k, v]) => [v, k])
  );

  // 엑셀 파일 파싱
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const s = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
      const parsed: BulkStoreRow[] = rows.map((row) => {
        const rawCategory = s(row['업종']);
        return {
          storeName: s(row['상호명']),
          ownerName: s(row['대표자명']),
          phone: s(row['연락처']),
          email: s(row['점주이메일']),
          businessRegNumber: s(row['사업자등록번호']),
          address: s(row['주소']),
          category: categoryLabelToEnum[rawCategory] || rawCategory || '',
        };
      }).filter((r) => r.storeName);

      setBulkParsedData(parsed);
      setBulkResult(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // 대량 업로드 실행
  const handleBulkUpload = async () => {
    if (bulkParsedData.length === 0) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setBulkUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stores: bulkParsedData, enrollmentMode: bulkEnrollmentMode }),
      });

      const result = await res.json();
      setBulkResult(result);

      if (result.created > 0) {
        fetchStores();
      }
    } catch (error) {
      console.error('Bulk upload error:', error);
    } finally {
      setBulkUploading(false);
    }
  };

  // Excel 다운로드 — 현재 검색/필터에 해당하는 전체를 서버에서 받아 생성
  const handleDownloadExcel = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    const params = new URLSearchParams({ page: '1', pageSize: '100000' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (categoryFilter) params.set('category', categoryFilter);
    const res = await fetch(`${API_BASE}/api/admin/stores?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const allStores: Store[] = data.stores || [];
    const excelData = allStores.map((store) => ({
      '상호명': store.name,
      '대표자명': store.ownerName || '-',
      '연락처': store.phone || '-',
      '점주 이메일': store.ownerEmail || '-',
      '사업자등록번호': store.businessRegNumber || '-',
      '주소': store.address || '-',
      '업종': store.category ? STORE_CATEGORIES[store.category as keyof typeof STORE_CATEGORIES] || store.category : '-',
      '고객 수': store.customerCount,
      '충전금': store.walletBalance,
      '적립률(%)': store.pointRatePercent,
      'CRM 연동': store.crmEnabled ? '활성화' : '비활성화',
      '가입일': new Date(store.createdAt).toLocaleDateString('ko-KR'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '매장 목록');

    const fileName = `매장_목록_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  if (firstLoad) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="ad-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] text-[color:var(--ad-muted)] ad-tnum">
              {searchQuery || categoryFilter ? '검색 결과 ' : '총 '}{total.toLocaleString()}개 매장
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBulkModal(true); setBulkParsedData([]); setBulkResult(null); setBulkEnrollmentMode('POINTS'); }}
              className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)]"
            >
              <UploadIcon className="w-4 h-4" />
              매장 대량등록
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={total === 0}
              className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              Excel 다운로드
            </button>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="매장명, 대표자명, 사업자번호, 연락처 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="ad-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 font-medium text-left">
                  상호명
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  대표자명
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  연락처
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  점주 이메일
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  사업자번호
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  주소
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  업종
                </th>
                <th className="px-4 py-2.5 font-medium text-right">
                  고객 수
                </th>
                <th className="px-4 py-2.5 font-medium text-right">
                  충전금
                </th>
                <th className="px-4 py-2.5 font-medium text-right">
                  적립률
                </th>
                <th className="px-4 py-2.5 font-medium text-center">
                  CRM
                </th>
                <th className="px-4 py-2.5 font-medium text-left">
                  가입일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-[13px] text-[color:var(--ad-faint)]">
                    {searchQuery || categoryFilter ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'}
                  </td>
                </tr>
              ) : (
                stores.map((store) => (
                  <tr key={store.id} className="hover:bg-[rgba(110,173,255,0.05)] transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium text-[color:var(--ad-ink)]">
                      {store.name}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)]">
                      {store.ownerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)]">
                      {store.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)]">
                      {store.ownerEmail || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)] font-mono">
                      {store.businessRegNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)] max-w-[200px] truncate" title={store.address || undefined}>
                      {store.address || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink-2)]">
                      {store.category ? STORE_CATEGORIES[store.category as keyof typeof STORE_CATEGORIES] || store.category : '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink)] text-right font-medium ad-tnum">
                      {formatNumber(store.customerCount)}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink)] text-right font-medium ad-tnum">
                      {formatNumber(store.walletBalance)}원
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[color:var(--ad-ink)] text-right ad-tnum">
                      {store.pointRatePercent}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          store.crmEnabled
                            ? 'bg-[#d9fad3] text-[color:var(--ad-pos)]'
                            : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]'
                        }`}
                      >
                        {store.crmEnabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] ad-tnum text-[color:var(--ad-muted)]">
                      {new Date(store.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)]">
            <p className="text-[12.5px] ad-tnum text-[color:var(--ad-muted)]">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
              {Math.min(currentPage * ITEMS_PER_PAGE, total)} / {total.toLocaleString()}개
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="ad-press p-2 rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-[13px] ad-tnum text-[color:var(--ad-ink-2)] min-w-[80px] text-center">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="ad-press p-2 rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 대량등록 모달 */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--ad-line)]">
              <h3 className="text-[17px] font-bold text-[color:var(--ad-ink)]">매장 대량등록</h3>
              <button onClick={() => setBulkModal(false)} className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink-2)]">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-[13px] text-[color:var(--ad-muted)]">
                엑셀 파일로 매장을 일괄 등록할 수 있습니다. (최대 500건)
                <br />
                초기 비밀번호: <span className="font-mono font-semibold">123456789a</span>
              </p>

              {/* 샘플 다운로드 + 파일 선택 */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadBulkSample}
                  className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] font-medium !text-[color:var(--ad-link)]"
                >
                  샘플 다운로드
                </button>
                <input
                  type="file"
                  ref={bulkFileInputRef}
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleBulkFileChange}
                />
                <button
                  onClick={() => bulkFileInputRef.current?.click()}
                  className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                >
                  {bulkParsedData.length > 0
                    ? `${bulkParsedData.length}건 로드됨 (다시 선택하려면 클릭)`
                    : '엑셀 파일 선택 (.xlsx, .xls, .csv)'}
                </button>
              </div>

              {/* 등록 모드 선택 */}
              <div className="p-4 bg-[color:var(--ad-bg-alt)] rounded-[14px]">
                <p className="text-[13px] font-medium text-[color:var(--ad-ink-2)] mb-2">등록 모드</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'POINTS' as const, label: '포인트 적립' },
                    { value: 'STAMP' as const, label: '스탬프 적립' },
                    { value: 'MEMBERSHIP' as const, label: '멤버십 등록' },
                  ]).map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setBulkEnrollmentMode(mode.value)}
                      className={`ad-press py-2.5 px-3 rounded-[10px] text-[13px] font-medium transition-colors ${
                        bulkEnrollmentMode === mode.value
                          ? 'bg-[color:var(--ad-navy)] text-white'
                          : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 미리보기 테이블 */}
              {bulkParsedData.length > 0 && !bulkResult && (
                <div className="border border-[color:var(--ad-line)] rounded-[12px] overflow-hidden">
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full min-w-[800px] text-[12px]">
                      <thead className="bg-[color:var(--ad-bg-alt)] sticky top-0 text-[color:var(--ad-muted)]">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">상호명</th>
                          <th className="px-3 py-2 text-left font-medium">대표자명</th>
                          <th className="px-3 py-2 text-left font-medium">연락처</th>
                          <th className="px-3 py-2 text-left font-medium">이메일</th>
                          <th className="px-3 py-2 text-left font-medium">사업자번호</th>
                          <th className="px-3 py-2 text-left font-medium">주소</th>
                          <th className="px-3 py-2 text-left font-medium">업종</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--ad-line)]">
                        {bulkParsedData.slice(0, 20).map((row, idx) => (
                          <tr key={idx} className="hover:bg-[rgba(110,173,255,0.05)]">
                            <td className="px-3 py-1.5 ad-tnum text-[color:var(--ad-faint)]">{idx + 1}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink)] font-medium">{row.storeName}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)]">{row.ownerName || '-'}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)]">{row.phone || '-'}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)]">{row.email || '-'}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)] font-mono">{row.businessRegNumber || '-'}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)] max-w-[150px] truncate">{row.address || '-'}</td>
                            <td className="px-3 py-1.5 text-[color:var(--ad-ink-2)]">{STORE_CATEGORIES[row.category as keyof typeof STORE_CATEGORIES] || row.category || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkParsedData.length > 20 && (
                    <p className="px-3 py-2 text-[12px] text-[color:var(--ad-muted)] bg-[color:var(--ad-bg-alt)] border-t border-[color:var(--ad-line)]">
                      외 {bulkParsedData.length - 20}건 더 있음
                    </p>
                  )}
                </div>
              )}

              {/* 결과 */}
              {bulkResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 rounded-[12px] border border-[color:var(--ad-line)]">
                    <div className="p-3 text-center">
                      <p className="text-[12px] text-[color:var(--ad-muted)]">등록 성공</p>
                      <p className="text-[22px] font-semibold tracking-[-0.03em] ad-tnum text-[color:var(--ad-pos)]">{bulkResult.created}</p>
                    </div>
                    <div className="p-3 text-center border-l border-[color:var(--ad-line)]">
                      <p className="text-[12px] text-[color:var(--ad-muted)]">등록 실패</p>
                      <p className="text-[22px] font-semibold tracking-[-0.03em] ad-tnum text-[color:var(--ad-neg)]">{bulkResult.errors.length}</p>
                    </div>
                    <div className={`p-3 text-center border-l border-[color:var(--ad-line)] ${
                      bulkResult.crmOn && bulkResult.crmOn.failed > 0 ? 'bg-[#fff4ef]' : ''
                    }`}>
                      <p className={`text-[12px] ${
                        bulkResult.crmOn && bulkResult.crmOn.failed > 0 ? 'text-[#993d1f]' : 'text-[color:var(--ad-muted)]'
                      }`}>CRM ON</p>
                      <p className={`text-[22px] font-semibold tracking-[-0.03em] ad-tnum ${
                        bulkResult.crmOn && bulkResult.crmOn.failed > 0 ? 'text-[#993d1f]' : 'text-[color:var(--ad-link)]'
                      }`}>
                        {bulkResult.crmOn ? `${bulkResult.crmOn.success}/${bulkResult.created}` : '-'}
                      </p>
                    </div>
                  </div>
                  {bulkResult.errors.length > 0 && (
                    <div className="bg-[#fff0f3] rounded-[12px] p-3">
                      <p className="text-[12px] font-semibold text-[color:var(--ad-neg)] mb-1">등록 오류</p>
                      <ul className="text-[12px] text-[color:var(--ad-neg)] space-y-0.5">
                        {bulkResult.errors.slice(0, 15).map((err, i) => (
                          <li key={i}>{err.row}행 [{err.storeName}]: {err.reason}</li>
                        ))}
                        {bulkResult.errors.length > 15 && (
                          <li>외 {bulkResult.errors.length - 15}건...</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {bulkResult.crmOn && bulkResult.crmOn.failed > 0 && (
                    <div className="bg-[#fff4ef] rounded-[12px] p-3">
                      <p className="text-[12px] font-semibold text-[#993d1f] mb-1">CRM ON 실패 (수동 ON/OFF 필요)</p>
                      <ul className="text-[12px] text-[#993d1f] space-y-0.5">
                        {bulkResult.crmOn.failures.map((f, i) => (
                          <li key={i}>[{f.storeName}]: {f.error || 'CRM ON 실패'}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[color:var(--ad-line)]">
              <button
                onClick={() => setBulkModal(false)}
                className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                {bulkResult ? '닫기' : '취소'}
              </button>
              {!bulkResult && (
                <button
                  onClick={handleBulkUpload}
                  disabled={bulkParsedData.length === 0 || bulkUploading}
                  className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkUploading ? '등록 중...' : `${bulkParsedData.length}건 등록하기`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
