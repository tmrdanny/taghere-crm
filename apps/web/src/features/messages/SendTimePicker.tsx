'use client';

import { useEffect, useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

// 발송 시간 — 지금 보내기 / 예약 발송.
// 광고 메시지는 오전 8시 ~ 오후 8시 50분에만 보낼 수 있어서, 그 밖의 시간이면 “지금 보내기”를 막고
// 사장님들이 가장 많이 쓰는 다음 오전 8시로 예약을 먼저 잡아 둔다. 예약은 솔라피 예약 발송으로 나간다.
export interface SendTimeValue {
  mode: 'now' | 'schedule';
  date: string; // YYYY-MM-DD (KST)
  time: string; // HH:mm (KST)
}

const KST = 9 * 3600 * 1000;
const kstParts = (d: Date) => {
  const k = new Date(d.getTime() + KST);
  return { date: k.toISOString().slice(0, 10), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
};
const OPEN = 8 * 60;
const CLOSE = 20 * 60 + 50;

/** 지금 광고 메시지를 보낼 수 있는 시간인지 (KST 08:00~20:50) */
export function isAdSendableNow(): boolean {
  const { minutes } = kstParts(new Date());
  return minutes >= OPEN && minutes <= CLOSE;
}

/** 다음 오전 8시 (오늘 8시 전이면 오늘, 아니면 내일) */
export function nextMorning(): SendTimeValue {
  const { date, minutes } = kstParts(new Date());
  const d = minutes < OPEN ? date : kstParts(new Date(Date.now() + 86400000)).date;
  return { mode: 'schedule', date: d, time: '08:00' };
}

export const defaultSendTime = (): SendTimeValue => ({ ...nextMorning(), mode: 'now' });

/** 요청 본문용 ISO 시각 (지금 보내기면 undefined) */
export function sendTimeToIso(v: SendTimeValue): string | undefined {
  if (v.mode === 'now') return undefined;
  return new Date(`${v.date}T${v.time}:00+09:00`).toISOString();
}

/** 버튼·안내용 — 예) 9월 28일 (일) 오전 8:00 */
export function formatSendTime(v: SendTimeValue): string {
  const d = new Date(`${v.date}T${v.time}:00+09:00`);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** 예약 시각 검사 — 문제 없으면 null */
export function sendTimeError(v: SendTimeValue, adWindow: boolean): string | null {
  if (v.mode === 'now') return adWindow && !isAdSendableNow() ? '지금은 광고 메시지를 보낼 수 없는 시간이에요. 예약으로 보내 주세요.' : null;
  const at = new Date(`${v.date}T${v.time}:00+09:00`).getTime();
  if (Number.isNaN(at)) return '예약 날짜와 시간을 골라 주세요.';
  if (at < Date.now() + 5 * 60 * 1000) return '예약은 지금부터 5분 뒤 이후로 잡아 주세요.';
  if (at > Date.now() + 30 * 86400000) return '예약은 30일 안으로만 잡을 수 있어요.';
  if (adWindow) {
    const [h, m] = v.time.split(':').map(Number);
    const mins = h * 60 + m;
    if (mins < OPEN || mins > CLOSE) return '광고 메시지는 오전 8시 ~ 오후 8시 50분 사이로 예약해 주세요.';
  }
  return null;
}

const timeLabel = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`;
};

export function SendTimePicker({
  value,
  onChange,
  adWindow = true,
}: {
  value: SendTimeValue;
  onChange: (v: SendTimeValue) => void;
  /** 광고 메시지 — 오전 8시 ~ 오후 8시 50분만 발송·예약 가능 */
  adWindow?: boolean;
}) {
  const blockedNow = adWindow && !isAdSendableNow();

  // 발송 불가 시간이면 다음 오전 8시로 예약을 먼저 잡아 둔다
  useEffect(() => {
    if (blockedNow && value.mode === 'now') onChange(nextMorning());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedNow, value.mode]);

  const times = useMemo(() => {
    const list: string[] = [];
    for (let m = adWindow ? OPEN : 0; m <= (adWindow ? CLOSE : 23 * 60 + 30); m += 30) list.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    if (adWindow && !list.includes('20:50')) list.push('20:50');
    return list;
  }, [adWindow]);

  const today = kstParts(new Date()).date;
  const tomorrow = kstParts(new Date(Date.now() + 86400000)).date;
  const maxDate = kstParts(new Date(Date.now() + 29 * 86400000)).date;
  const quick: Array<{ label: string; v: SendTimeValue; recommended?: boolean }> = [
    { label: blockedNow && kstParts(new Date()).minutes < OPEN ? '오늘 오전 8시' : '내일 오전 8시', v: nextMorning(), recommended: true },
    { label: '내일 오전 11시', v: { mode: 'schedule', date: tomorrow, time: '11:00' } },
    { label: '내일 오후 5시', v: { mode: 'schedule', date: tomorrow, time: '17:00' } },
  ];
  const error = sendTimeError(value, adWindow);
  const inputCls =
    'h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-ink)] focus:outline-none';

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">발송 시간</span>
        <div className="flex rounded-[10px] bg-[color:var(--ad-bg)] p-[3px]" role="radiogroup" aria-label="발송 시간">
          <button
            type="button"
            role="radio"
            aria-checked={value.mode === 'now'}
            disabled={blockedNow}
            onClick={() => onChange({ ...value, mode: 'now' })}
            className={cn('h-8 rounded-[8px] px-3 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40', value.mode === 'now' ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
          >
            지금 보내기
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value.mode === 'schedule'}
            onClick={() => onChange({ ...value, mode: 'schedule' })}
            className={cn('h-8 rounded-[8px] px-3 text-[12.5px] font-medium', value.mode === 'schedule' ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
          >
            예약 발송
          </button>
        </div>
      </div>

      {blockedNow && (
        <div className="flex items-start gap-2 rounded-[10px] bg-[color:var(--ad-bg)] px-3 py-2.5 text-[12.5px] leading-[1.55] text-[color:var(--ad-ink-2)]">
          <CalendarClock className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.8} />
          <span>
            지금은 광고 메시지를 보낼 수 없는 시간이에요 (오후 8시 50분 ~ 오전 8시). 사장님들이 가장 많이 보내는 <b>{quick[0].label}</b>로 예약해 둘게요.
          </span>
        </div>
      )}

      {value.mode === 'schedule' && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => {
              const on = q.v.date === value.date && q.v.time === value.time;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => onChange(q.v)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[12.5px]',
                    on ? 'border-[color:var(--ad-ink)] bg-[color:var(--ad-ink)] font-medium text-white' : 'border-[color:var(--ad-line-strong)] bg-white text-[color:var(--ad-ink-2)]'
                  )}
                >
                  {q.label}
                  {q.recommended && <span className={cn('ml-1 text-[11px]', on ? 'text-white/70' : 'text-[color:var(--ad-faint)]')}>추천</span>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={value.date}
              min={today}
              max={maxDate}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
              className={inputCls}
              aria-label="예약 날짜"
            />
            <select value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} className={inputCls} aria-label="예약 시간">
              {!times.includes(value.time) && <option value={value.time}>{timeLabel(value.time)}</option>}
              {times.map((t) => (
                <option key={t} value={t}>
                  {timeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <p className={cn('text-[12px]', error ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-muted)]')}>
            {error ?? `${formatSendTime(value)}에 보내요. 발송 비용은 예약할 때 차감되고, 못 받은 건은 환불돼요.`}
          </p>
        </div>
      )}
    </div>
  );
}
