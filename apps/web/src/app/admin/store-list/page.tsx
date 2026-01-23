'use client';

import { useEffect, useState, useMemo } from 'react';
import { formatNumber } from '@/lib/utils';
import * as XLSX from 'xlsx';

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
          <button
            onClick={handleDownloadExcel}
            disabled={filteredStores.length === 0}
            className="h-10 px-4 bg-green-600 hover:bg-green-700 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadIcon className="w-4 h-4" />
            Excel 다운로드
          </button>
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
