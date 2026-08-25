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
