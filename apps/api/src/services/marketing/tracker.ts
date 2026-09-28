// 마케팅 성과 추적 — 발송 1건을 MarketingCampaign 으로 남기고 받은 고객을 기록한다.
// 직원 확인 쿠폰은 자동 마케팅과 같은 RetargetCoupon + /coupon/verify/{code} 페이지를 그대로 쓰고,
// campaignId 로 캠페인과 묶어 “몇 명이 쿠폰을 들고 왔는지”를 캠페인별로 센다.
import { customAlphabet } from 'nanoid';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

const CHUNK = 5000;
const generateCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

export type MarketingChannel = 'SMS' | 'KAKAO_COUPON' | 'PREMIUM_KAKAO';

export interface StaffVerifyOption {
  enabled: boolean;
  couponContent: string;
  expiryDate: string; // 표시용 텍스트 (예: 2026-10-12)
}

/** 요청 본문의 staffVerify 를 안전하게 읽는다 */
export function parseStaffVerify(raw: any): StaffVerifyOption | null {
  if (!raw || raw.enabled !== true) return null;
  const couponContent = String(raw.couponContent ?? '').trim().slice(0, 60);
  const expiryDate = String(raw.expiryDate ?? '').trim().slice(0, 30);
  if (!couponContent || !expiryDate) return null;
  return { enabled: true, couponContent, expiryDate };
}

export function verifyUrl(code: string): string {
  const appUrl = env.PUBLIC_APP_URL || 'http://localhost:3999';
  return `${appUrl.replace(/\/$/, '')}/coupon/verify/${code}`;
}

/** 문자 본문 끝에 붙는 직원 확인 안내 (고객별 링크) */
export function smsCouponFooter(opt: StaffVerifyOption, code: string): string {
  return `\n\n[쿠폰] ${opt.couponContent}\n유효기간 ${opt.expiryDate}까지\n매장에서 직원에게 보여주세요\n${verifyUrl(code)}`;
}

export async function recordMarketingCampaign(p: {
  storeId?: string | null;
  franchiseId?: string | null;
  channel: MarketingChannel;
  sourceId?: string | null;
  title: string;
  content?: string | null;
  targetLabel?: string | null;
  couponContent?: string | null;
  recipients: Array<{ customerId: string | null; storeId: string }>;
  cost?: number;
  /** 예약 발송이면 예약 시각 (재방문 집계 시작점) */
  sentAt?: Date;
}): Promise<string> {
  const recipients = p.recipients.filter((r): r is { customerId: string; storeId: string } => !!r.customerId);
  const campaign = await prisma.marketingCampaign.create({
    data: {
      storeId: p.storeId ?? null,
      franchiseId: p.franchiseId ?? null,
      channel: p.channel,
      sourceId: p.sourceId ?? null,
      title: p.title.slice(0, 120),
      content: p.content ?? null,
      targetLabel: p.targetLabel ?? null,
      couponEnabled: !!p.couponContent,
      couponContent: p.couponContent ?? null,
      recipientCount: recipients.length,
      cost: p.cost ?? 0,
      ...(p.sentAt ? { sentAt: p.sentAt } : {}),
    },
  });
  for (let i = 0; i < recipients.length; i += CHUNK) {
    await prisma.marketingCampaignRecipient.createMany({
      data: recipients.slice(i, i + CHUNK).map((r) => ({ campaignId: campaign.id, customerId: r.customerId, storeId: r.storeId })),
    });
  }
  return campaign.id;
}

export async function updateMarketingCampaign(id: string, data: { cost?: number; sourceId?: string; recipientCount?: number }) {
  await prisma.marketingCampaign.update({ where: { id }, data }).catch((e) => console.error('[Marketing] campaign update failed:', e.message));
}

/**
 * 받는 사람마다 직원 확인 쿠폰(고유 코드)을 만든다. 반환: 수신 순서와 같은 코드 배열.
 * 발송된 링크가 항상 유효한 쿠폰을 가리키도록 발송 전에 만든다.
 */
export async function createStaffCoupons(p: {
  campaignId: string;
  opt: StaffVerifyOption;
  recipients: Array<{ customerId: string | null; phone: string; storeId: string; naverPlaceUrl?: string | null }>;
}): Promise<string[]> {
  const seen = new Set<string>();
  const codes = p.recipients.map(() => {
    let code = generateCode();
    while (seen.has(code)) code = generateCode();
    seen.add(code);
    return code;
  });
  for (let i = 0; i < p.recipients.length; i += CHUNK) {
    await prisma.retargetCoupon.createMany({
      data: p.recipients.slice(i, i + CHUNK).map((r, j) => ({
        code: codes[i + j],
        storeId: r.storeId,
        customerId: r.customerId,
        phone: r.phone,
        couponContent: p.opt.couponContent,
        expiryDate: p.opt.expiryDate,
        naverPlaceUrl: r.naverPlaceUrl ?? null,
        campaignId: p.campaignId,
      })),
      skipDuplicates: true,
    });
  }
  return codes;
}

/** 리타겟 쿠폰(알림톡) 발송분을 캠페인에 묶는다 — 쿠폰은 이미 만들어졌으므로 코드로 연결 */
export async function linkCouponsToCampaign(campaignId: string, codes: string[]) {
  for (let i = 0; i < codes.length; i += CHUNK) {
    await prisma.retargetCoupon.updateMany({ where: { code: { in: codes.slice(i, i + CHUNK) } }, data: { campaignId } });
  }
}
