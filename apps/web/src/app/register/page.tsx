'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// 업종 분류
const STORE_CATEGORIES = {
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
  // 기타
  FOODCOURT: '푸드코트',
  OTHER: '기타',
} as const;

const CATEGORY_GROUPS = [
  { label: '음식점', options: ['KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'ASIAN', 'BUNSIK', 'FASTFOOD', 'MEAT', 'SEAFOOD', 'BUFFET', 'BRUNCH'] },
  { label: '카페/디저트', options: ['CAFE', 'BAKERY', 'DESSERT', 'ICECREAM'] },
  { label: '주점', options: ['BEER', 'IZAKAYA', 'WINE_BAR', 'COCKTAIL_BAR', 'POCHA', 'KOREAN_PUB'] },
  { label: '기타', options: ['FOODCOURT', 'OTHER'] },
];

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    storeName: '',
    category: '',
    ownerName: '',
    phone: '',
    businessRegNumber: '',
    naverPlaceUrl: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 비밀번호 확인
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }

    // 비밀번호 길이 체크
    if (formData.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeName: formData.storeName,
          category: formData.category || null,
          ownerName: formData.ownerName,
          phone: formData.phone,
          businessRegNumber: formData.businessRegNumber,
          naverPlaceUrl: formData.naverPlaceUrl,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <Image
            src="/Taghere-logo.png"
            alt="태그히어"
            width={120}
            height={40}
            className="mx-auto mb-4"
          />
          <CardTitle className="text-2xl">회원가입</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                상호명 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                name="storeName"
                placeholder="태그히어 카페"
                value={formData.storeName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                업종
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="">업종 선택 (선택사항)</option>
                {CATEGORY_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((key) => (
                      <option key={key} value={key}>
                        {STORE_CATEGORIES[key as keyof typeof STORE_CATEGORIES]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                대표자명 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                name="ownerName"
                placeholder="홍길동"
                value={formData.ownerName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                연락처 <span className="text-red-500">*</span>
              </label>
              <Input
                type="tel"
                name="phone"
                placeholder="010-1234-5678"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                사업자등록번호 <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                name="businessRegNumber"
                placeholder="123-45-67890"
                value={formData.businessRegNumber}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                네이버 플레이스 링크
              </label>
              <Input
                type="url"
                name="naverPlaceUrl"
                placeholder="https://naver.me/..."
                value={formData.naverPlaceUrl}
                onChange={handleChange}
              />
              <p className="text-xs text-neutral-500">
                네이버플레이스 -&gt; &apos;공유&apos;를 클릭하여 나오는 링크를 넣어주세요.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                이메일 <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                name="email"
                placeholder="owner@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                비밀번호 <span className="text-red-500">*</span>
              </label>
              <Input
                type="password"
                name="password"
                placeholder="8자 이상"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                비밀번호 확인 <span className="text-red-500">*</span>
              </label>
              <Input
                type="password"
                name="confirmPassword"
                placeholder="비밀번호 재입력"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12"
              disabled={isLoading}
            >
              {isLoading ? '가입 중...' : '회원가입'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
            <p className="text-sm text-neutral-600">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="text-brand-800 hover:underline font-medium">
                로그인
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
