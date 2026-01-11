'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 대한민국 전체 시/도 및 시/군/구 데이터
const KOREA_REGIONS: Record<string, string[]> = {
  '서울': [
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
    '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
  ],
  '경기': [
    '가평군', '고양시 덕양구', '고양시 일산동구', '고양시 일산서구', '과천시', '광명시', '광주시', '구리시',
    '군포시', '김포시', '남양주시', '동두천시', '부천시', '성남시 분당구', '성남시 수정구', '성남시 중원구',
    '수원시 권선구', '수원시 영통구', '수원시 장안구', '수원시 팔달구', '시흥시', '안산시 단원구', '안산시 상록구',
    '안성시', '안양시 동안구', '안양시 만안구', '양주시', '양평군', '여주시', '연천군', '오산시',
    '용인시 기흥구', '용인시 수지구', '용인시 처인구', '의왕시', '의정부시', '이천시', '파주시', '평택시',
    '포천시', '하남시', '화성시'
  ],
  '인천': [
    '강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구'
  ],
  '부산': [
    '강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구',
    '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'
  ],
  '대구': [
    '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구', '군위군'
  ],
  '광주': [
    '광산구', '남구', '동구', '북구', '서구'
  ],
  '대전': [
    '대덕구', '동구', '서구', '유성구', '중구'
  ],
  '울산': [
    '남구', '동구', '북구', '울주군', '중구'
  ],
  '세종': [
    '세종시 전체'
  ],
  '강원': [
    '강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군',
    '원주시', '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군', '화천군', '횡성군'
  ],
  '충북': [
    '괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군', '진천군', '청주시 상당구',
    '청주시 서원구', '청주시 청원구', '청주시 흥덕구', '충주시'
  ],
  '충남': [
    '계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시',
    '서천군', '아산시', '예산군', '천안시 동남구', '천안시 서북구', '청양군', '태안군', '홍성군'
  ],
  '전북': [
    '고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군',
    '익산시', '임실군', '장수군', '전주시 덕진구', '전주시 완산구', '정읍시', '진안군'
  ],
  '전남': [
    '강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시',
    '무안군', '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군',
    '장성군', '장흥군', '진도군', '함평군', '해남군', '화순군'
  ],
  '경북': [
    '경산시', '경주시', '고령군', '구미시', '김천시', '문경시', '봉화군', '상주시',
    '성주군', '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군',
    '울진군', '의성군', '청도군', '청송군', '칠곡군', '포항시 남구', '포항시 북구'
  ],
  '경남': [
    '거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군',
    '양산시', '의령군', '진주시', '창녕군', '창원시 마산합포구', '창원시 마산회원구', '창원시 성산구',
    '창원시 의창구', '창원시 진해구', '통영시', '하동군', '함안군', '함양군', '합천군'
  ],
  '제주': [
    '서귀포시', '제주시'
  ],
};

// 연령대 옵션
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
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
  const [selectedSido, setSelectedSido] = useState('');
  const [selectedSigungu, setSelectedSigungu] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(null);
  const [ageGroup, setAgeGroup] = useState('');
  const [consent, setConsent] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // UI 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 시/도 목록
  const sidoList = Object.keys(KOREA_REGIONS);

  // 선택된 시/도의 시/군/구 목록
  const sigunguList = selectedSido ? KOREA_REGIONS[selectedSido] : [];

  // 업종 토글
  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 시/도 변경 시 시/군/구 초기화
  const handleSidoChange = (sido: string) => {
    setSelectedSido(sido);
    setSelectedSigungu('');
  };

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }
    if (!selectedSido) {
      setError('시/도를 선택해주세요.');
      return;
    }
    if (!selectedSigungu) {
      setError('시/군/구를 선택해주세요.');
      return;
    }
    if (!gender) {
      setError('성별을 선택해주세요.');
      return;
    }
    if (!ageGroup) {
      setError('연령대를 선택해주세요.');
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
          ageGroup,
          regionSido: selectedSido,
          regionSigungu: selectedSigungu,
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

        <form onSubmit={handleSubmit} className="space-y-8" autoComplete="off">
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
              autoComplete="off"
              className="w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 placeholder-gray-400 transition-colors"
            />
          </div>

          {/* 자주 가는 장소 - 시/도 선택 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">
              내가 자주 가는 장소 <span className="text-gray-400">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">식사하러 자주 가시는 곳을 선택해 주세요</p>

            {/* 시/도 선택 */}
            <div className="relative mb-3">
              <select
                value={selectedSido}
                onChange={(e) => handleSidoChange(e.target.value)}
                autoComplete="off"
                className="w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 bg-white appearance-none cursor-pointer"
              >
                <option value="">시/도 선택</option>
                {sidoList.map((sido) => (
                  <option key={sido} value={sido}>{sido}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>

            {/* 시/군/구 선택 */}
            <div className="relative">
              <select
                value={selectedSigungu}
                onChange={(e) => setSelectedSigungu(e.target.value)}
                disabled={!selectedSido}
                autoComplete="off"
                className={`w-full px-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none bg-white appearance-none cursor-pointer ${
                  selectedSido ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                <option value="">시/군/구 선택</option>
                {sigunguList.map((sigungu) => (
                  <option key={sigungu} value={sigungu}>{sigungu}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
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

          {/* 연령대 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-3">
              연령대 <span className="text-gray-400">*</span>
            </label>
            <div className="space-y-2">
              {AGE_GROUP_OPTIONS.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAgeGroup(option.value)}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-all ${
                    ageGroup === option.value
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium ${
                    ageGroup === option.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-400'
                  }`}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-gray-900">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 관심 업종 (선택) */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-3">
              고객 관심 업종
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
            <a
              href="https://tmr-founders.notion.site/2492217234e380e1abbbe6867fc96aea?source=copy_link"
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-sm text-gray-500 underline"
            >
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
