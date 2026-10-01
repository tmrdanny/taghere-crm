/**
 * 플레이스 부스터 발송 채널 — 솔라피 "태그히어" 채널 알림톡.
 *
 * "태그히어플레이스" 채널(알리고 UG_5628) 정지로 2026-10 부터 솔라피 "태그히어" 채널의
 * 승인 템플릿("플레이스 부스터 메인")으로 보낸다. 호출측(워커·취소·결과 수집·테스트 발송)은
 * 기존 알리고 함수와 같은 모양으로 쓰고, 예약 식별자(mid)는 솔라피 groupId 를 그대로 aligoMids 에 담는다.
 * 숫자만으로 된 mid 는 알리고 시절 예약이므로 취소·결과 수집을 알리고로 보낸다.
 */
import { getSolapiService } from './solapi-instance.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { cancelAligoReservation, getAligoSendResults, type AligoRecipientResult } from './aligo.js';

export const BOOSTER_TEMPLATE_ID = process.env.SOLAPI_TEMPLATE_ID_PLACE_BOOSTER || 'KA01TP260929151347091BhSJr1MRGNH';
/** 솔라피 "태그히어" 채널 (부스터 템플릿이 승인된 채널) */
const BOOSTER_PF_ID = 'KA01PF240519021055559bK17Af2bhY4';
/** 워커 청크 크기 (기존 알리고 청크와 같은 단위로 기록·재개) */
export const BOOSTER_CHUNK = 500;

export interface BoosterSendResult {
  success: boolean;
  mid?: string;
  error?: string;
}

const isAligoMid = (mid: string) => /^\d+$/.test(mid);

/** 템플릿 변수 — 본문: "#{금액} 쿠폰이 도착했어요. ▶ 쿠폰 코드 ▶ 쿠폰 ▶ 유효기간", 버튼: https://#{접속링크} */
export function boosterVariables(p: { couponContent: string; couponCode: string; couponAmount: string; validText: string; linkUrl: string }) {
  return {
    '#{금액}': p.couponContent,
    '#{쿠폰코드}': p.couponCode,
    '#{쿠폰금액}': p.couponAmount,
    '#{유효기간}': p.validText,
    '#{접속링크}': p.linkUrl.replace(/^https?:\/\//, ''),
  };
}

/** 여러 명에게 같은 내용 — scheduledAt 이 미래면 솔라피 예약 발송. mid = 솔라피 groupId */
export async function sendBoosterBulk(p: { phones: string[]; variables: Record<string, string>; scheduledAt?: Date }): Promise<BoosterSendResult> {
  if (p.phones.length === 0) return { success: false, error: 'no receivers' };
  const solapi = getSolapiService('[Booster] No SOLAPI credentials configured');
  if (!solapi) return { success: false, error: 'SOLAPI not configured' };
  const [r] = await solapi.sendBulkAlimTalk({
    pfId: BOOSTER_PF_ID,
    scheduledAt: p.scheduledAt && p.scheduledAt.getTime() > Date.now() + 60_000 ? p.scheduledAt : undefined,
    disableSms: true,
    messages: p.phones.map((to) => ({ to, templateId: BOOSTER_TEMPLATE_ID, variables: p.variables })),
  });
  if (!r || !r.groupId || r.acceptedCount === 0) {
    return { success: false, error: r ? [...r.failedPhones.values()][0] || 'Solapi send failed' : 'Solapi send failed' };
  }
  return { success: true, mid: r.groupId };
}

export async function sendBoosterOne(p: { phone: string; variables: Record<string, string> }): Promise<BoosterSendResult> {
  return sendBoosterBulk({ phones: [p.phone], variables: p.variables });
}

/** 예약 취소 — 알리고 mid 면 알리고, 아니면 솔라피 그룹 예약 취소 */
export async function cancelBoosterReservation(mid: string): Promise<BoosterSendResult> {
  if (isAligoMid(mid)) {
    const r = await cancelAligoReservation(mid);
    return { success: r.success, mid, error: r.error };
  }
  const solapi = getSolapiService('[Booster] No SOLAPI credentials configured');
  if (!solapi) return { success: false, mid, error: 'SOLAPI not configured' };
  const r = await solapi.cancelReservation(mid);
  return { success: r.success, mid, error: r.error };
}

/** 수신자별 결과 — 알리고 mid 면 알리고 history, 아니면 솔라피 그룹 결과 (실패/미적재 시 빈 배열) */
export async function getBoosterSendResults(mid: string): Promise<AligoRecipientResult[]> {
  if (isAligoMid(mid)) return getAligoSendResults(mid);
  const solapi = getSolapiService('[Booster] No SOLAPI credentials configured');
  if (!solapi) return [];
  const r = await solapi.getGroupMessageStatuses(mid);
  if (!r.success || !r.statuses) return [];
  return [...r.statuses.entries()].map(([phone, s]) => ({
    phone: normalizePhoneNumber(phone),
    rslt: s.status,
    rsltMessage: s.status === 'FAILED' ? s.failReason || '' : '',
  }));
}
