/**
 * 알리고(Aligo) 카카오 알림톡 어댑터
 *
 * 네이버 플레이스 부스터 발송 전용. (그 외 메시지는 SOLAPI 유지)
 * 스펙: https://smartsms.aligo.in/alimapi.html
 *   - POST https://kakaoapi.aligo.in/akv10/alimtalk/send/  (application/x-www-form-urlencoded)
 *   - 본문/버튼을 전송 시 직접 전달, 응답 code === 0 이면 전송요청 성공.
 *   - 예약 발송: senddate=YYYYMMDDHHmmss(KST). 수신자 receiver_1..500.
 *   - 예약 취소: POST https://kakaoapi.aligo.in/akv10/cancel/ (apikey, userid, mid) — 발송 5분 전까지만.
 *
 * 발송 프로바이더 교체 대비: 부스터는 이 어댑터 + AlimTalkOutbox 에만 의존.
 */

import { normalizePhoneNumber } from '../utils/phone.js';

const ALIGO_SEND_URL = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';
const ALIGO_CANCEL_URL = 'https://kakaoapi.aligo.in/akv10/cancel/';

/** 알리고 한 콜당 최대 수신자 수 */
export const ALIGO_MAX_RECEIVERS = 500;

export interface AligoSendParams {
  phone: string; // 수신번호
  tplCode: string; // 알리고/카카오 등록 템플릿 코드
  subject: string; // 알림톡 제목
  message: string; // 본문 (등록 템플릿과 일치)
  buttonName?: string; // 버튼명 (예: 쿠폰 받기)
  buttonUrl?: string; // 웹링크 버튼 URL (linkMo/linkPc 공통)
  recvname?: string; // 수신자명 (선택)
  senddate?: string; // 예약 발송 시각 YYYYMMDDHHmmss(KST) — 없으면 즉시
}

export interface AligoBulkParams {
  phones: string[]; // 수신번호들 (1..500, 모두 동일 본문/버튼)
  tplCode: string;
  subject: string;
  message: string;
  buttonName?: string;
  buttonUrl?: string;
  senddate?: string; // 예약 발송 시각 YYYYMMDDHHmmss(KST) — 없으면 즉시
}

interface AligoConfig {
  apikey: string;
  userid: string;
  senderkey: string;
  sender: string;
  testMode: 'Y' | 'N';
}

function getConfig(): AligoConfig | null {
  const apikey = process.env.ALIGO_API_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const senderkey = process.env.ALIGO_SENDER_KEY;
  const sender = process.env.ALIGO_SENDER;
  if (!apikey || !userid || !senderkey || !sender) return null;
  return {
    apikey,
    userid,
    senderkey,
    sender,
    testMode: process.env.ALIGO_TEST_MODE === 'Y' ? 'Y' : 'N',
  };
}

/** UTC Date → 알리고 예약 senddate 문자열 YYYYMMDDHHmmss (KST) */
export function formatSenddateKST(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00'; // 일부 런타임이 자정을 '24'로 반환
  return `${get('year')}${get('month')}${get('day')}${hour}${get('minute')}${get('second')}`;
}

/** 웹링크 버튼 1개 JSON (알리고 button_N 포맷) */
function buildButtonJson(buttonName: string | undefined, buttonUrl: string): string {
  return JSON.stringify({
    button: [
      {
        name: buttonName || '자세히 보기',
        linkType: 'WL',
        linkTypeName: '웹링크',
        linkMo: buttonUrl,
        linkPc: buttonUrl,
      },
    ],
  });
}

/** 전송 폼바디 구성 (단건, 순수 함수 — 단위 테스트 용이) */
export function buildAligoSendBody(config: AligoConfig, params: AligoSendParams): URLSearchParams {
  const body = new URLSearchParams();
  body.set('apikey', config.apikey);
  body.set('userid', config.userid);
  body.set('senderkey', config.senderkey);
  body.set('tpl_code', params.tplCode);
  body.set('sender', config.sender);
  body.set('receiver_1', normalizePhoneNumber(params.phone));
  if (params.recvname) body.set('recvname_1', params.recvname);
  body.set('subject_1', params.subject);
  body.set('message_1', params.message);
  if (params.buttonUrl) body.set('button_1', buildButtonJson(params.buttonName, params.buttonUrl));
  if (params.senddate) body.set('senddate', params.senddate);
  body.set('testMode', config.testMode);
  return body;
}

/** 전송 폼바디 구성 (다건, 모두 동일 본문/버튼 — 순수 함수) */
export function buildAligoBulkBody(config: AligoConfig, params: AligoBulkParams): URLSearchParams {
  const body = new URLSearchParams();
  body.set('apikey', config.apikey);
  body.set('userid', config.userid);
  body.set('senderkey', config.senderkey);
  body.set('tpl_code', params.tplCode);
  body.set('sender', config.sender);
  const buttonJson = params.buttonUrl ? buildButtonJson(params.buttonName, params.buttonUrl) : null;
  params.phones.forEach((phone, i) => {
    const n = i + 1;
    body.set(`receiver_${n}`, normalizePhoneNumber(phone));
    body.set(`subject_${n}`, params.subject);
    body.set(`message_${n}`, params.message);
    if (buttonJson) body.set(`button_${n}`, buttonJson);
  });
  if (params.senddate) body.set('senddate', params.senddate);
  body.set('testMode', config.testMode);
  return body;
}

export interface AligoResult {
  success: boolean;
  code?: number;
  message?: string;
  mid?: string;
  error?: string;
}

function parseSendResult(data: { code?: number; message?: string; info?: { mid?: string | number } }): AligoResult {
  if (data.code === 0) {
    return {
      success: true,
      code: 0,
      message: data.message,
      mid: data.info?.mid != null ? String(data.info.mid) : undefined,
    };
  }
  return { success: false, code: data.code, message: data.message, error: data.message || `Aligo error code ${data.code}` };
}

/** 알리고 알림톡 전송 (단건). code === 0 이면 성공. */
export async function sendAligoAlimtalk(params: AligoSendParams): Promise<AligoResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: 'Aligo not configured (ALIGO_API_KEY/USER_ID/SENDER_KEY/SENDER)' };
  }
  if (!params.tplCode) {
    return { success: false, error: 'Aligo tpl_code missing (ALIGO_PLACE_BOOSTER_TPL_CODE)' };
  }

  try {
    const body = buildAligoSendBody(config, params);
    const res = await fetch(ALIGO_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as { code?: number; message?: string; info?: { mid?: string | number } };
    return parseSendResult(data);
  } catch (error: any) {
    return { success: false, error: error?.message || 'Aligo request failed' };
  }
}

/** 알리고 알림톡 전송 (다건, 최대 500). senddate 지정 시 예약 발송. mid 반환. */
export async function sendAligoAlimtalkBulk(params: AligoBulkParams): Promise<AligoResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: 'Aligo not configured (ALIGO_API_KEY/USER_ID/SENDER_KEY/SENDER)' };
  }
  if (!params.tplCode) {
    return { success: false, error: 'Aligo tpl_code missing (ALIGO_PLACE_BOOSTER_TPL_CODE)' };
  }
  if (params.phones.length === 0) {
    return { success: false, error: 'Aligo bulk: no receivers' };
  }
  if (params.phones.length > ALIGO_MAX_RECEIVERS) {
    return { success: false, error: `Aligo bulk: too many receivers (max ${ALIGO_MAX_RECEIVERS})` };
  }

  try {
    const body = buildAligoBulkBody(config, params);
    const res = await fetch(ALIGO_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as { code?: number; message?: string; info?: { mid?: string | number } };
    return parseSendResult(data);
  } catch (error: any) {
    return { success: false, error: error?.message || 'Aligo bulk request failed' };
  }
}

/** 알리고 예약 발송 취소 (mid 단위). 발송 5분 전까지만 가능. result_code===1 이면 성공. */
export async function cancelAligoReservation(mid: string): Promise<AligoResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: 'Aligo not configured (ALIGO_API_KEY/USER_ID/SENDER_KEY/SENDER)' };
  }
  try {
    const body = new URLSearchParams();
    body.set('apikey', config.apikey);
    body.set('userid', config.userid);
    body.set('mid', mid);
    const res = await fetch(ALIGO_CANCEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as { code?: number; result_code?: number; message?: string };
    const ok = data.result_code === 1 || data.code === 0;
    if (ok) return { success: true, code: data.code, message: data.message, mid };
    return {
      success: false,
      code: data.code,
      message: data.message,
      mid,
      error: data.message || `Aligo cancel failed (mid=${mid})`,
    };
  } catch (error: any) {
    return { success: false, mid, error: error?.message || 'Aligo cancel request failed' };
  }
}
