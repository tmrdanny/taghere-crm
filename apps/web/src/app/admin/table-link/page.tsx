'use client';

import { useEffect, useState, useRef } from 'react';

interface Store {
  id: string;
  name: string;
  slug: string | null;
  ownerName: string | null;
}

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

interface TableLinkSettings {
  enabled: boolean;
  customerTitle: string | null;
  customerSubtitle: string | null;
  tables: TableEntry[];
  customerPageUrl: string | null;
  storeName: string;
  storeSlug: string;
}

export default function AdminTableLinkPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Store list & search
  const [stores, setStores] = useState<Store[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Settings
  const [settings, setSettings] = useState<TableLinkSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Editable state
  const [enabled, setEnabled] = useState(false);
  const [customerTitle, setCustomerTitle] = useState('');
  const [customerSubtitle, setCustomerSubtitle] = useState('');
  const [tables, setTables] = useState<TableEntry[]>([]);

  // Bulk add
  const [bulkStartNumber, setBulkStartNumber] = useState('');
  const [bulkEndNumber, setBulkEndNumber] = useState('');
  const [bulkUrlTemplate, setBulkUrlTemplate] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch stores
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${apiUrl}/api/admin/stores?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStores(data.stores || data);
        }
      } catch (error) {
        console.error('Failed to fetch stores:', error);
      }
    };
    fetchStores();
  }, [apiUrl]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch settings when store is selected
  const handleSelectStore = async (store: Store) => {
    setSelectedStore(store);
    setStoreSearch(store.name);
    setShowDropdown(false);
    setIsLoadingSettings(true);

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${apiUrl}/api/admin/table-link-settings/${store.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data: TableLinkSettings = await res.json();
        setSettings(data);
        setEnabled(data.enabled);
        setCustomerTitle(data.customerTitle || '');
        setCustomerSubtitle(data.customerSubtitle || '');
        setTables(data.tables || []);
      } else {
        showToast('설정을 불러오는데 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      showToast('설정을 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSave = async () => {
    if (!selectedStore) return;

    for (const t of tables) {
      if (!t.tableNumber.trim() || !t.url.trim()) {
        showToast('테이블 번호와 URL은 필수입니다.', 'error');
        return;
      }
      try {
        new URL(t.url);
      } catch {
        showToast(`잘못된 URL 형식입니다: ${t.url}`, 'error');
        return;
      }
    }

    const numbers = tables.map(t => t.tableNumber);
    if (new Set(numbers).size !== numbers.length) {
      showToast('중복된 테이블 번호가 있습니다.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${apiUrl}/api/admin/table-link-settings/${selectedStore.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled,
          tables,
          customerTitle: customerTitle || null,
          customerSubtitle: customerSubtitle || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!selectedStore) return;
    if (!bulkStartNumber || !bulkEndNumber || !bulkUrlTemplate) {
      showToast('시작 번호, 끝 번호, URL 템플릿을 모두 입력해주세요.', 'error');
      return;
    }

    setIsBulkAdding(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${apiUrl}/api/admin/table-link-settings/${selectedStore.id}/bulk-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startNumber: bulkStartNumber,
          endNumber: bulkEndNumber,
          urlTemplate: bulkUrlTemplate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        setBulkStartNumber('');
        setBulkEndNumber('');
        setBulkUrlTemplate('');
        showToast(`${data.addedCount}개 테이블 추가됨${data.skippedCount > 0 ? ` (중복 ${data.skippedCount}개 건너뜀)` : ''}`, 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '일괄 추가 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to bulk add:', error);
      showToast('일괄 추가 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBulkAdding(false);
    }
  };

  const handleAddTable = () => {
    if (tables.length >= 100) {
      showToast('테이블은 최대 100개까지 등록할 수 있습니다.', 'error');
      return;
    }
    setTables([...tables, { tableNumber: '', url: '' }]);
  };

  const handleRemoveTable = (index: number) => {
    setTables(tables.filter((_, i) => i !== index));
  };

  const handleTableChange = (index: number, field: keyof TableEntry, value: string) => {
    const updated = [...tables];
    updated[index] = { ...updated[index], [field]: value };
    setTables(updated);
  };

  const handleCopyUrl = () => {
    if (settings?.customerPageUrl) {
      navigator.clipboard.writeText(settings.customerPageUrl);
      showToast('URL이 복사되었습니다.');
    }
  };

  const filteredStores = stores.filter(s =>
    s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
    (s.ownerName && s.ownerName.toLowerCase().includes(storeSearch.toLowerCase()))
  );

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-[14px] font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">테이블 링크</h1>
        <p className="text-neutral-500 text-[14px] mt-1">
          매장별 테이블 번호와 주문 URL을 설정합니다. 고객이 QR코드로 접속하여 테이블 번호를 입력하면 해당 URL로 이동합니다.
        </p>
      </div>

      {/* Store selector */}
      <div className="mb-6" ref={dropdownRef}>
        <label className="block text-[14px] font-medium text-neutral-700 mb-2">매장 선택</label>
        <div className="relative">
          <input
            type="text"
            value={storeSearch}
            onChange={(e) => {
              setStoreSearch(e.target.value);
              setShowDropdown(true);
              if (selectedStore && e.target.value !== selectedStore.name) {
                setSelectedStore(null);
                setSettings(null);
              }
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="매장명 또는 대표자명으로 검색..."
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
          />

          {showDropdown && filteredStores.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-[300px] overflow-y-auto z-10">
              {filteredStores.slice(0, 50).map(store => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-neutral-50 text-[14px] border-b border-neutral-100 last:border-0 ${
                    selectedStore?.id === store.id ? 'bg-[#FFF8E1]' : ''
                  }`}
                >
                  <span className="font-medium text-neutral-900">{store.name}</span>
                  {store.ownerName && (
                    <span className="text-neutral-500 ml-2">({store.ownerName})</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoadingSettings && (
        <div className="text-center py-12 text-neutral-500">설정을 불러오는 중...</div>
      )}

      {/* No store selected */}
      {!selectedStore && !isLoadingSettings && (
        <div className="text-center py-16 text-neutral-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <p className="text-[15px]">매장을 선택하면 테이블 링크를 설정할 수 있습니다.</p>
        </div>
      )}

      {/* Settings form */}
      {selectedStore && settings && !isLoadingSettings && (
        <div className="space-y-6">
          {/* 활성화 토글 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-900">서비스 활성화</h3>
                <p className="text-[13px] text-neutral-500 mt-1">
                  활성화하면 고객이 테이블 번호를 입력하여 주문 페이지로 이동할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enabled ? 'bg-[#FFD541]' : 'bg-neutral-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 고객 페이지 URL */}
          {settings.customerPageUrl && (
            <div className="bg-white border border-neutral-200 rounded-xl p-6">
              <h3 className="font-semibold text-neutral-900 mb-1">고객 페이지 URL</h3>
              <p className="text-[13px] text-neutral-500 mb-3">
                이 URL로 QR코드를 생성하여 매장에 부착하세요.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={settings.customerPageUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-[13px] text-neutral-700"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap"
                >
                  복사
                </button>
              </div>
            </div>
          )}

          {/* 고객 안내 문구 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <h3 className="font-semibold text-neutral-900 mb-1">고객 페이지 안내 문구</h3>
            <p className="text-[13px] text-neutral-500 mb-4">
              비워두면 기본 문구가 사용됩니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-medium text-neutral-600 mb-1">제목</label>
                <input
                  type="text"
                  value={customerTitle}
                  onChange={(e) => setCustomerTitle(e.target.value)}
                  placeholder={`${settings.storeName} 모바일 주문`}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-neutral-600 mb-1">부제목</label>
                <input
                  type="text"
                  value={customerSubtitle}
                  onChange={(e) => setCustomerSubtitle(e.target.value)}
                  placeholder="테이블 번호를 입력해주세요"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* 일괄 추가 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <h3 className="font-semibold text-neutral-900 mb-1">테이블 일괄 추가</h3>
            <p className="text-[13px] text-neutral-500 mb-4">
              테이블 번호 범위와 URL 패턴을 지정하여 한 번에 추가합니다.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[13px] font-medium text-neutral-600 mb-1">시작 번호</label>
                <input
                  type="number"
                  value={bulkStartNumber}
                  onChange={(e) => setBulkStartNumber(e.target.value)}
                  placeholder="1"
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-neutral-600 mb-1">끝 번호</label>
                <input
                  type="number"
                  value={bulkEndNumber}
                  onChange={(e) => setBulkEndNumber(e.target.value)}
                  placeholder="50"
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-[13px] font-medium text-neutral-600 mb-1">URL 템플릿</label>
              <input
                type="text"
                value={bulkUrlTemplate}
                onChange={(e) => setBulkUrlTemplate(e.target.value)}
                placeholder="https://example.com/order?table={number}"
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
              />
              <p className="text-[12px] text-neutral-400 mt-1">
                <code className="bg-neutral-100 px-1 py-0.5 rounded text-[11px]">{'{number}'}</code>를 사용하면 테이블 번호로 자동 치환됩니다.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleBulkAdd}
                disabled={isBulkAdding || !bulkStartNumber || !bulkEndNumber || !bulkUrlTemplate}
                className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-[13px] font-medium hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 transition-colors"
              >
                {isBulkAdding ? '추가 중...' : '일괄 추가'}
              </button>
            </div>
          </div>

          {/* 테이블 목록 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-neutral-900">테이블 목록</h3>
                <p className="text-[13px] text-neutral-500 mt-0.5">
                  {tables.length}개 등록됨 (최대 100개)
                </p>
              </div>
              <button
                onClick={handleAddTable}
                className="px-3 py-1.5 border border-neutral-300 rounded-lg text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                + 추가
              </button>
            </div>

            {tables.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">
                <p className="text-[14px]">등록된 테이블이 없습니다.</p>
                <p className="text-[12px] mt-1">위의 일괄 추가 또는 추가 버튼을 사용하세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[70px_1fr_36px] gap-2 px-1">
                  <span className="text-[12px] font-medium text-neutral-500">번호</span>
                  <span className="text-[12px] font-medium text-neutral-500">URL</span>
                  <span></span>
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {tables.map((table, index) => (
                    <div key={index} className="grid grid-cols-[70px_1fr_36px] gap-2 items-center">
                      <input
                        value={table.tableNumber}
                        onChange={(e) => handleTableChange(index, 'tableNumber', e.target.value)}
                        placeholder="번호"
                        className="px-2 py-1.5 border border-neutral-200 rounded-lg text-[13px] text-center focus:outline-none focus:ring-1 focus:ring-[#FFD541]"
                      />
                      <input
                        value={table.url}
                        onChange={(e) => handleTableChange(index, 'url', e.target.value)}
                        placeholder="https://..."
                        className="px-2 py-1.5 border border-neutral-200 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#FFD541]"
                      />
                      <button
                        onClick={() => handleRemoveTable(index)}
                        className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 저장 버튼 */}
          <div className="flex justify-end pb-8">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#FFD541] text-neutral-900 rounded-lg text-[14px] font-semibold hover:bg-[#FFCA00] disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors"
            >
              {isSaving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
