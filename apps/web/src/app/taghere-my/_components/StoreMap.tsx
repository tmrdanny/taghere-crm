'use client';

// 태그히어 CRM 매장 지도 (로그인 불필요)
// 카카오맵 SDK 는 이 탭을 열 때만 불러온다. 키가 없거나 SDK 를 못 불러오면 목록만 보여준다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-config';

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '';

export interface MapStore {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  enrollmentMode: string;
  pointRatePercent: number;
  naverPlaceUrl: string | null;
  stampRewards: { tier: number; description: string }[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  KOREAN: '한식',
  CHINESE: '중식',
  JAPANESE: '일식',
  WESTERN: '양식',
  ASIAN: '아시안',
  BUNSIK: '분식',
  FASTFOOD: '패스트푸드',
  MEAT: '고기/구이',
  SEAFOOD: '해산물',
  BUFFET: '뷔페',
  BRUNCH: '브런치',
  CAFE: '카페',
  BAKERY: '베이커리',
  DESSERT: '디저트',
  ICECREAM: '아이스크림',
  BEER: '호프/맥주',
  IZAKAYA: '이자카야',
  WINE_BAR: '와인바',
  COCKTAIL_BAR: '칵테일바',
  POCHA: '포차',
  KOREAN_PUB: '한식 주점',
  COOK_PUB: '요리주점',
  FOODCOURT: '푸드코트',
  OTHER: '기타',
};

export function benefitLabel(store: { enrollmentMode: string; pointRatePercent: number }): string {
  if (store.enrollmentMode === 'STAMP') return '스탬프 적립';
  if (store.enrollmentMode === 'MEMBERSHIP') return '태그히어 멤버십';
  return `포인트 ${store.pointRatePercent}% 적립`;
}

let sdkPromise: Promise<boolean> | null = null;

function loadKakaoMapSdk(): Promise<boolean> {
  if (!KAKAO_JS_KEY) return Promise.resolve(false);
  if (window.kakao?.maps?.LatLng) return Promise.resolve(true);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=clusterer`;
    script.async = true;
    // 카카오맵이 꺼져 있는 앱 등에서 응답 없이 멈추면 5초 뒤 목록만 보여준다
    const timer = setTimeout(() => {
      sdkPromise = null;
      resolve(false);
    }, 5000);
    script.onload = () => {
      if (!window.kakao?.maps) {
        clearTimeout(timer);
        return resolve(false);
      }
      window.kakao.maps.load(() => {
        clearTimeout(timer);
        resolve(true);
      });
    };
    script.onerror = () => {
      clearTimeout(timer);
      sdkPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export default function StoreMap() {
  const [stores, setStores] = useState<MapStore[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mapReady, setMapReady] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MapStore | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/public/stores/map`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { stores: MapStore[] }) => {
        if (!cancelled) setStores(data.stores);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stores) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clusterer: any = null;
    loadKakaoMapSdk().then((ok) => {
      if (cancelled) return;
      setMapReady(ok);
      if (!ok || !mapEl.current) return;

      const { maps } = window.kakao;
      const center = stores.length > 0
        ? new maps.LatLng(stores[0].latitude, stores[0].longitude)
        : new maps.LatLng(37.5665, 126.978); // 서울시청
      const map = new maps.Map(mapEl.current, { center, level: 8 });
      mapRef.current = map;

      const markers = stores.map((store) => {
        const marker = new maps.Marker({ position: new maps.LatLng(store.latitude, store.longitude), title: store.name });
        maps.event.addListener(marker, 'click', () => setSelected(store));
        return marker;
      });
      clusterer = new maps.MarkerClusterer({ map, averageCenter: true, minLevel: 7 });
      clusterer.addMarkers(markers);

      if (stores.length > 1) {
        const bounds = new maps.LatLngBounds();
        stores.forEach((s) => bounds.extend(new maps.LatLng(s.latitude, s.longitude)));
        map.setBounds(bounds);
      }
    });
    return () => {
      cancelled = true;
      clusterer?.clear();
      mapRef.current = null;
    };
  }, [stores]);

  const filtered = useMemo(() => {
    if (!stores) return [];
    const q = query.trim();
    if (!q) return stores;
    return stores.filter((s) => s.name.includes(q) || (s.address ?? '').includes(q));
  }, [stores, query]);

  const focusStore = (store: MapStore) => {
    setSelected(store);
    const map = mapRef.current;
    if (map && window.kakao?.maps) {
      map.setLevel(4);
      map.panTo(new window.kakao.maps.LatLng(store.latitude, store.longitude));
    }
  };

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm text-[#91949a]">매장 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  if (!stores) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {mapReady !== false && (
        <div ref={mapEl} role="region" className="flex-shrink-0 w-full h-[42vh] bg-[#f0f1f2]" aria-label="태그히어 매장 지도" />
      )}

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-bold text-[#1d2022]">매장 목록</h2>
          <span className="text-xs text-[#91949a]">{stores.length}곳</span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="매장 이름이나 동네로 찾기"
          aria-label="매장 검색"
          className="w-full mb-3 px-4 py-2.5 rounded-[10px] bg-[#f8f9fa] text-sm text-[#1d2022] placeholder:text-[#b1b5b8] outline-none focus:ring-2 focus:ring-[#FFD541]"
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-[#91949a] text-center py-8">찾는 매장이 없어요.</p>
        ) : (
          <ul className="divide-y divide-[#f0f1f2]">
            {filtered.map((store) => (
              <li key={store.id}>
                <button onClick={() => focusStore(store)} className="w-full text-left py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-[#1d2022]">{store.name}</span>
                    {store.category && (
                      <span className="text-[11px] text-[#91949a]">{CATEGORY_LABELS[store.category] ?? ''}</span>
                    )}
                  </div>
                  {store.address && <p className="text-xs text-[#91949a] mt-0.5 truncate">{store.address}</p>}
                  <p className="text-xs text-[#FFB800] font-medium mt-0.5">{benefitLabel(store)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && <StoreSheet store={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StoreSheet({ store, onClose }: { store: MapStore; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${store.name} 정보`}
        className="w-full max-w-[430px] bg-white rounded-t-2xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-lg font-bold text-[#1d2022]">{store.name}</p>
            {store.category && <p className="text-xs text-[#91949a] mt-0.5">{CATEGORY_LABELS[store.category] ?? ''}</p>}
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-[#91949a] text-xl leading-none px-1">
            ×
          </button>
        </div>
        {store.address && <p className="text-sm text-[#55595e] mb-3">{store.address}</p>}
        <div className="bg-[#FFF8E1] rounded-[10px] px-4 py-3 mb-3">
          <p className="text-sm font-semibold text-[#1d2022]">{benefitLabel(store)}</p>
          {store.stampRewards.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {store.stampRewards.map((r) => (
                <li key={r.tier} className="text-xs text-[#55595e]">
                  스탬프 {r.tier}개 · {r.description}
                </li>
              ))}
            </ul>
          )}
        </div>
        {store.naverPlaceUrl && (
          <a
            href={store.naverPlaceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 rounded-[10px] bg-[#03C75A] text-white text-sm font-semibold text-center"
          >
            네이버 플레이스에서 보기
          </a>
        )}
      </div>
    </div>
  );
}
