'use client';

import { useEffect, useState } from 'react';

interface TemplateVariableRow {
  variable: string;
  value: string;
}

interface CouponData {
  id: string;
  brandName: string;
  imageUrl: string;
  displayOrder: number;
  templateId: string;
  couponName: string;
  couponContent: string;
  couponAmount: string;
  amountValue: number;
  expiryDate: string;
  registrationMethod: string;
  landingLink: string;
  couponLink: string;
  templateVariables: TemplateVariableRow[] | null;
  enabled: boolean;
}

const emptyCoupon: Omit<CouponData, 'id'> = {
  brandName: '',
  imageUrl: '',
  displayOrder: 0,
  templateId: 'KA01TP250930075547299ikOWJ6bArTY',
  couponName: '',
  couponContent: '',
  couponAmount: '',
  amountValue: 0,
  expiryDate: '',
  registrationMethod: '',
  landingLink: '',
  couponLink: '',
  templateVariables: [],
  enabled: true,
};

const DEFAULT_VARIABLE_PRESET: TemplateVariableRow[] = [
  { variable: '#{쿠폰명}', value: '' },
  { variable: '#{쿠폰 내용}', value: '' },
  { variable: '#{쿠폰 금액}', value: '' },
  { variable: '#{유효기간}', value: '' },
  { variable: '#{등록방법}', value: '' },
  { variable: '#{랜딩 링크}', value: '' },
  { variable: '#{쿠폰 링크}', value: '' },
];

// 페이지 표시용 필드 (멤버십 페이지 UI에 사용)
const DISPLAY_FIELDS = [
  { key: 'brandName' as const, label: '브랜드명', placeholder: '예: 세븐일레븐' },
  { key: 'imageUrl' as const, label: '브랜드 아이콘 URL', placeholder: 'https://...png' },
  { key: 'couponName' as const, label: '쿠폰명 (시트 표시용)', placeholder: '예: 세븐일레븐 5,000원 쿠폰' },
  { key: 'couponAmount' as const, label: '쿠폰 금액 (표시용 텍스트)', placeholder: '예: 5,000원' },
  { key: 'amountValue' as const, label: '쿠폰 금액 (숫자, 합계 계산용)', placeholder: '예: 5000' },
  { key: 'expiryDate' as const, label: '유효기간 (시트 표시용)', placeholder: '예: 2026.04.30' },
];

export default function CorporateAdPage() {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<CouponData | (Omit<CouponData, 'id'> & { id?: string }) | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchCoupons();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchCoupons = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data);
      }
    } catch (error) {
      console.error('Failed to fetch coupons:', error);
      setToast({ message: '쿠폰 목록을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setEditing({ ...emptyCoupon, displayOrder: coupons.length });
  };

  const handleEdit = (coupon: CouponData) => {
    setEditing(coupon);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 쿠폰을 삭제하시겠습니까?')) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCoupons(coupons.filter((c) => c.id !== id));
        setToast({ message: '쿠폰이 삭제되었습니다.', type: 'success' });
      }
    } catch {
      setToast({ message: '삭제에 실패했습니다.', type: 'error' });
    }
  };

  const handleToggleEnabled = async (coupon: CouponData) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ads/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !coupon.enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCoupons(coupons.map((c) => (c.id === updated.id ? updated : c)));
      }
    } catch {
      setToast({ message: '토글 실패', type: 'error' });
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= coupons.length) return;
    const newCoupons = [...coupons];
    [newCoupons[index], newCoupons[target]] = [newCoupons[target], newCoupons[index]];
    setCoupons(newCoupons);

    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      await fetch(`${apiUrl}/api/admin/corporate-ads/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orders: newCoupons.map((c, i) => ({ id: c.id, displayOrder: i })),
        }),
      });
    } catch {
      setToast({ message: '순서 변경 실패', type: 'error' });
      fetchCoupons();
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    setIsSaving(true);
    try {
      const isNew = !('id' in editing) || !editing.id;
      const url = isNew
        ? `${apiUrl}/api/admin/corporate-ads`
        : `${apiUrl}/api/admin/corporate-ads/${editing.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        await fetchCoupons();
        setEditing(null);
        setToast({ message: isNew ? '쿠폰이 추가되었습니다.' : '쿠폰이 저장되었습니다.', type: 'success' });
      } else {
        setToast({ message: '저장에 실패했습니다.', type: 'error' });
      }
    } catch {
      setToast({ message: '저장 중 오류', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">기업광고 쿠폰</h1>
          <p className="text-sm text-neutral-500 mt-1">
            멤버십 가입 시 발송되는 쿠폰 목록을 관리합니다 (다중 브랜드 지원)
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
        >
          + 쿠폰 추가
        </button>
      </div>

      {/* Coupons List */}
      {coupons.length === 0 ? (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-12 text-center">
          <p className="text-sm text-neutral-500">등록된 쿠폰이 없습니다.</p>
          <button
            onClick={handleAdd}
            className="mt-3 text-sm text-neutral-900 font-medium underline"
          >
            첫 쿠폰 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon, index) => (
            <div
              key={coupon.id}
              className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex items-center gap-4"
            >
              {/* 순서 변경 */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                  aria-label="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(index, 1)}
                  disabled={index === coupons.length - 1}
                  className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                  aria-label="아래로"
                >
                  ▼
                </button>
              </div>

              {/* 이미지 */}
              <div className="w-14 h-14 rounded-full bg-neutral-100 overflow-hidden flex-shrink-0">
                {coupon.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coupon.imageUrl} alt={coupon.brandName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">No img</div>
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {coupon.brandName || '(브랜드명 없음)'} · {coupon.couponAmount || '0원'}
                </p>
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                  {coupon.couponName || '(쿠폰명 없음)'}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  유효기간: {coupon.expiryDate || '미설정'}
                </p>
              </div>

              {/* 토글 */}
              <button
                onClick={() => handleToggleEnabled(coupon)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  coupon.enabled ? 'bg-neutral-900' : 'bg-neutral-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    coupon.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>

              {/* 액션 */}
              <button
                onClick={() => handleEdit(coupon)}
                className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md"
              >
                편집
              </button>
              <button
                onClick={() => handleDelete(coupon.id)}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-neutral-900">
                {('id' in editing && editing.id) ? '쿠폰 편집' : '새 쿠폰 추가'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-neutral-400 hover:text-neutral-900">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Enabled */}
              <div className="flex items-center justify-between pb-4 border-b border-[#EAEAEA]">
                <p className="text-sm font-medium text-neutral-900">활성화</p>
                <button
                  onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editing.enabled ? 'bg-neutral-900' : 'bg-neutral-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      editing.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Template ID */}
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-1.5">
                  SOLAPI 템플릿 ID
                </label>
                <input
                  type="text"
                  value={editing.templateId}
                  onChange={(e) => setEditing({ ...editing, templateId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                />
              </div>

              {/* 표시용 필드 (멤버십 페이지에 노출) */}
              <div className="pt-2">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                  멤버십 페이지 표시 정보
                </p>
                <div className="space-y-3">
                  {DISPLAY_FIELDS.map((field) => {
                    const isNumber = field.key === 'amountValue';
                    const isImage = field.key === 'imageUrl';
                    return (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                          {field.label}
                        </label>
                        <input
                          type={isNumber ? 'number' : 'text'}
                          value={(editing as any)[field.key] ?? ''}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              [field.key]: isNumber
                                ? parseInt(e.target.value || '0') || 0
                                : e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                          placeholder={field.placeholder}
                        />
                        {isImage && editing.imageUrl && (
                          <div className="mt-2 w-16 h-16 rounded-full bg-neutral-100 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={editing.imageUrl} alt="preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 알림톡 템플릿 변수 (동적) */}
              <div className="pt-4 border-t border-[#EAEAEA]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      알림톡 템플릿 변수
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      SOLAPI 템플릿에 정의된 #{'{변수명}'} 그대로 입력하세요
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = editing.templateVariables ?? [];
                      // 이미 있는 변수는 제외하고 추가
                      const existing = new Set(current.map((r) => r.variable));
                      const additions = DEFAULT_VARIABLE_PRESET.filter(
                        (r) => !existing.has(r.variable),
                      );
                      setEditing({
                        ...editing,
                        templateVariables: [...current, ...additions],
                      });
                    }}
                    className="text-xs text-neutral-700 underline"
                  >
                    기본 변수 7개 추가
                  </button>
                </div>

                <div className="space-y-2">
                  {(editing.templateVariables ?? []).map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={row.variable}
                        onChange={(e) => {
                          const next = [...(editing.templateVariables ?? [])];
                          next[idx] = { ...next[idx], variable: e.target.value };
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        placeholder="#{변수명}"
                        className="flex-1 px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm font-mono"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          const next = [...(editing.templateVariables ?? [])];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        placeholder="값"
                        className="flex-[2] px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(editing.templateVariables ?? [])];
                          next.splice(idx, 1);
                          setEditing({ ...editing, templateVariables: next });
                        }}
                        className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {(!editing.templateVariables || editing.templateVariables.length === 0) && (
                    <p className="text-xs text-neutral-400 py-2">
                      변수가 없으면 아래 (legacy) 필드를 사용하여 자동 매핑됩니다.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(editing.templateVariables ?? []), { variable: '', value: '' }];
                      setEditing({ ...editing, templateVariables: next });
                    }}
                    className="w-full py-2 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
                  >
                    + 변수 추가
                  </button>
                </div>
              </div>

              {/* (Legacy) 표준 변수 폴백 필드 */}
              <details className="pt-4 border-t border-[#EAEAEA]">
                <summary className="text-xs font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer">
                  (Legacy) 표준 변수 폴백 필드
                </summary>
                <p className="text-xs text-neutral-400 mt-1 mb-3">
                  위 템플릿 변수가 비어있을 때만 아래 값으로 자동 매핑됩니다.
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'couponContent' as const, label: '쿠폰 내용', variable: '#{쿠폰 내용}' },
                    { key: 'registrationMethod' as const, label: '등록방법', variable: '#{등록방법}' },
                    { key: 'landingLink' as const, label: '랜딩 링크', variable: '#{랜딩 링크}' },
                    { key: 'couponLink' as const, label: '쿠폰 링크', variable: '#{쿠폰 링크}' },
                  ].map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-sm font-medium text-neutral-700">{field.label}</label>
                        <span className="text-xs text-neutral-400 font-mono bg-neutral-50 px-1.5 py-0.5 rounded">
                          {field.variable}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={(editing as any)[field.key] ?? ''}
                        onChange={(e) => setEditing({ ...editing, [field.key]: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-[#EAEAEA] px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.type === 'success' ? 'bg-neutral-900 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
