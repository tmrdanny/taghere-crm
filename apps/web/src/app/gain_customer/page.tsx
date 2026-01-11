'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 지역 옵션 (시/도)
const REGION_OPTIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];

// 업종 카테고리
const CATEGORY_OPTIONS = [
  { value: 'KOREAN', label: '한식' },
  { value: 'CHINESE', label: '중식' },
  { value: 'JAPANESE', label: '일식' },
  { value: 'WESTERN', label: '양식' },
  { value: 'ASIAN', label: '아시안' },
  { value: 'MEAT', label: '고기/구이' },
  { value: 'SEAFOOD', label: '해산물' },
  { value: 'CAFE', label: '카페' },
  { value: 'BAKERY', label: '베이커리' },
  { value: 'DESSERT', label: '디저트' },
  { value: 'BEER', label: '호프/맥주' },
  { value: 'IZAKAYA', label: '이자카야' },
  { value: 'WINE_BAR', label: '와인바' },
  { value: 'POCHA', label: '포차' },
];

export default function GainCustomerPage() {
  // 폼 상태
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [consent, setConsent] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // UI 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 업종 토글
  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 생년월일로 연령대 계산
  const calculateAgeGroup = (birthDateStr: string): string => {
    if (!birthDateStr) return 'THIRTIES';
    const birthYear = parseInt(birthDateStr.split('-')[0]);
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;

    if (age < 30) return 'TWENTIES';
    if (age < 40) return 'THIRTIES';
    if (age < 50) return 'FORTIES';
    if (age < 60) return 'FIFTIES';
    return 'SIXTY_PLUS';
  };

  // 지역 문자열에서 시/도 추출
  const extractSido = (locationStr: string): string => {
    // 서울시, 서울특별시, 서울 -> 서울
    const sidoMap: Record<string, string> = {
      '서울': '서울', '서울시': '서울', '서울특별시': '서울',
      '경기': '경기', '경기도': '경기',
      '인천': '인천', '인천시': '인천', '인천광역시': '인천',
      '부산': '부산', '부산시': '부산', '부산광역시': '부산',
      '대구': '대구', '대구시': '대구', '대구광역시': '대구',
      '광주': '광주', '광주시': '광주', '광주광역시': '광주',
      '대전': '대전', '대전시': '대전', '대전광역시': '대전',
      '울산': '울산', '울산시': '울산', '울산광역시': '울산',
      '세종': '세종', '세종시': '세종', '세종특별자치시': '세종',
      '강원': '강원', '강원도': '강원', '강원특별자치도': '강원',
      '충북': '충북', '충청북도': '충북',
      '충남': '충남', '충청남도': '충남',
      '전북': '전북', '전라북도': '전북', '전북특별자치도': '전북',
      '전남': '전남', '전라남도': '전남',
      '경북': '경북', '경상북도': '경북',
      '경남': '경남', '경상남도': '경남',
      '제주': '제주', '제주도': '제주', '제주특별자치도': '제주',
    };

    for (const [key, value] of Object.entries(sidoMap)) {
      if (locationStr.includes(key)) {
        return value;
      }
    }
    return '서울'; // 기본값
  };

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }
    if (!location.trim()) {
      setError('자주 가는 장소를 입력해주세요.');
      return;
    }
    if (!gender) {
      setError('성별을 선택해주세요.');
      return;
    }
    if (!birthDate) {
      setError('생일을 입력해주세요.');
      return;
    }
    if (!consent) {
      setError('수신 동의가 필요합니다.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 전화번호 정규화
      const normalizedPhone = phone.replace(/[^0-9]/g, '');

      const res = await fetch(`${API_BASE}/api/public/gain-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: normalizedPhone,
          gender,
          ageGroup: calculateAgeGroup(birthDate),
          regionSido: extractSido(location),
          preferredCategories: selectedCategories.length > 0 ? selectedCategories : null,
          consentMarketing: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '등록에 실패했습니다.');
      }

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 제출 완료 화면
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">등록 완료!</h1>
          <p className="text-gray-600 mb-8">
            맛집 소식과 특별 혜택을 보내드릴게요.<br />
            감사합니다!
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-gray-500 underline text-sm"
          >
            다시 등록하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* 헤더 */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 leading-tight">
          우리동네 음식점 할인받고 가세요
        </h1>
        <p className="text-gray-600 mb-10">
          내가 자주 가는 곳의 레스토랑과 카페의 파격 혜택을 매주 받아보세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 연락처 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">
              연락처 <span className="text-gray-400">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 placeholder-gray-400 transition-colors"
            />
          </div>

          {/* 자주 가는 장소 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">
              내가 자주 가는 장소(식사하러 자주 가시는 곳을 작성해 주세요) <span className="text-gray-400">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="서울시 성수동"
              className="w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 placeholder-gray-400 transition-colors"
            />
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-3">
              성별 <span className="text-gray-400">*</span>
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setGender('MALE')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-all ${
                  gender === 'MALE'
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium ${
                  gender === 'MALE' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-400'
                }`}>
                  A
                </span>
                <span className="text-gray-900">남</span>
              </button>
              <button
                type="button"
                onClick={() => setGender('FEMALE')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-all ${
                  gender === 'FEMALE'
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium ${
                  gender === 'FEMALE' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-400'
                }`}>
                  B
                </span>
                <span className="text-gray-900">여</span>
              </button>
            </div>
          </div>

          {/* 생일 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">
              생일 <span className="text-gray-400">*</span>
            </label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              placeholder="1990-11-01"
              className="w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 placeholder-gray-400 transition-colors"
            />
          </div>

          {/* 관심 업종 (선택) */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-3">
              관심 업종 <span className="text-gray-400">(선택)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => toggleCategory(cat.value)}
                  className={`px-4 py-2 rounded-full border text-sm transition-all ${
                    selectedCategories.includes(cat.value)
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 수신 동의 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-3">
              혜택을 받기위해 수신 동의가 필요해요 <span className="text-gray-400">*</span>
            </label>
            <button
              type="button"
              onClick={() => setConsent(!consent)}
              className="flex items-center gap-3"
            >
              <span className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
                consent ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
              }`}>
                {consent && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="text-gray-700">네, 동의합니다</span>
            </button>
            <a href="#" className="block mt-3 text-sm text-gray-500 underline">
              자세히보기
            </a>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '등록 중...' : '제출하기'}
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
