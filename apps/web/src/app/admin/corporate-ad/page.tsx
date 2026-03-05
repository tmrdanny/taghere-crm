'use client';

import { useEffect, useState } from 'react';

interface CorporateAdData {
  templateId: string;
  couponName: string;
  couponContent: string;
  couponAmount: string;
  expiryDate: string;
  registrationMethod: string;
  landingLink: string;
  couponLink: string;
  enabled: boolean;
}

const defaultData: CorporateAdData = {
  templateId: 'KA01TP250930075547299ikOWJ6bArTY',
  couponName: '',
  couponContent: '',
  couponAmount: '',
  expiryDate: '',
  registrationMethod: '',
  landingLink: '',
  couponLink: '',
  enabled: true,
};

const FIELD_CONFIG = [
  { key: 'couponName' as const, label: '쿠폰명', placeholder: '예: 세븐일레븐 모바일 상품권', variable: '#{쿠폰명}' },
  { key: 'couponContent' as const, label: '쿠폰 내용', placeholder: '예: 편의점에서 사용 가능한 모바일 상품권', variable: '#{쿠폰 내용}' },
  { key: 'couponAmount' as const, label: '쿠폰 금액', placeholder: '예: 10,000원', variable: '#{쿠폰 금액}' },
  { key: 'expiryDate' as const, label: '유효기간', placeholder: '예: 발급일로부터 30일', variable: '#{유효기간}' },
  { key: 'registrationMethod' as const, label: '등록방법', placeholder: '예: 카카오톡 채널 추가 후 자동 발급', variable: '#{등록방법}' },
  { key: 'landingLink' as const, label: '랜딩 링크', placeholder: '예: https://example.com/landing', variable: '#{랜딩 링크}' },
  { key: 'couponLink' as const, label: '쿠폰 링크', placeholder: '예: https://example.com/coupon', variable: '#{쿠폰 링크}' },
];

export default function CorporateAdPage() {
  const [data, setData] = useState<CorporateAdData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ad`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch corporate ad:', error);
      setToast({ message: '설정을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/corporate-ad`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        setData(result);
        setToast({ message: '설정이 저장되었습니다.', type: 'success' });
      } else {
        setToast({ message: '저장에 실패했습니다.', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to save corporate ad:', error);
      setToast({ message: '저장 중 오류가 발생했습니다.', type: 'error' });
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
          <h1 className="text-2xl font-bold text-neutral-900">기업광고</h1>
          <p className="text-sm text-neutral-500 mt-1">
            멤버십 가입 시 발송되는 알림톡 쿠폰 변수를 설정합니다
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Settings Card */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
        {/* Enabled Toggle */}
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-[#EAEAEA]">
          <div>
            <p className="text-sm font-medium text-neutral-900">알림톡 발송 활성화</p>
            <p className="text-xs text-neutral-500 mt-0.5">비활성화하면 멤버십 가입 시 알림톡이 발송되지 않습니다</p>
          </div>
          <button
            onClick={() => setData({ ...data, enabled: !data.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              data.enabled ? 'bg-neutral-900' : 'bg-neutral-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                data.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Template ID */}
        <div className="mb-6 pb-6 border-b border-[#EAEAEA]">
          <label className="block text-sm font-medium text-neutral-900 mb-1.5">
            SOLAPI 템플릿 ID
          </label>
          <input
            type="text"
            value={data.templateId}
            onChange={(e) => setData({ ...data, templateId: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
            placeholder="템플릿 ID"
          />
        </div>

        {/* Variable Fields */}
        <div>
          <p className="text-sm font-medium text-neutral-900 mb-4">알림톡 변수 설정</p>
          <div className="space-y-4">
            {FIELD_CONFIG.map((field) => (
              <div key={field.key}>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-sm font-medium text-neutral-700">
                    {field.label}
                  </label>
                  <span className="text-xs text-neutral-400 font-mono bg-neutral-50 px-1.5 py-0.5 rounded">
                    {field.variable}
                  </span>
                </div>
                <input
                  type="text"
                  value={data[field.key]}
                  onChange={(e) => setData({ ...data, [field.key]: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#EAEAEA] rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
            toast.type === 'success'
              ? 'bg-neutral-900 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
