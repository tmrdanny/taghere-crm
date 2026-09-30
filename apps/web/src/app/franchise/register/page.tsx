'use client';

import { API_BASE } from '@/lib/api-config';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Mail, Lock, Building2, User, Phone } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import '@/app/admin/admin-theme.css';


export default function FranchiseRegisterPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [formData, setFormData] = useState({
    brandName: '',
    ownerName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validation
    if (!formData.brandName.trim()) {
      showToast('브랜드명을 입력해주세요.', 'error');
      setIsLoading(false);
      return;
    }

    if (!formData.ownerName.trim()) {
      showToast('대표자명을 입력해주세요.', 'error');
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast('비밀번호가 일치하지 않습니다.', 'error');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      showToast('비밀번호는 8자 이상이어야 합니다.', 'error');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/franchise/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandName: formData.brandName,
          ownerName: formData.ownerName,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      showToast('회원가입이 완료되었습니다. 로그인해주세요.', 'success');

      // Redirect to login
      setTimeout(() => {
        router.push('/franchise/login');
      }, 1500);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[14px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] transition-colors focus:border-[color:var(--ad-ink)] focus:outline-none';

  return (
    <div className="adm adm-crm flex items-center justify-center px-4 py-10">
      {ToastComponent}
      <div className="adm-sky" aria-hidden>
        <span className="adm-cloud" />
      </div>

      <div className="adm-rise relative w-full max-w-[420px] rounded-[24px] border border-white/70 bg-white/70 p-8 shadow-[0_30px_80px_-30px_rgba(19,22,81,0.25)] backdrop-blur-2xl">
        <div className="mb-7 text-center">
          <Image src="/Taghere-logo.png" alt="태그히어" width={48} height={48} className="mx-auto mb-4 h-12 w-12" priority />
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-[-0.4px]">회원가입</h1>
            <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
              Franchise
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">프랜차이즈 본부 계정을 생성하세요</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* Brand Name */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              브랜드명 <span className="text-[color:var(--ad-neg)]">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Building2 className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type="text"
                name="brandName"
                placeholder="브랜드명을 입력하세요"
                value={formData.brandName}
                onChange={handleChange}
                required
                className={`${inputCls} pl-10 pr-3.5`}
              />
            </div>
          </div>

          {/* Owner Name */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              대표자명 <span className="text-[color:var(--ad-neg)]">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <User className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type="text"
                name="ownerName"
                placeholder="대표자명을 입력하세요"
                value={formData.ownerName}
                onChange={handleChange}
                required
                className={`${inputCls} pl-10 pr-3.5`}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              이메일 <span className="text-[color:var(--ad-neg)]">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Mail className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type="email"
                name="email"
                placeholder="franchise@example.com"
                value={formData.email}
                onChange={handleChange}
                required
                className={`${inputCls} pl-10 pr-3.5`}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              비밀번호 <span className="text-[color:var(--ad-neg)]">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="8자 이상"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                className={`${inputCls} pl-10 pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink-2)]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              비밀번호 확인 <span className="text-[color:var(--ad-neg)]">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="비밀번호 재입력"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
                className={`${inputCls} pl-10 pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink-2)]"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>

          {/* Phone (Optional) */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              연락처 <span className="text-[12px] font-normal text-[color:var(--ad-faint)]">(선택)</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Phone className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                type="tel"
                name="phone"
                placeholder="010-1234-5678"
                value={formData.phone}
                onChange={handleChange}
                className={`${inputCls} pl-10 pr-3.5`}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="adm-press flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[color:var(--ad-ink)] text-[14px] font-semibold text-white transition-colors hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                가입 중...
              </>
            ) : (
              '회원가입'
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="mt-6 border-t border-[color:var(--ad-line)] pt-5 text-center">
          <p className="text-[13px] text-[color:var(--ad-muted)]">
            이미 계정이 있으신가요?{' '}
            <Link
              href="/franchise/login"
              className="font-medium text-[color:var(--ad-ink)] hover:underline"
            >
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
