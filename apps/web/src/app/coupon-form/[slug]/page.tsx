'use client';

import { API_BASE } from '@/lib/api-config';
import { useParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

interface FormField {
  id: string;
  type: 'TEXT' | 'CHOICE';
  label: string;
  required: boolean;
  choiceOptions?: string[];
}

interface CouponFormInfo {
  slug: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  fields: FormField[];
  couponContent: string;
  expiryDate: string;
  storeName: string;
}

function fullImageUrl(url: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

function formatPhoneInput(raw: string): string {
  const d = raw.replace(/[^0-9]/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function CouponFormContent() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<CouponFormInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/coupon-form/public/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setForm(data);
        } else {
          const data = await res.json().catch(() => ({}));
          setLoadError(data.error || '진행 중인 이벤트가 아닙니다.');
        }
      } catch {
        setLoadError('정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        setIsLoading(false);
      }
    };
    if (slug) fetchForm();
  }, [slug]);

  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const requiredOk =
    phoneDigits.length >= 10 &&
    (form?.fields || []).every(
      (f) => !f.required || (answers[f.id] !== undefined && answers[f.id].trim() !== ''),
    );

  const handleSubmit = async () => {
    if (!form || isSubmitting || !requiredOk) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupon-form/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setIsDone(true);
      } else if (data.error === 'already_submitted') {
        setAlreadySubmitted(true);
      } else {
        setSubmitError(data.message || data.error || '제출에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      setSubmitError('네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 로딩
  if (isLoading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  // ── 에러 (폼 없음/비활성)
  if (loadError || !form) {
    return (
      <PageShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">이벤트를 찾을 수 없어요</h1>
          <p className="text-neutral-500 text-sm">{loadError}</p>
        </div>
      </PageShell>
    );
  }

  // ── 완료 / 중복 제출
  if (isDone || alreadySubmitted) {
    return (
      <PageShell>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl mb-4">{isDone ? '🎉' : '💌'}</div>
          <h1 className="text-[18px] font-bold text-neutral-900 mb-2">
            {isDone ? '쿠폰이 카카오톡으로 발송돼요!' : '이미 참여하셨어요'}
          </h1>
          <p className="text-neutral-500 text-sm leading-relaxed">
            {isDone
              ? '잠시 후 카카오톡에서 쿠폰을 확인해주세요.'
              : '쿠폰은 카카오톡 메시지를 확인해주세요.'}
          </p>
          <div className="mt-6 w-full max-w-xs bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-left">
            <p className="text-[12px] text-neutral-400 mb-1">{form.storeName}</p>
            <p className="text-[15px] font-semibold text-neutral-900">{form.couponContent}</p>
            <p className="text-[12px] text-neutral-500 mt-1">유효기간: {form.expiryDate}</p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── 폼
  return (
    <PageShell scrollable>
      {/* 상단 배너 */}
      {form.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fullImageUrl(form.bannerUrl)}
          alt=""
          className="w-full aspect-[860/260] object-cover"
        />
      )}
      <div className={`px-6 pb-8 ${form.bannerUrl ? 'pt-6' : 'pt-10'}`}>
        {/* 헤더 */}
        <p className="text-[13px] font-medium text-neutral-400 mb-2">{form.storeName}</p>
        <h1 className="text-[22px] font-bold text-neutral-900 leading-snug">{form.title}</h1>
        {form.description && (
          <p className="text-[14px] text-neutral-500 mt-2 leading-relaxed whitespace-pre-line">{form.description}</p>
        )}

        {/* 쿠폰 안내 카드 */}
        <div className="mt-5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4">
          <p className="text-[12px] text-amber-600 font-medium mb-1">참여 혜택</p>
          <p className="text-[15px] font-semibold text-neutral-900">{form.couponContent}</p>
          <p className="text-[12px] text-neutral-500 mt-1">유효기간: {form.expiryDate}</p>
        </div>

        {/* 입력 */}
        <div className="mt-8 space-y-6">
          {/* 연락처 (항상 필수) */}
          <div>
            <label className="block text-[14px] font-semibold text-neutral-900 mb-2">
              휴대폰 번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="010-0000-0000"
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
            />
            <p className="text-[12px] text-neutral-400 mt-1.5">쿠폰이 카카오톡으로 발송돼요</p>
          </div>

          {/* 커스텀 필드 */}
          {form.fields.map((f) => (
            <div key={f.id}>
              <label className="block text-[14px] font-semibold text-neutral-900 mb-2">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </label>
              {f.type === 'TEXT' ? (
                <input
                  type="text"
                  value={answers[f.id] || ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  placeholder="입력해주세요"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(f.choiceOptions || []).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [f.id]: opt }))}
                      className={`px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                        answers[f.id] === opt
                          ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                          : 'bg-neutral-50 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {submitError && (
          <p className="mt-4 text-[13px] text-red-500">{submitError}</p>
        )}

        {/* 제출 */}
        <button
          onClick={handleSubmit}
          disabled={!requiredOk || isSubmitting}
          className="mt-8 w-full py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] disabled:cursor-not-allowed text-neutral-900 font-semibold text-[15px] rounded-xl transition-colors"
        >
          {isSubmitting ? '제출 중...' : '제출하고 쿠폰 받기'}
        </button>
        <p className="mt-3 text-center text-[11px] text-neutral-400">
          입력하신 연락처는 쿠폰 발송 및 매장 혜택 안내에 이용됩니다.
        </p>
      </div>
    </PageShell>
  );
}

function PageShell({ children, scrollable }: { children: React.ReactNode; scrollable?: boolean }) {
  return (
    <>
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className={`w-full max-w-md h-full flex flex-col bg-white ${scrollable ? 'overflow-y-auto' : ''}`}>
          {children}
        </div>
      </div>
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');

        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>
    </>
  );
}

export default function CouponFormPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-neutral-100 flex justify-center overflow-hidden">
          <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
            <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      }
    >
      <CouponFormContent />
    </Suspense>
  );
}
