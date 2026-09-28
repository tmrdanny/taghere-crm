import { describe, it, expect } from 'vitest';
import { mergeStayMinutes } from '../services/stay-time.js';

// 체류 시간 병합은 순수 함수 — V2 응답이 없거나 미지원이면 전부 null, 있으면 orderId 로만 매칭한다
describe('mergeStayMinutes', () => {
  const entries = [
    { id: 'a', orderId: 'OR01ABC' },
    { id: 'b', orderId: 'OR01DEF' },
    { id: 'c', orderId: null },
    { id: 'd', orderId: '5f1e2d3c4b5a69788796a5b4' }, // V1 형식
  ];

  it('V2 결과가 없으면 모든 항목이 null 이다', () => {
    const merged = mergeStayMinutes(entries, null);
    expect(merged.map((e) => e.stayMinutes)).toEqual([null, null, null, null]);
    expect(merged[0]).toMatchObject({ id: 'a', orderId: 'OR01ABC' });
  });

  it('미지원 매장(supported=false)이면 orders 가 있어도 전부 null 이다', () => {
    const merged = mergeStayMinutes(entries, {
      supported: false,
      orders: [{ orderId: 'OR01ABC', stayMinutes: 50 }],
    });
    expect(merged.map((e) => e.stayMinutes)).toEqual([null, null, null, null]);
  });

  it('orderId 가 일치하는 항목만 값을 받고 나머지는 null 이다', () => {
    const merged = mergeStayMinutes(entries, {
      supported: true,
      orders: [
        { orderId: 'OR01ABC', stayMinutes: 75 },
        { orderId: 'OR01DEF', stayMinutes: null },
        { orderId: 'OR01ZZZ', stayMinutes: 10 }, // 요청에 없는 주문
      ],
    });
    expect(merged.map((e) => e.stayMinutes)).toEqual([75, null, null, null]);
  });
});
