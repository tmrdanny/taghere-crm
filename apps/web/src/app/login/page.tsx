'use client';

import { API_BASE } from '@/lib/api-config';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import '@/app/admin/admin-theme.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      // Store token
      localStorage.setItem('token', data.token);

      // Redirect to dashboard
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[14px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] transition-colors focus:border-[color:var(--ad-ink)] focus:outline-none';

  return (
    <div className="adm adm-crm flex items-center justify-center p-4">
      <div className="adm-sky" aria-hidden>
        <span className="adm-cloud" />
      </div>

      <div className="adm-rise relative w-full max-w-[380px] rounded-[24px] border border-white/70 bg-white/70 p-8 shadow-[0_30px_80px_-30px_rgba(19,22,81,0.25)] backdrop-blur-2xl">
        <div className="mb-7 text-center">
          <Image src="/Taghere-logo.png" alt="태그히어" width={48} height={48} className="mx-auto mb-4 h-12 w-12" priority />
          <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">태그히어 CRM</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">사장님 계정으로 로그인하세요</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-[10px] border border-[#f3c6cf] bg-[#fdf2f4] px-3.5 py-2.5 text-[13px] text-[color:var(--ad-neg)]"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              이메일
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Mail className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                placeholder="owner@taghere.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`${inputCls} pl-10 pr-3.5`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
              비밀번호
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`${inputCls} pl-10 pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
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

          <button
            type="submit"
            disabled={isLoading}
            className="adm-press flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[color:var(--ad-ink)] text-[14px] font-semibold text-white transition-colors hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                로그인 중...
              </>
            ) : (
              '로그인'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[color:var(--ad-line)] pt-5 text-center">
          <p className="text-[13px] text-[color:var(--ad-muted)]">
            계정이 없으신가요?{' '}
            <Link href="/register" className="font-medium text-[color:var(--ad-ink)] hover:underline">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
