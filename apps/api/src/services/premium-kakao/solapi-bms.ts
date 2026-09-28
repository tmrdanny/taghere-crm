// 솔라피 카카오 브랜드 메시지 REST 호출 (SDK v5.5.3 에 브랜드 템플릿·BMS 타입이 없어 직접 호출)
//
// - 템플릿: POST/DELETE /kakao/v2/brand-templates — 검수 없이 즉시 ACTIVE
// - 이미지: POST /storage/v1/files (type 은 말풍선 슬롯별 BMS_*)
// - 발송: POST /messages/v4/send-many/detail — kakaoOptions.templateId + bms.targeting 'M'
//   (확대 발송 M 은 카카오 승인 채널만, 템플릿 기반 메시지만 허용)
import crypto from 'crypto';
import fs from 'fs';
import { env } from '../../config/env.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { BubbleType, PkButton, PkCommerce, PkContent, STAFF_VERIFY_BUTTON, couponTitle } from './spec.js';

const API = 'https://api.solapi.com';
const SENDER = '07041380263';

/** 브랜드 메시지 채널 ("태그히어 플레이스") — 별도 지정이 없으면 알림톡 채널과 같다 */
export function bmsPfId(): string {
  const pfId = process.env.SOLAPI_BMS_PF_ID || env.SOLAPI_PF_ID;
  if (!pfId) throw new Error('카카오 채널(SOLAPI_PF_ID)이 설정되지 않았습니다.');
  return pfId;
}

/** 발송 대상 범위 — 기본 M (마케팅 수신 동의 고객 전체). 확인용으로 I(채널 친구)로 바꿀 수 있다 */
function targeting(): 'I' | 'M' | 'N' {
  const t = process.env.SOLAPI_BMS_TARGETING;
  return t === 'I' || t === 'N' ? t : 'M';
}

function authHeader(): string {
  const apiKey = env.SOLAPI_API_KEY;
  const apiSecret = env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('SOLAPI 설정이 되어 있지 않습니다.');
  const salt = crypto.randomBytes(16).toString('hex');
  const date = new Date().toISOString();
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.errorMessage || data?.message || data?.errorCode || `HTTP ${res.status}`;
    console.error(`[SolapiBMS] ${method} ${path} failed:`, text.slice(0, 1000));
    throw new Error(msg);
  }
  return data as T;
}

// ---------- 이미지 ----------
export async function uploadBmsImage(filePath: string, slot: string): Promise<string> {
  const file = (await fs.promises.readFile(filePath)).toString('base64');
  const data = await call<{ fileId?: string }>('POST', '/storage/v1/files', { file, type: slot, name: `pk-${Date.now()}` });
  if (!data?.fileId) throw new Error('이미지 ID를 받지 못했습니다.');
  return data.fileId;
}

// ---------- 템플릿 ----------
const digits = (s: string) => String(s ?? '').replace(/[^\d]/g, '');

const toButton = (b: PkButton) => ({ name: b.name.trim(), linkType: 'WL', linkMobile: b.link.trim(), linkPc: b.link.trim() });

function toCommerce(c: PkCommerce) {
  const regular = Number(digits(c.regularPrice));
  const sale = digits(c.discountPrice) ? Number(digits(c.discountPrice)) : null;
  // 허용 조합: 정가만 / 정가 + 할인가 + 할인율
  if (sale === null || sale >= regular) return { title: c.title.trim(), regularPrice: String(regular) };
  const rate = Math.max(1, Math.min(100, Math.round((1 - sale / regular) * 100)));
  return { title: c.title.trim(), regularPrice: String(regular), discountPrice: String(sale), discountRate: String(rate) };
}

/** 편집 내용 → 솔라피 브랜드 템플릿 본문 */
export function toTemplateBody(type: BubbleType, c: PkContent, defaultLink: string, verifyLink?: string) {
  const body: Record<string, unknown> = { chatBubbleType: type, adult: false };
  // 직원 확인: 버튼 맨 끝(캐러셀은 카드마다)에 고객별 직원 확인 링크(#{쿠폰코드} 변수) 버튼을 붙인다
  const verifyButton = verifyLink ? [{ name: STAFF_VERIFY_BUTTON, linkType: 'WL', linkMobile: verifyLink, linkPc: verifyLink }] : [];
  const buttons = [...c.buttons.filter((b) => b.name.trim()).map(toButton), ...verifyButton];
  // 직원 확인을 켜면 쿠폰 “받기”도 고객별 직원 확인 페이지로 열린다
  const couponLink = (verifyLink || c.buttons[0]?.link || defaultLink || '').trim();
  const coupon = c.coupon
    ? { title: couponTitle(c.coupon), description: c.coupon.description.trim(), ...(couponLink ? { linkMobile: couponLink, linkPc: couponLink } : {}) }
    : undefined;

  switch (type) {
    case 'TEXT':
      Object.assign(body, { content: c.content });
      break;
    case 'IMAGE':
    case 'WIDE':
      Object.assign(body, { content: c.content, imageId: c.image?.imageId });
      break;
    case 'COMMERCE':
      Object.assign(body, {
        imageId: c.image?.imageId,
        commerce: toCommerce(c.commerce),
        ...(c.additionalContent.trim() ? { additionalContent: c.additionalContent.trim() } : {}),
      });
      break;
    case 'WIDE_ITEM_LIST':
      Object.assign(body, {
        header: c.header.trim(),
        mainWideItem: { title: c.mainItem.title, imageId: c.mainItem.image?.imageId, linkMobile: c.mainItem.link.trim(), linkPc: c.mainItem.link.trim() },
        subWideItemList: c.subItems.map((it) => ({ title: it.title.trim(), imageId: it.image?.imageId, linkMobile: it.link.trim(), linkPc: it.link.trim() })),
      });
      break;
    case 'CAROUSEL_FEED':
      Object.assign(body, {
        carousel: {
          list: c.cards.map((card) => ({
            header: card.header.trim(),
            content: card.content,
            imageId: card.image?.imageId,
            buttons: [...card.buttons.map(toButton), ...verifyButton],
          })),
        },
      });
      break;
    case 'CAROUSEL_COMMERCE':
      Object.assign(body, {
        carousel: {
          list: c.cards.map((card) => ({
            imageId: card.image?.imageId,
            commerce: toCommerce(card.commerce),
            ...(card.additionalContent.trim() ? { additionalContent: card.additionalContent.trim() } : {}),
            buttons: [...card.buttons.map(toButton), ...verifyButton],
          })),
        },
      });
      break;
    case 'PREMIUM_VIDEO':
      Object.assign(body, {
        ...(c.header.trim() ? { header: c.header.trim() } : {}),
        content: c.content,
        video: { videoUrl: c.videoUrl.trim(), ...(c.image ? { imageId: c.image.imageId } : {}) },
      });
      break;
  }

  if (!['CAROUSEL_FEED', 'CAROUSEL_COMMERCE'].includes(type) && buttons.length) body.buttons = buttons;
  if (coupon && !['CAROUSEL_FEED', 'CAROUSEL_COMMERCE'].includes(type)) body.coupon = coupon;
  return body;
}

export async function createBrandTemplate(type: BubbleType, content: PkContent, name: string, defaultLink = '', verifyLink?: string): Promise<string> {
  const data = await call<{ brandTemplateId?: string; status?: string }>('POST', '/kakao/v2/brand-templates', {
    pfId: bmsPfId(),
    name: name.slice(0, 100),
    ...toTemplateBody(type, content, defaultLink, verifyLink),
  });
  if (!data?.brandTemplateId) throw new Error('템플릿 ID를 받지 못했습니다.');
  return data.brandTemplateId;
}

export async function deleteBrandTemplate(templateId: string): Promise<void> {
  await call('DELETE', `/kakao/v2/brand-templates/${encodeURIComponent(templateId)}`);
}

// ---------- 발송 ----------
export interface BmsGroupResult {
  groupId: string;
  failedPhones: Map<string, string>;
  error?: string;
}

/** 템플릿으로 한 그룹(최대 10,000건) 발송 접수 */
export async function sendBrandTemplateGroup(params: {
  templateId: string;
  recipients: Array<{ phone: string; variables?: Record<string, string> }>;
  scheduledAt?: Date;
  chatBubbleType?: BubbleType;
}): Promise<BmsGroupResult> {
  const pfId = bmsPfId();
  const messages = params.recipients.map((r) => ({
    to: normalizePhoneNumber(r.phone),
    from: SENDER,
    kakaoOptions: {
      pfId,
      templateId: params.templateId,
      variables: r.variables ?? {},
      disableSms: true,
      bms: { targeting: targeting(), ...(params.chatBubbleType ? { chatBubbleType: params.chatBubbleType } : {}) },
    },
  }));
  try {
    const data = await call<any>('POST', '/messages/v4/send-many/detail', {
      messages,
      ...(params.scheduledAt ? { scheduledDate: params.scheduledAt.toISOString() } : {}),
    });
    const failedPhones = new Map<string, string>();
    for (const f of data?.failedMessageList ?? []) {
      failedPhones.set(normalizePhoneNumber(f.to || ''), f.statusMessage || f.reason || '접수 실패');
    }
    return { groupId: data?.groupInfo?.groupId || '', failedPhones };
  } catch (e: any) {
    const failedPhones = new Map<string, string>();
    for (const m of messages) failedPhones.set(m.to, e.message || '접수 실패');
    return { groupId: '', failedPhones, error: e.message };
  }
}
