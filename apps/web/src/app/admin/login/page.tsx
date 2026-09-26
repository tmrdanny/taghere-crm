'use client';

import { API_BASE } from '@/lib/api-config';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      localStorage.setItem('adminToken', data.token);
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3.5 text-[14px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] transition-colors focus:border-[color:var(--ad-navy)] focus:outline-none';

  return (
    <div className="ad flex items-center justify-center p-4">
      <div className="ad-sky" aria-hidden>
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
        <span className="ad-cloud" />
      </div>

      <div className="ad-rise relative w-full max-w-[380px] rounded-[24px] border border-white/70 bg-white/70 p-8 shadow-[0_30px_80px_-30px_rgba(19,22,81,0.35)] backdrop-blur-2xl">
        <div className="mb-7 text-center">
          <Image src="/Taghere-logo.png" alt="태그히어" width={48} height={48} className="mx-auto mb-4 h-12 w-12" priority />
          <h1 className="text-[20px] font-bold tracking-[-0.4px]">TagHere Admin</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">태그히어 관리자 전용</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="rounded-[10px] bg-[#fff2f5] px-3.5 py-2.5 text-[13px] text-[color:var(--ad-neg)]">{error}</div>
          )}

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="비밀번호"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="ad-press h-11 w-full rounded-[10px] bg-[color:var(--ad-yellow)] text-[14px] font-semibold text-[color:var(--ad-ink)] transition-colors hover:bg-[color:var(--ad-yellow-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
