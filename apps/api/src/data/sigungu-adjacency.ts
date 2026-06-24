/**
 * 시/군/구 인접 매핑 (네이버 플레이스 부스터 대상 지역 확장용).
 *
 * key   = "{시도} {시군구}" (ExternalCustomer와 동일한 줄임 시도명 + 시군구명)
 * value = 인접 시군구명 배열
 *
 * 미등록 항목은 region.ts의 expandRegions에서 "동일 시/도 전체"로 폴백한다.
 * (정식 인접 데이터 확보 시 점진적으로 채운다 — 계획서 §5 후속 자산)
 */
export const SIGUNGU_ADJACENCY: Record<string, string[]> = {
  // 예시: "서울 용산구": ["중구", "마포구", "성동구", "동작구", "서대문구"],
};
