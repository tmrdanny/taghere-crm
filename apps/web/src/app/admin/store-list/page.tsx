'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
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
}

// 업종 분류
const STORE_CATEGORIES: Record<string, string> = {
  // 음식점
  KOREAN: '한식',
  CHINESE: '중식',
  JAPANESE: '일식',
  WESTERN: '양식',
  ASIAN: '아시안 (베트남, 태국 등)',
  BUNSIK: '분식',
  FASTFOOD: '패스트푸드',
  MEAT: '고기/구이',
  SEAFOOD: '해산물',
  BUFFET: '뷔페',
  BRUNCH: '브런치',
  // 카페/디저트
  CAFE: '카페',
  BAKERY: '베이커리',
  DESSERT: '디저트',
  ICECREAM: '아이스크림',
  // 주점
  BEER: '호프/맥주',
  IZAKAYA: '이자카야',
  WINE_BAR: '와인바',
  COCKTAIL_BAR: '칵테일바',
  POCHA: '포차/실내포장마차',
  KOREAN_PUB: '한식 주점',
  COOK_PUB: '요리주점',
  // 기타
  FOODCOURT: '푸드코트',
  OTHER: '기타',
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // 대량 등록
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkParsedData, setBulkParsedData] = useState<BulkStoreRow[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 필터링된 매장 목록
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        store.name.toLowerCase().includes(query) ||
        store.ownerName?.toLowerCase().includes(query) ||
        store.businessRegNumber?.includes(query) ||
        store.phone?.includes(query);

      const matchesCategory = !categoryFilter || store.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [stores, searchQuery, categoryFilter]);

  // 페이지네이션
  const totalPages = Math.ceil(filteredStores.length / ITEMS_PER_PAGE);
  const paginatedStores = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStores.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStores, currentPage]);

  // 검색/필터 변경 시 첫 페이지로
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter]);

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

      const parsed: BulkStoreRow[] = rows.map((row) => {
        const rawCategory = (row['업종'] || '').trim();
        return {
          storeName: (row['상호명'] || '').trim(),
          ownerName: (row['대표자명'] || '').trim(),
          phone: (row['연락처'] || '').toString().trim(),
          email: (row['점주이메일'] || '').trim(),
          businessRegNumber: (row['사업자등록번호'] || '').toString().trim(),
          address: (row['주소'] || '').trim(),
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stores/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stores: bulkParsedData }),
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

  // Excel 다운로드
  const handleDownloadExcel = () => {
    const excelData = filteredStores.map((store) => ({
      '상호명': store.name,
      '대표자명': store.ownerName || '-',
      '연락처': store.phone || '-',
      '점주 이메일': store.ownerEmail || '-',
      '사업자등록번호': store.businessRegNumber || '-',
      '주소': store.address || '-',
      '업종': store.category ? STORE_CATEGORIES[store.category] || store.category : '-',
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-neutral-900">매장 목록</h2>
            <p className="text-[13px] text-neutral-500 mt-0.5">
              총 {filteredStores.length}개 매장
              {searchQuery || categoryFilter ? ` (전체 ${stores.length}개)` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBulkModal(true); setBulkParsedData([]); setBulkResult(null); }}
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <UploadIcon className="w-4 h-4" />
              매장 대량등록
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={filteredStores.length === 0}
              className="h-10 px-4 bg-green-600 hover:bg-green-700 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full h-10 pl-10 pr-4 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 px-3 bg-white border border-[#EAEAEA] rounded-lg text-[14px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#FFD541]/50 focus:border-[#FFD541]"
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
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-[#EAEAEA]">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  상호명
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  대표자명
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  연락처
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  점주 이메일
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  사업자번호
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  주소
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  업종
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  고객 수
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  충전금
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  적립률
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  CRM
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-neutral-600 uppercase tracking-wider">
                  가입일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {paginatedStores.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-neutral-500 text-[14px]">
                    {searchQuery || categoryFilter ? '검색 결과가 없습니다.' : '등록된 매장이 없습니다.'}
                  </td>
                </tr>
              ) : (
                paginatedStores.map((store) => (
                  <tr key={store.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium text-neutral-900">
                      {store.name}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700">
                      {store.ownerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700">
                      {store.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700">
                      {store.ownerEmail || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700 font-mono">
                      {store.businessRegNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700 max-w-[200px] truncate" title={store.address || undefined}>
                      {store.address || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-700">
                      {store.category ? STORE_CATEGORIES[store.category] || store.category : '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-900 text-right font-medium">
                      {formatNumber(store.customerCount)}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-900 text-right font-medium">
                      {formatNumber(store.walletBalance)}원
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-900 text-right">
                      {store.pointRatePercent}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-1 text-[11px] font-medium rounded ${
                          store.crmEnabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {store.crmEnabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-neutral-600">
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#EAEAEA] bg-neutral-50">
            <p className="text-[13px] text-neutral-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredStores.length)} / {filteredStores.length}개
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 text-neutral-600 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-[13px] text-neutral-700 min-w-[80px] text-center">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-neutral-600 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 대량등록 모달 */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EAEAEA]">
              <h3 className="text-[16px] font-semibold text-neutral-900">매장 대량등록</h3>
              <button onClick={() => setBulkModal(false)} className="text-neutral-400 hover:text-neutral-600">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-[13px] text-neutral-600">
                엑셀 파일로 매장을 일괄 등록할 수 있습니다. (최대 500건)
                <br />
                초기 비밀번호: <span className="font-mono font-semibold">taghere1234</span>
              </p>

              {/* 샘플 다운로드 + 파일 선택 */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadBulkSample}
                  className="h-9 px-3 text-[13px] text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
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
                  className="h-9 px-3 text-[13px] text-neutral-700 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  {bulkParsedData.length > 0
                    ? `${bulkParsedData.length}건 로드됨 (다시 선택하려면 클릭)`
                    : '엑셀 파일 선택 (.xlsx, .xls, .csv)'}
                </button>
              </div>

              {/* 미리보기 테이블 */}
              {bulkParsedData.length > 0 && !bulkResult && (
                <div className="border border-[#EAEAEA] rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full min-w-[800px] text-[12px]">
                      <thead className="bg-neutral-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">상호명</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">대표자명</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">연락처</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">이메일</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">사업자번호</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">주소</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">업종</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAEAEA]">
                        {bulkParsedData.slice(0, 20).map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50">
                            <td className="px-3 py-1.5 text-neutral-400">{idx + 1}</td>
                            <td className="px-3 py-1.5 text-neutral-900 font-medium">{row.storeName}</td>
                            <td className="px-3 py-1.5 text-neutral-700">{row.ownerName || '-'}</td>
                            <td className="px-3 py-1.5 text-neutral-700">{row.phone || '-'}</td>
                            <td className="px-3 py-1.5 text-neutral-700">{row.email || '-'}</td>
                            <td className="px-3 py-1.5 text-neutral-700 font-mono">{row.businessRegNumber || '-'}</td>
                            <td className="px-3 py-1.5 text-neutral-700 max-w-[150px] truncate">{row.address || '-'}</td>
                            <td className="px-3 py-1.5 text-neutral-700">{STORE_CATEGORIES[row.category] || row.category || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkParsedData.length > 20 && (
                    <p className="px-3 py-2 text-[12px] text-neutral-500 bg-neutral-50 border-t border-[#EAEAEA]">
                      외 {bulkParsedData.length - 20}건 더 있음
                    </p>
                  )}
                </div>
              )}

              {/* 결과 */}
              {bulkResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-[12px] text-green-600">등록 성공</p>
                      <p className="text-2xl font-bold text-green-700">{bulkResult.created}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <p className="text-[12px] text-red-600">실패</p>
                      <p className="text-2xl font-bold text-red-700">{bulkResult.errors.length}</p>
                    </div>
                  </div>
                  {bulkResult.errors.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-[12px] font-semibold text-red-700 mb-1">오류 상세</p>
                      <ul className="text-[12px] text-red-600 space-y-0.5">
                        {bulkResult.errors.slice(0, 15).map((err, i) => (
                          <li key={i}>{err.row}행 [{err.storeName}]: {err.reason}</li>
                        ))}
                        {bulkResult.errors.length > 15 && (
                          <li>외 {bulkResult.errors.length - 15}건...</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#EAEAEA]">
              <button
                onClick={() => setBulkModal(false)}
                className="h-9 px-4 text-[13px] text-neutral-600 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors"
              >
                {bulkResult ? '닫기' : '취소'}
              </button>
              {!bulkResult && (
                <button
                  onClick={handleBulkUpload}
                  disabled={bulkParsedData.length === 0 || bulkUploading}
                  className="h-9 px-4 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
