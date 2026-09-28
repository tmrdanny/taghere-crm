// 광고성 메시지 발송 가능 시간대(KST 08:00 ~ 20:50) 판정.
// (기존에 local-customers/franchise-local-customers/brand-message(+worker)가
//  각자 지역 사본으로 갖고 있던 것을 통합)
export function isSendableTime(): boolean {
  const now = new Date();
  // KST = UTC + 9
  const kstHour = (now.getUTCHours() + 9) % 24;
  const kstMinute = now.getUTCMinutes();

  if (kstHour < 8) return false;
  if (kstHour > 20) return false;
  if (kstHour === 20 && kstMinute > 50) return false;
  return true;
}

export function getNextSendableTime(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);

  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();

  // 다음 08:00 계산
  const nextSendable = new Date(kstNow);
  nextSendable.setUTCHours(8, 0, 0, 0);

  // 현재 시간이 20:50 이후이거나 08:00 이전이면 다음 날 08:00
  if (kstHour >= 21 || (kstHour === 20 && kstMinute > 50) || kstHour < 8) {
    if (kstHour >= 8) {
      nextSendable.setUTCDate(nextSendable.getUTCDate() + 1);
    }
  }

  // UTC로 변환하여 반환
  return new Date(nextSendable.getTime() - kstOffset);
}

const KST = 9 * 60 * 60 * 1000;
const MIN_LEAD_MS = 5 * 60 * 1000; // 예약은 최소 5분 뒤부터
const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000; // 30일 이내

/** 해당 시각이 광고 발송 가능 시간(KST 08:00~20:50)인지 */
export function isWithinSendWindow(at: Date): boolean {
  const k = new Date(at.getTime() + KST);
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  return minutes >= 8 * 60 && minutes <= 20 * 60 + 50;
}

/**
 * 발송 시각 결정 — 요청에 예약 시각이 있으면 검사해서 쓰고, 없으면
 * 광고 메시지가 발송 불가 시간일 때 다음 날(또는 오늘) 오전 8시로 자동 예약한다.
 * 반환 at 이 undefined 면 지금 발송.
 */
export function resolveSendTime(raw: unknown, opts: { adWindow: boolean }): { at?: Date; auto?: boolean; error?: string } {
  if (raw !== undefined && raw !== null && raw !== '') {
    const at = new Date(String(raw));
    if (Number.isNaN(at.getTime())) return { error: '예약 시각이 올바르지 않아요.' };
    const now = Date.now();
    if (at.getTime() < now + MIN_LEAD_MS) return { error: '예약은 지금부터 5분 뒤 이후로 잡아 주세요.' };
    if (at.getTime() > now + MAX_AHEAD_MS) return { error: '예약은 30일 안으로만 잡을 수 있어요.' };
    if (opts.adWindow && !isWithinSendWindow(at)) return { error: '광고 메시지는 오전 8시~오후 8시 50분 사이로만 예약할 수 있어요.' };
    return { at };
  }
  if (opts.adWindow && !isSendableTime()) return { at: getNextSendableTime(), auto: true };
  return {};
}

/** 안내 문구용 — 예) 9월 28일 오전 8시 */
export function formatKst(at: Date): string {
  return at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
