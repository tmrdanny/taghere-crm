'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Check, MapPin, Search, X, Loader2 } from 'lucide-react';

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

// 지역 검색을 위한 플랫 리스트 생성 (시/도 + 시/군/구 조합)
interface RegionItem {
  sido: string;
  sigungu: string;
  displayName: string;
  searchTerms: string[];
}

const REGION_LIST: RegionItem[] = Object.entries(KOREA_REGIONS).flatMap(([sido, sigungus]) =>
  sigungus.map((sigungu) => {
    // 시/도 표시명 변환
    const sidoDisplay = sido === '서울' ? '서울시' :
                        sido === '경기' ? '경기도' :
                        sido === '인천' ? '인천시' :
                        sido === '부산' ? '부산시' :
                        sido === '대구' ? '대구시' :
                        sido === '광주' ? '광주시' :
                        sido === '대전' ? '대전시' :
                        sido === '울산' ? '울산시' :
                        sido === '세종' ? '세종시' :
                        sido === '강원' ? '강원도' :
                        sido === '충북' ? '충청북도' :
                        sido === '충남' ? '충청남도' :
                        sido === '전북' ? '전라북도' :
                        sido === '전남' ? '전라남도' :
                        sido === '경북' ? '경상북도' :
                        sido === '경남' ? '경상남도' :
                        sido === '제주' ? '제주도' : sido;

    // 검색 키워드 추출 (구/군/시 이름에서 핵심 키워드)
    const keywords = sigungu.split(' ').flatMap(part => {
      const normalized = part.replace(/(구|군|시)$/, '');
      return [part, normalized];
    });

    return {
      sido,
      sigungu,
      displayName: `${sidoDisplay} ${sigungu}`,
      searchTerms: [sido, sidoDisplay, sigungu, ...keywords].map(s => s.toLowerCase()),
    };
  })
);

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
  // 관심 업종 기본값: 전체 선택
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    CATEGORY_OPTIONS.map((c) => c.value)
  );

  // 지역 검색 상태
  const [regionQuery, setRegionQuery] = useState('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // UI 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택된 지역 표시명
  const selectedRegionDisplay = useMemo(() => {
    if (!selectedSido || !selectedSigungu) return '';
    const region = REGION_LIST.find(
      (r) => r.sido === selectedSido && r.sigungu === selectedSigungu
    );
    return region?.displayName || `${selectedSido} ${selectedSigungu}`;
  }, [selectedSido, selectedSigungu]);

  // 검색 필터링된 지역 목록
  const filteredRegions = useMemo(() => {
    if (!regionQuery.trim()) return REGION_LIST.slice(0, 20); // 검색어 없으면 상위 20개만
    const query = regionQuery.toLowerCase().trim();
    return REGION_LIST.filter((region) =>
      region.searchTerms.some((term) => term.includes(query))
    ).slice(0, 20);
  }, [regionQuery]);

  // 업종 토글
  const toggleCategory = (value: string) => {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 지역 선택
  const handleRegionSelect = (region: RegionItem) => {
    setSelectedSido(region.sido);
    setSelectedSigungu(region.sigungu);
    setRegionQuery('');
    setIsRegionDropdownOpen(false);
  };

  // 선택된 지역 삭제
  const handleRegionClear = () => {
    setSelectedSido('');
    setSelectedSigungu('');
    setRegionQuery('');
  };

  // 현재 위치로 설정
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('브라우저에서 위치 기능을 지원하지 않습니다.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          // Kakao Maps API 또는 Naver Maps API가 없으므로 간단한 역지오코딩 서비스 사용
          // 여기서는 대략적인 위치 기반으로 가장 가까운 지역 추정
          // 실제 구현에서는 역지오코딩 API 사용 권장

          // 주요 도시 좌표 기준 매칭 (간단한 구현)
          const cityCoords: { sido: string; sigungu: string; lat: number; lng: number }[] = [
            { sido: '서울', sigungu: '강남구', lat: 37.5172, lng: 127.0473 },
            { sido: '서울', sigungu: '강북구', lat: 37.6396, lng: 127.0257 },
            { sido: '서울', sigungu: '마포구', lat: 37.5663, lng: 126.9014 },
            { sido: '서울', sigungu: '송파구', lat: 37.5145, lng: 127.1066 },
            { sido: '서울', sigungu: '영등포구', lat: 37.5262, lng: 126.8962 },
            { sido: '경기', sigungu: '성남시 분당구', lat: 37.3825, lng: 127.1194 },
            { sido: '경기', sigungu: '수원시 영통구', lat: 37.2596, lng: 127.0465 },
            { sido: '경기', sigungu: '고양시 일산동구', lat: 37.6584, lng: 126.7724 },
            { sido: '인천', sigungu: '연수구', lat: 37.4102, lng: 126.6783 },
            { sido: '인천', sigungu: '부평구', lat: 37.5074, lng: 126.7218 },
            { sido: '부산', sigungu: '해운대구', lat: 35.1631, lng: 129.1635 },
            { sido: '부산', sigungu: '부산진구', lat: 35.1631, lng: 129.0530 },
            { sido: '대구', sigungu: '수성구', lat: 35.8581, lng: 128.6306 },
            { sido: '광주', sigungu: '서구', lat: 35.1523, lng: 126.8895 },
            { sido: '대전', sigungu: '유성구', lat: 36.3623, lng: 127.3562 },
            { sido: '울산', sigungu: '남구', lat: 35.5443, lng: 129.3302 },
            { sido: '제주', sigungu: '제주시', lat: 33.4996, lng: 126.5312 },
          ];

          // 가장 가까운 도시 찾기
          let closestCity = cityCoords[0];
          let minDistance = Infinity;

          for (const city of cityCoords) {
            const distance = Math.sqrt(
              Math.pow(latitude - city.lat, 2) + Math.pow(longitude - city.lng, 2)
            );
            if (distance < minDistance) {
              minDistance = distance;
              closestCity = city;
            }
          }

          setSelectedSido(closestCity.sido);
          setSelectedSigungu(closestCity.sigungu);
          setRegionQuery('');
        } catch (err) {
          setLocationError('위치를 가져오는데 실패했습니다.');
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('위치 권한을 허용해주세요.');
        } else {
          setLocationError('위치를 가져오는데 실패했습니다.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }
    if (!selectedSido || !selectedSigungu) {
      setError('자주 가는 장소를 선택해주세요.');
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

          {/* 자주 가는 장소 - 검색형 자동완성 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-2">
              내가 자주 가는 장소 <span className="text-gray-400">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">동네 이름으로 검색하세요 (예: 강남, 송도, 해운대)</p>

            {/* 현재 위치 버튼 */}
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              className="flex items-center gap-2 mb-3 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              {isLocating ? '위치 확인 중...' : '현재 위치로 설정'}
            </button>
            {locationError && (
              <p className="text-sm text-red-500 mb-2">{locationError}</p>
            )}

            {/* 선택된 지역 표시 */}
            {selectedRegionDisplay ? (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-gray-900 font-medium">{selectedRegionDisplay}</span>
                <button
                  type="button"
                  onClick={handleRegionClear}
                  className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ) : (
              /* 검색 입력 */
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={regionQuery}
                    onChange={(e) => {
                      setRegionQuery(e.target.value);
                      setIsRegionDropdownOpen(true);
                    }}
                    onFocus={() => setIsRegionDropdownOpen(true)}
                    placeholder="동네 이름을 입력하세요"
                    autoComplete="off"
                    className="w-full pl-10 pr-4 py-3 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 placeholder-gray-400 transition-colors"
                  />
                </div>

                {/* 자동완성 드롭다운 */}
                {isRegionDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsRegionDropdownOpen(false)}
                    />
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {filteredRegions.length > 0 ? (
                        filteredRegions.map((region, index) => (
                          <button
                            key={`${region.sido}-${region.sigungu}-${index}`}
                            type="button"
                            onClick={() => handleRegionSelect(region)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <span className="text-gray-900">{region.displayName}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-sm">
                          검색 결과가 없습니다
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
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

          {/* 관심 업종 - 기본 전체 선택 */}
          <div>
            <label className="block text-base font-medium text-gray-900 mb-1">
              관심 업종
            </label>
            <p className="text-sm text-gray-500 mb-3">관심 없는 업종은 선택 해제하세요</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedCategories.length === CATEGORY_OPTIONS.length) {
                    setSelectedCategories([]);
                  } else {
                    setSelectedCategories(CATEGORY_OPTIONS.map((c) => c.value));
                  }
                }}
                className={`px-4 py-2 rounded-full border text-sm transition-all ${
                  selectedCategories.length === CATEGORY_OPTIONS.length
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                전체 선택
              </button>
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
              할인 정보를 문자로 보내드려요 (주 1~2회) <span className="text-gray-400">*</span>
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
              <span className="text-gray-700">동의하고 쿠폰 받기</span>
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
            {isSubmitting ? '등록 중...' : '쿠폰 받기'}
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
