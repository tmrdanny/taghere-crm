'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';

interface Store {
  id: string;
  name: string;
  slug: string | null;
  ownerName: string | null;
}

interface BoothTable {
  tableNumber: string;
  url: string;
}

interface Booth {
  id: string;
  nameKo: string;
  nameEn?: string;
  categoryKo?: string;
  categoryEn?: string;
  imageUrl?: string;
  order: number;
  tables: BoothTable[];
}

interface FoodCourtSettings {
  enabled: boolean;
  randomizeOrder: boolean;
  customerTitle: string | null;
  customerSubtitle: string | null;
  noticeText: string | null;
  noticeLogoUrl: string | null;
  stores: Booth[];
  customerPageBaseUrl: string | null;
  storeName: string;
  storeSlug: string;
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `booth-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function getFullImageUrl(imageUrl?: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  return `${API_BASE}${imageUrl}`;
}

export default function AdminFoodCourtPage() {

  // Store list & search
  const [stores, setStores] = useState<Store[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Settings
  const [settings, setSettings] = useState<FoodCourtSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable state
  const [enabled, setEnabled] = useState(false);
  const [randomizeOrder, setRandomizeOrder] = useState(false);
  const [customerTitle, setCustomerTitle] = useState('');
  const [customerSubtitle, setCustomerSubtitle] = useState('');
  const [noticeText, setNoticeText] = useState('');
  const [noticeLogoUrl, setNoticeLogoUrl] = useState('');
  const [booths, setBooths] = useState<Booth[]>([]);

  // QR helper
  const [qrTableNumber, setQrTableNumber] = useState('');

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
        // 전 매장 목록은 /stores/options 를 쓴다 — /stores 는 pageSize 기반 페이지네이션이라
        // limit 을 넘겨도 무시되고 기본 30개(최근 생성순)만 돌아온다.
        const res = await fetch(`${API_BASE}/api/admin/stores/options`, {
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
  }, []);

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

  const handleSelectStore = async (store: Store) => {
    setSelectedStore(store);
    setStoreSearch(store.name);
    setShowDropdown(false);
    setIsLoadingSettings(true);

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE}/api/admin/food-court-settings/${store.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data: FoodCourtSettings = await res.json();
        setSettings(data);
        setEnabled(data.enabled);
        setRandomizeOrder(data.randomizeOrder ?? false);
        setCustomerTitle(data.customerTitle || '');
        setCustomerSubtitle(data.customerSubtitle || '');
        setNoticeText(data.noticeText || '');
        setNoticeLogoUrl(data.noticeLogoUrl || '');
        setBooths(data.stores || []);
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

  const buildPayload = () => ({
    enabled,
    randomizeOrder,
    stores: booths,
    customerTitle: customerTitle || null,
    customerSubtitle: customerSubtitle || null,
    noticeText: noticeText || null,
    noticeLogoUrl: noticeLogoUrl || null,
  });

  const handleSave = async () => {
    if (!selectedStore) return;

    for (const b of booths) {
      if (!b.nameKo.trim()) {
        showToast('매장 이름(한글)은 필수입니다.', 'error');
        return;
      }
      const numbers = b.tables.map((t) => t.tableNumber);
      if (new Set(numbers).size !== numbers.length) {
        showToast(`'${b.nameKo}' 매장에 중복된 테이블 번호가 있습니다.`, 'error');
        return;
      }
      for (const t of b.tables) {
        if (!t.tableNumber.trim() || !t.url.trim()) {
          showToast(`'${b.nameKo}' 매장의 테이블 번호와 URL은 필수입니다.`, 'error');
          return;
        }
        try {
          new URL(t.url);
        } catch {
          showToast(`잘못된 URL 형식입니다: ${t.url}`, 'error');
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_BASE}/api/admin/food-court-settings/${selectedStore.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
      });

      if (res.ok) {
        const data = await res.json();
        setBooths(data.stores || []);
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

  // Booth helpers
  const updateBooth = (boothId: string, patch: Partial<Booth>) => {
    setBooths((prev) => prev.map((b) => (b.id === boothId ? { ...b, ...patch } : b)));
  };

  const handleAddBooth = () => {
    setBooths((prev) => [
      ...prev,
      { id: genId(), nameKo: '', nameEn: '', categoryKo: '', categoryEn: '', imageUrl: '', order: prev.length, tables: [] },
    ]);
  };

  const handleRemoveBooth = (boothId: string) => {
    if (!confirm('이 매장을 삭제하시겠습니까? 등록된 테이블 링크도 함께 삭제됩니다.')) return;
    setBooths((prev) => prev.filter((b) => b.id !== boothId).map((b, i) => ({ ...b, order: i })));
  };

  const moveBooth = (index: number, dir: -1 | 1) => {
    setBooths((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((b, i) => ({ ...b, order: i }));
    });
  };

  // Booth image upload
  const uploadImage = async (file: File): Promise<string | null> => {
    const token = localStorage.getItem('adminToken');
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/api/admin/food-court-settings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      return data.imageUrl as string;
    }
    const error = await res.json().catch(() => ({}));
    showToast(error.error || '이미지 업로드에 실패했습니다.', 'error');
    return null;
  };

  const handleBoothImage = async (boothId: string, file: File) => {
    const url = await uploadImage(file);
    if (url) updateBooth(boothId, { imageUrl: url });
  };

  const handleNoticeLogo = async (file: File) => {
    const url = await uploadImage(file);
    if (url) setNoticeLogoUrl(url);
  };

  // Table helpers (within a booth)
  const addTable = (boothId: string) => {
    setBooths((prev) =>
      prev.map((b) => (b.id === boothId ? { ...b, tables: [...b.tables, { tableNumber: '', url: '' }] } : b))
    );
  };

  const removeTable = (boothId: string, index: number) => {
    setBooths((prev) =>
      prev.map((b) => (b.id === boothId ? { ...b, tables: b.tables.filter((_, i) => i !== index) } : b))
    );
  };

  const updateTable = (boothId: string, index: number, field: keyof BoothTable, value: string) => {
    setBooths((prev) =>
      prev.map((b) => {
        if (b.id !== boothId) return b;
        const tables = [...b.tables];
        tables[index] = { ...tables[index], [field]: value };
        return { ...b, tables };
      })
    );
  };

  // Bulk add tables to a booth (client-side; persisted on save)
  const bulkAddTables = (boothId: string, start: string, end: string, template: string) => {
    const s = parseInt(start);
    const e = parseInt(end);
    if (isNaN(s) || isNaN(e) || s < 1 || s > e) {
      showToast('유효한 범위를 입력해주세요.', 'error');
      return;
    }
    if (!template.trim()) {
      showToast('URL 템플릿을 입력해주세요.', 'error');
      return;
    }
    setBooths((prev) =>
      prev.map((b) => {
        if (b.id !== boothId) return b;
        const existing = new Set(b.tables.map((t) => t.tableNumber));
        const added: BoothTable[] = [];
        for (let i = s; i <= e; i++) {
          const num = String(i);
          if (!existing.has(num)) {
            added.push({ tableNumber: num, url: template.replace(/\{number\}/g, num) });
          }
        }
        return { ...b, tables: [...b.tables, ...added] };
      })
    );
    showToast('테이블이 추가되었습니다. 저장을 눌러 반영하세요.', 'success');
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('복사되었습니다.');
  };

  const filteredStores = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
      (s.ownerName && s.ownerName.toLowerCase().includes(storeSearch.toLowerCase()))
  );

  const fullQrUrl =
    settings?.customerPageBaseUrl && qrTableNumber
      ? `${settings.customerPageBaseUrl}/${qrTableNumber}`
      : '';

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-[10px] shadow-lg text-white text-[13px] font-medium transition-all ${
            toast.type === 'success' ? 'bg-[color:var(--ad-pos)]' : 'bg-[color:var(--ad-neg)]'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <p className="text-[13px] text-[color:var(--ad-muted)]">
          테이블별 QR로 접속한 고객에게 여러 매장(부스)을 보여주고, 매장을 선택하면 해당 테이블의 결제 링크로 이동시킵니다.
        </p>
      </div>

      {/* Store selector */}
      <div className="mb-6" ref={dropdownRef}>
        <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">매장 선택 (푸드코트 운영 매장)</label>
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
            className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          />

          {showDropdown && filteredStores.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] max-h-[300px] overflow-y-auto z-10">
              {filteredStores.slice(0, 50).map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-[color:var(--ad-bg-alt)] text-[13px] border-b border-[color:var(--ad-line)] last:border-0 ${
                    selectedStore?.id === store.id ? 'bg-[color:var(--ad-yellow-soft)]' : ''
                  }`}
                >
                  <span className="font-medium text-[color:var(--ad-ink)]">{store.name}</span>
                  {store.ownerName && <span className="text-[color:var(--ad-muted)] ml-2">({store.ownerName})</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoadingSettings && <div className="text-center py-12 text-[13px] text-[color:var(--ad-faint)]">설정을 불러오는 중...</div>}

      {/* No store selected */}
      {!selectedStore && !isLoadingSettings && (
        <div className="text-center py-16 text-[color:var(--ad-faint)]">
          <p className="text-[13px]">매장을 선택하면 푸드코트 모드를 설정할 수 있습니다.</p>
        </div>
      )}

      {/* Settings form */}
      {selectedStore && settings && !isLoadingSettings && (
        <div className="space-y-4">
          {/* 활성화 토글 */}
          <div className="ad-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">서비스 활성화</h3>
                <p className="text-[12px] text-[color:var(--ad-faint)] mt-1">
                  활성화하면 고객이 QR로 접속하여 매장을 선택하고 결제 페이지로 이동할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-[color:var(--ad-yellow)]' : 'bg-[color:var(--ad-line-strong)]'}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 랜덤 배치 토글 */}
          <div className="ad-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">매장 랜덤 배치</h3>
                <p className="text-[12px] text-[color:var(--ad-faint)] mt-1">
                  활성화하면 고객이 접속할 때마다 매장 노출 순서가 랜덤으로 바뀝니다. (특정 매장 상단 고정 노출 방지)
                </p>
              </div>
              <button
                onClick={() => setRandomizeOrder(!randomizeOrder)}
                className={`relative w-11 h-6 rounded-full transition-colors ${randomizeOrder ? 'bg-[color:var(--ad-yellow)]' : 'bg-[color:var(--ad-line-strong)]'}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    randomizeOrder ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* QR 링크 안내 */}
          {settings.customerPageBaseUrl && (
            <div className="ad-card p-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-1">테이블별 QR 링크</h3>
              <p className="text-[12px] text-[color:var(--ad-faint)] mb-3">
                테이블마다 번호가 들어간 QR을 부착하세요. 아래에서 테이블 번호를 입력하면 전체 URL을 만들 수 있습니다.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] text-[color:var(--ad-faint)] truncate">{settings.customerPageBaseUrl}/</span>
                <input
                  type="number"
                  value={qrTableNumber}
                  onChange={(e) => setQrTableNumber(e.target.value)}
                  placeholder="3"
                  min="1"
                  className="h-10 w-24 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] ad-tnum placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>
              {fullQrUrl && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={fullQrUrl}
                    readOnly
                    className="h-10 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-[color:var(--ad-bg-alt)] px-3 text-[13px] text-[color:var(--ad-ink-2)]"
                  />
                  <button
                    onClick={() => copyText(fullQrUrl)}
                    className="ad-press h-10 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] whitespace-nowrap"
                  >
                    복사
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 고객 안내 문구 */}
          <div className="ad-card p-5">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-1">고객 페이지 안내 문구</h3>
            <p className="text-[12px] text-[color:var(--ad-faint)] mb-4">비워두면 기본 문구가 사용됩니다.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">제목 (줄바꿈 가능)</label>
                <textarea
                  value={customerTitle}
                  onChange={(e) => setCustomerTitle(e.target.value)}
                  placeholder={'안녕하세요.\n글로우성수에 오신 것을 환영합니다.'}
                  rows={2}
                  className="w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">부제목</label>
                <input
                  type="text"
                  value={customerSubtitle}
                  onChange={(e) => setCustomerSubtitle(e.target.value)}
                  placeholder="매장을 선택해주세요"
                  className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 공지 배너 */}
          <div className="ad-card p-5">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-1">공지 배너 (검정 박스)</h3>
            <p className="text-[12px] text-[color:var(--ad-faint)] mb-4">본문을 비워두면 배너가 표시되지 않습니다.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">로고 이미지</label>
                <div className="flex items-center gap-3">
                  {noticeLogoUrl && (
                    <img
                      src={getFullImageUrl(noticeLogoUrl)}
                      alt="logo"
                      className="h-10 object-contain bg-[color:var(--ad-ink)] rounded-[8px] px-2"
                    />
                  )}
                  <label className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] inline-flex items-center cursor-pointer">
                    이미지 업로드
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleNoticeLogo(e.target.files[0])}
                    />
                  </label>
                  {noticeLogoUrl && (
                    <button
                      onClick={() => setNoticeLogoUrl('')}
                      className="text-[12.5px] font-medium text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)]"
                    >
                      제거
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">본문 (줄바꿈 가능)</label>
                <textarea
                  value={noticeText}
                  onChange={(e) => setNoticeText(e.target.value)}
                  placeholder={'각 부스 별로 따로 결제를 해주셔야 합니다.\nYou need to make separate payments for each store'}
                  rows={3}
                  className="w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* 매장(부스) 목록 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">매장(부스) 목록</h3>
                <p className="text-[12px] text-[color:var(--ad-faint)] mt-0.5">{booths.length}개 등록됨</p>
              </div>
              <button
                onClick={handleAddBooth}
                className="ad-press h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                + 매장 추가
              </button>
            </div>

            {booths.length === 0 ? (
              <div className="ad-card text-center py-10 text-[color:var(--ad-faint)]">
                <p className="text-[13px]">등록된 매장이 없습니다.</p>
                <p className="text-[12px] mt-1">"매장 추가" 버튼으로 부스를 등록하세요.</p>
              </div>
            ) : (
              booths.map((booth, index) => (
                <BoothCard
                  key={booth.id}
                  booth={booth}
                  index={index}
                  total={booths.length}
                  onUpdate={updateBooth}
                  onRemove={handleRemoveBooth}
                  onMove={moveBooth}
                  onImage={handleBoothImage}
                  onAddTable={addTable}
                  onRemoveTable={removeTable}
                  onUpdateTable={updateTable}
                  onBulkAdd={bulkAddTables}
                />
              ))
            )}
          </div>

          {/* 저장 버튼 */}
          <div className="flex justify-end pb-8 sticky bottom-0 bg-gradient-to-t from-[color:var(--ad-bg)] via-[color:var(--ad-bg)] to-transparent pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="ad-press inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BoothCard({
  booth,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
  onImage,
  onAddTable,
  onRemoveTable,
  onUpdateTable,
  onBulkAdd,
}: {
  booth: Booth;
  index: number;
  total: number;
  onUpdate: (id: string, patch: Partial<Booth>) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onImage: (id: string, file: File) => void;
  onAddTable: (id: string) => void;
  onRemoveTable: (id: string, index: number) => void;
  onUpdateTable: (id: string, index: number, field: keyof BoothTable, value: string) => void;
  onBulkAdd: (id: string, start: string, end: string, template: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState('');

  return (
    <div className="ad-card p-5">
      <div className="flex items-start gap-4">
        {/* Image */}
        <div className="flex-shrink-0">
          <div className="w-20 h-20 rounded-[10px] overflow-hidden bg-[color:var(--ad-bg)] mb-1">
            {booth.imageUrl ? (
              <img src={getFullImageUrl(booth.imageUrl)} alt={booth.nameKo} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[color:var(--ad-faint)] text-[11px] text-center">
                이미지<br />없음
              </div>
            )}
          </div>
          <label className="block text-center text-[11px] font-medium text-[color:var(--ad-link)] hover:underline cursor-pointer">
            업로드
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onImage(booth.id, e.target.files[0])}
            />
          </label>
        </div>

        {/* Fields */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
          <input
            value={booth.nameKo}
            onChange={(e) => onUpdate(booth.id, { nameKo: e.target.value })}
            placeholder="매장명 (한글) *"
            className="h-10 min-w-0 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          />
          <input
            value={booth.nameEn || ''}
            onChange={(e) => onUpdate(booth.id, { nameEn: e.target.value })}
            placeholder="매장명 (영문)"
            className="h-10 min-w-0 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          />
          <input
            value={booth.categoryKo || ''}
            onChange={(e) => onUpdate(booth.id, { categoryKo: e.target.value })}
            placeholder="카테고리 (한글)"
            className="h-10 min-w-0 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          />
          <input
            value={booth.categoryEn || ''}
            onChange={(e) => onUpdate(booth.id, { categoryEn: e.target.value })}
            placeholder="카테고리 (영문)"
            className="h-10 min-w-0 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] disabled:opacity-30"
            title="위로"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] disabled:opacity-30"
            title="아래로"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => onRemove(booth.id)}
            className="p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)]"
            title="삭제"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Table links toggle */}
      <div className="mt-4 pt-4 border-t border-[color:var(--ad-line)]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ad-ink-2)] hover:text-[color:var(--ad-ink)]"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          테이블별 결제 링크 ({booth.tables.length}개)
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Bulk add */}
            <div className="bg-[color:var(--ad-bg-alt)] rounded-[12px] p-3">
              <p className="text-[12px] font-medium text-[color:var(--ad-muted)] mb-2">
                일괄 추가 (<code className="bg-[color:var(--ad-bg)] text-[color:var(--ad-ink-2)] px-1 rounded text-[11px]">{'{number}'}</code> → 테이블 번호)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                  placeholder="시작"
                  min="1"
                  className="w-16 px-2 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none text-center ad-tnum"
                />
                <span className="text-[color:var(--ad-faint)]">~</span>
                <input
                  type="number"
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                  placeholder="끝"
                  min="1"
                  className="w-16 px-2 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none text-center ad-tnum"
                />
                <input
                  value={bulkTemplate}
                  onChange={(e) => setBulkTemplate(e.target.value)}
                  placeholder="https://order.com/menu?table={number}"
                  className="flex-1 min-w-[200px] px-2.5 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
                <button
                  onClick={() => {
                    onBulkAdd(booth.id, bulkStart, bulkEnd, bulkTemplate);
                    setBulkStart('');
                    setBulkEnd('');
                    setBulkTemplate('');
                  }}
                  className="ad-press inline-flex items-center justify-center h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)]"
                >
                  추가
                </button>
              </div>
            </div>

            {/* Manual rows */}
            {booth.tables.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <div className="grid grid-cols-[70px_1fr_36px] gap-2 px-1">
                  <span className="text-[11.5px] font-medium text-[color:var(--ad-muted)]">번호</span>
                  <span className="text-[11.5px] font-medium text-[color:var(--ad-muted)]">URL</span>
                  <span></span>
                </div>
                {booth.tables.map((table, i) => (
                  <div key={i} className="grid grid-cols-[70px_1fr_36px] gap-2 items-center">
                    <input
                      value={table.tableNumber}
                      onChange={(e) => onUpdateTable(booth.id, i, 'tableNumber', e.target.value)}
                      placeholder="번호"
                      className="px-2 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none text-center ad-tnum"
                    />
                    <input
                      value={table.url}
                      onChange={(e) => onUpdateTable(booth.id, i, 'url', e.target.value)}
                      placeholder="https://..."
                      className="px-2.5 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                    />
                    <button
                      onClick={() => onRemoveTable(booth.id, i)}
                      className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => onAddTable(booth.id)}
              className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
            >
              + 테이블 추가
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
