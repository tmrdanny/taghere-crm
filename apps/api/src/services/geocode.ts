// 주소 → 좌표 지오코딩 (카카오 Local REST API)
// KAKAO_REST_API_KEY 또는 KAKAO_CLIENT_ID(REST 키) 사용.
// 카카오 개발자 콘솔에서 해당 앱에 "로컬" API가 활성화되어 있어야 한다.

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || '';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  matchedAddress: string;
}

/**
 * 주소 문자열을 좌표로 변환. 실패 시 null.
 * 1차: 주소 검색(/v2/local/search/address) → 실패 시 2차: 키워드 검색(/v2/local/search/keyword)
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!KAKAO_REST_KEY || !address?.trim()) return null;

  const headers = { Authorization: `KakaoAK ${KAKAO_REST_KEY}` };

  try {
    // 1차: 정형 주소 검색
    const addrRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address.trim())}`,
      { headers },
    );
    if (addrRes.ok) {
      const data = (await addrRes.json()) as { documents?: Array<{ x: string; y: string; address_name: string }> };
      const doc = data.documents?.[0];
      if (doc) {
        return {
          latitude: parseFloat(doc.y),
          longitude: parseFloat(doc.x),
          matchedAddress: doc.address_name,
        };
      }
    } else {
      console.error(`[Geocode] address search ${addrRes.status}: ${(await addrRes.text()).slice(0, 200)}`);
    }

    // 2차: 키워드 검색 (상세주소·건물명 섞인 주소 대응)
    const kwRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address.trim())}&size=1`,
      { headers },
    );
    if (kwRes.ok) {
      const data = (await kwRes.json()) as { documents?: Array<{ x: string; y: string; address_name: string }> };
      const doc = data.documents?.[0];
      if (doc) {
        return {
          latitude: parseFloat(doc.y),
          longitude: parseFloat(doc.x),
          matchedAddress: doc.address_name,
        };
      }
    }

    return null;
  } catch (e) {
    console.error('[Geocode] failed:', e);
    return null;
  }
}

/** 두 좌표 사이 거리 (미터) — Haversine */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
