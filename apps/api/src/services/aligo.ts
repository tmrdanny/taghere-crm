/**
 * 알리고(Aligo) 카카오 알림톡 어댑터
 *
 * 네이버 플레이스 부스터 발송 전용. (그 외 메시지는 SOLAPI 유지)
 * 스펙: https://smartsms.aligo.in/alimapi.html
 *   - POST https://kakaoapi.aligo.in/akv10/alimtalk/send/  (application/x-www-form-urlencoded)
 *   - 본문/버튼을 전송 시 직접 전달, 응답 code === 0 이면 전송요청 성공.
 *
 * 발송 프로바이더 교체 대비: 부스터는 이 어댑터 + AlimTalkOutbox 에만 의존.
 */

import { normalizePhoneNumber } from '../utils/phone.js';

const ALIGO_SEND_URL = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

export interface AligoSendParams {
  phone: string; // 수신번호
  tplCode: string; // 알리고/카카오 등록 템플릿 코드
  subject: string; // 알림톡 제목
  message: string; // 본문 (등록 템플릿과 일치)
  buttonName?: string; // 버튼명 (예: 쿠폰 받기)
  buttonUrl?: string; // 웹링크 버튼 URL (linkMo/linkPc 공통)
  recvname?: string; // 수신자명 (선택)
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

/** 전송 폼바디 구성 (순수 함수 — 단위 테스트 용이) */
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
  if (params.buttonUrl) {
    const button = {
      button: [
        {
          name: params.buttonName || '자세히 보기',
          linkType: 'WL',
          linkTypeName: '웹링크',
          linkMo: params.buttonUrl,
          linkPc: params.buttonUrl,
        },
      ],
    };
    body.set('button_1', JSON.stringify(button));
  }
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
    if (data.code === 0) {
      return { success: true, code: 0, message: data.message, mid: data.info?.mid != null ? String(data.info.mid) : undefined };
    }
    return { success: false, code: data.code, message: data.message, error: data.message || `Aligo error code ${data.code}` };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Aligo request failed' };
  }
}
