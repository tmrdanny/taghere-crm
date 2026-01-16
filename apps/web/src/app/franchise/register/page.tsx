'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, Building2, User, Phone } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

  return (
    <div className="min-h-screen flex">
      {ToastComponent}

      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-franchise-500 via-franchise-700 to-franchise-900 p-12 flex-col justify-between">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">TagHere CRM</span>
            <span className="px-2 py-1 bg-white/20 text-white text-xs font-medium rounded-md backdrop-blur-sm">
              Franchise
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            프랜차이즈 본부를<br />시작하세요
          </h1>
          <p className="text-lg text-franchise-100 leading-relaxed">
            TagHere CRM으로 프랜차이즈 가맹점들을 효율적으로 관리하고,
            통합된 고객 데이터를 활용한 마케팅을 시작하세요.
          </p>
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex items-center gap-3 text-franchise-100">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>무료 가입, 무료 시작</span>
            </div>
            <div className="flex items-center gap-3 text-franchise-100">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>기존 태그히어 CRM 가맹점 연동</span>
            </div>
            <div className="flex items-center gap-3 text-franchise-100">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>데이터 기반 마케팅 자동화</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-franchise-200 text-sm">
          &copy; 2024 TagHere. All rights reserved.
        </div>
      </div>

      {/* Right Side - Register Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <span className="text-2xl font-bold text-slate-900">TagHere CRM</span>
            <span className="px-2 py-1 bg-franchise-100 text-franchise-700 text-xs font-medium rounded-md">
              Franchise
            </span>
          </div>

          {/* Form Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-slate-900">회원가입</h2>
              <p className="text-slate-500 mt-2">
                프랜차이즈 본부 계정을 생성하세요
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              {/* Brand Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  브랜드명 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    name="brandName"
                    placeholder="브랜드명을 입력하세요"
                    value={formData.brandName}
                    onChange={handleChange}
                    required
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Owner Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  대표자명 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    name="ownerName"
                    placeholder="대표자명을 입력하세요"
                    value={formData.ownerName}
                    onChange={handleChange}
                    required
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  이메일 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    placeholder="franchise@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="8자 이상"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className="w-full pl-12 pr-12 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="비밀번호 재입력"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className="w-full pl-12 pr-12 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Phone (Optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  연락처 <span className="text-slate-400 text-xs">(선택)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="010-1234-5678"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-franchise-500 text-white hover:bg-franchise-700 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    가입 중...
                  </>
                ) : (
                  '회원가입'
                )}
              </button>
            </form>

            {/* Login Link */}
            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">
                이미 계정이 있으신가요?{' '}
                <Link
                  href="/franchise/login"
                  className="text-franchise-600 hover:text-franchise-700 font-medium hover:underline"
                >
                  로그인
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
