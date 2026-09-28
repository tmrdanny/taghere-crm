// 프리미엄 카카오톡 발송 — 편집 내용을 솔라피 브랜드 템플릿으로 등록하고, 그 템플릿으로 그룹 발송한다.
// (확대 발송 targeting M 은 템플릿 기반 메시지만 허용)
//
// 과금은 리타겟 쿠폰 그룹 발송과 같다: 접수된 건만 매장 지갑에서 차감하고, 발송 기록마다
// billing/unitCost 를 남겨 워커가 실패 확정 시 같은 경로로 환불한다. 결과가 모두 확정되면
// finalizePremiumKakaoCampaigns 가 캠페인 집계를 채우고 템플릿을 지운다.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { BubbleType, PkContent, SPEC, STORE_NAME_VAR, couponTitle } from './spec.js';
import { recordMarketingCampaign, updateMarketingCampaign, createStaffCoupons, verifyUrl } from '../marketing/tracker.js';
import { targetLabelOf } from '../marketing/labels.js';
import { resolveStockImages } from './stock.js';
import { createBrandTemplate, deleteBrandTemplate, sendBrandTemplateGroup } from './solapi-bms.js';

const CHUNK_SIZE = 10000; // 솔라피 send 1회 요청 최대 건수 (= 그룹 1개)
export const COUPON_CODE_VAR = '#{쿠폰코드}'; // 직원 확인 링크에 들어가는 고객별 변수

export interface PremiumRecipient {
  customerId: string | null;
  phone: string;
  storeId: string; // 고객 소속 매장 (발송 기록·쿠폰 기준)
}

/** 과금 주체 — 사장님 매장 지갑 / 프랜차이즈 지갑 */
export type PremiumPayer = { kind: 'STORE'; storeId: string } | { kind: 'FRANCHISE'; franchiseId: string };

export interface PremiumSendParams {
  payer: PremiumPayer;
  senderName: string; // 템플릿 이름용 (매장명 / 브랜드명)
  type: BubbleType;
  content: PkContent;
  recipients: PremiumRecipient[];
  unitCost: number;
  isTest: boolean;
  targetType: string;
  targetFilter?: Prisma.InputJsonValue;
  scheduledAt?: Date;
  /** 쿠폰 링크 기본값 (버튼이 없을 때) — 매장 네이버 플레이스 */
  defaultLink?: string;
  /** 프랜차이즈: 손님별 매장명 (#{매장명} 변수 — 발송 매장 안내) */
  storeNames?: Map<string, string> | null;
  /** 직원 확인 — “직원 확인” 버튼(과 카카오 쿠폰의 “받기”)이 고객별 직원 확인 페이지로 열린다 */
  staffVerify?: { couponContent: string; expiryDate: string } | null;
}

export interface PremiumSendResult {
  campaignId: string;
  queued: number;
  dropped: number;
  totalCost: number;
}

export async function sendPremiumKakao(params: PremiumSendParams): Promise<PremiumSendResult> {
  const { payer, senderName, type, content, unitCost, isTest, scheduledAt } = params;
  const storeId = payer.kind === 'STORE' ? payer.storeId : null;
  const franchiseId = payer.kind === 'FRANCHISE' ? payer.franchiseId : null;

  // 같은 번호는 한 번만 (그룹 결과 확인이 번호 기준)
  const seen = new Set<string>();
  const recipients = params.recipients.filter((r) => {
    const p = normalizePhoneNumber(r.phone);
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  const campaign = await prisma.premiumKakaoCampaign.create({
    data: {
      storeId,
      franchiseId,
      bubbleType: type,
      content: content as unknown as Prisma.InputJsonValue,
      targetType: params.targetType,
      targetFilter: params.targetFilter,
      targetCount: recipients.length,
      unitCost,
      isTest,
      scheduledAt: scheduledAt ?? null,
      status: 'SENDING',
    },
  });

  // 직원 확인: 고객마다 쿠폰 코드를 만들고, 직원 확인 버튼 링크를 #{쿠폰코드} 변수로 둔다
  const verify = params.staffVerify ?? null;
  const couponContent =
    verify?.couponContent.trim() || (content.coupon ? `${couponTitle(content.coupon)} · ${content.coupon.description}` : '매장 쿠폰');

  // 마케팅 성과 추적 (테스트 제외)
  const marketingCampaignId = isTest
    ? null
    : await recordMarketingCampaign({
        storeId,
        franchiseId,
        channel: 'PREMIUM_KAKAO',
        sourceId: campaign.id,
        title: summaryOf(type, content),
        targetLabel: targetLabelOf(params.targetType, (params.targetFilter as any)?.segmentId ?? null),
        couponContent: verify ? couponContent : null,
        recipients: recipients.map((r) => ({ customerId: r.customerId, storeId: r.storeId })),
        sentAt: scheduledAt,
      });

  let codes: string[] | null = null;
  if (verify) {
    const couponCampaignId = marketingCampaignId ?? (await recordMarketingCampaign({
      storeId, franchiseId, channel: 'PREMIUM_KAKAO', sourceId: campaign.id, title: '[테스트] ' + summaryOf(type, content), recipients: [],
    }));
    codes = await createStaffCoupons({
      campaignId: couponCampaignId,
      opt: { enabled: true, couponContent, expiryDate: verify.expiryDate },
      recipients: recipients.map((r) => ({ customerId: r.customerId, phone: normalizePhoneNumber(r.phone), storeId: r.storeId, naverPlaceUrl: params.defaultLink || null })),
    });
  }

  // 1) 편집 내용 → 브랜드 템플릿 (검수 없이 즉시 사용 가능). 샘플 이미지는 이때 솔라피에 올린다
  let templateId: string;
  try {
    const resolvedContent = await resolveStockImages(type, content);
    templateId = await createBrandTemplate(type, resolvedContent, `${senderName.slice(0, 40)} ${campaign.id}`, params.defaultLink, verify ? verifyUrl(COUPON_CODE_VAR) : undefined);
  } catch (e: any) {
    await prisma.premiumKakaoCampaign.update({ where: { id: campaign.id }, data: { status: 'FAILED', completedAt: new Date() } });
    throw new Error(`카카오 메시지를 만들지 못했어요: ${e.message}`);
  }
  await prisma.premiumKakaoCampaign.update({ where: { id: campaign.id }, data: { solapiTemplateId: templateId } });

  let queued = 0;
  let dropped = 0;
  let totalCost = 0;
  const billingKind = isTest ? 'FREE' : payer.kind === 'STORE' ? 'STORE_WALLET' : 'FRANCHISE_WALLET';

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const slice = recipients.slice(i, i + CHUNK_SIZE).map((r, j) => ({
      ...r,
      outboxId: `pk_${campaign.id}_${i + j}`,
      variables: {
        ...(codes ? { [COUPON_CODE_VAR]: codes[i + j] } : {}),
        ...(params.storeNames ? { [STORE_NAME_VAR]: params.storeNames.get(r.storeId) || '매장' } : {}),
      } as Record<string, string>,
    }));

    // 2) 발송 기록 선기록 (PROCESSING) — 접수 결과로 갱신
    try {
      await prisma.alimTalkOutbox.createMany({
        data: slice.map((r) => ({
          id: r.outboxId,
          storeId: r.storeId,
          customerId: r.customerId,
          franchiseId,
          phone: r.phone,
          messageType: 'PREMIUM_KAKAO' as const,
          templateId,
          variables: r.variables,
          idempotencyKey: r.outboxId,
          status: 'PROCESSING' as const,
          sentViaGroup: true,
          unitCost: isTest ? 0 : unitCost,
          scheduledAt: scheduledAt ?? null,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      console.error(`[PremiumKakao] campaign=${campaign.id} chunk ${i} insert failed:`, err);
      dropped += slice.length;
      continue;
    }

    // 3) 솔라피 그룹 발송 (청크 = 그룹 1개)
    const result = await sendBrandTemplateGroup({
      templateId,
      recipients: slice.map((r) => ({ phone: r.phone, variables: r.variables })),
      scheduledAt,
      chatBubbleType: type,
    });

    const failed: Array<{ id: string; reason: string }> = [];
    const acceptedIds: string[] = [];
    for (const r of slice) {
      const reason = result.failedPhones.get(normalizePhoneNumber(r.phone)) || (result.groupId ? undefined : result.error || '접수 실패');
      if (reason) failed.push({ id: r.outboxId, reason });
      else acceptedIds.push(r.outboxId);
    }
    for (const f of failed) {
      await prisma.alimTalkOutbox.update({ where: { id: f.id }, data: { status: 'FAILED', failReason: f.reason, updatedAt: new Date() } });
    }

    // 4) 접수된 건만 과금 (테스트는 무료)
    if (acceptedIds.length > 0) {
      await prisma.alimTalkOutbox.updateMany({
        where: { id: { in: acceptedIds } },
        data: { status: 'PENDING', solapiMessageId: result.groupId, billing: billingKind, updatedAt: new Date() },
      });
      const chunkCost = isTest ? 0 : acceptedIds.length * unitCost;
      if (chunkCost > 0) {
        const meta = { type: 'BRAND_MESSAGE', messageType: 'PREMIUM_KAKAO', campaignId: campaign.id, bubbleType: type, count: acceptedIds.length, unitCost, groupId: result.groupId };
        if (payer.kind === 'STORE') {
          await prisma.wallet.update({ where: { storeId: payer.storeId }, data: { balance: { decrement: chunkCost } } });
          await prisma.paymentTransaction.create({
            data: { storeId: payer.storeId, amount: -chunkCost, type: 'ALIMTALK_SEND', status: 'SUCCESS', meta: meta as any },
          });
        } else {
          const wallet = await prisma.franchiseWallet.update({ where: { franchiseId: payer.franchiseId }, data: { balance: { decrement: chunkCost } } });
          await prisma.franchiseTransaction.create({
            data: { walletId: wallet.id, amount: -chunkCost, type: 'ALIMTALK_SEND', description: '프리미엄 카카오톡 발송', meta: meta as any },
          });
        }
        totalCost += chunkCost;
      }
    }
    queued += acceptedIds.length;
    dropped += failed.length;
    console.log(`[PremiumKakao] campaign=${campaign.id} chunk ${i}: group=${result.groupId} accepted=${acceptedIds.length} failed=${failed.length}`);
  }

  const nothingQueued = queued === 0;
  await prisma.premiumKakaoCampaign.update({
    where: { id: campaign.id },
    data: {
      queuedCount: queued,
      failedCount: dropped,
      totalCost,
      ...(nothingQueued ? { status: 'FAILED', completedAt: new Date() } : {}),
    },
  });
  if (marketingCampaignId) await updateMarketingCampaign(marketingCampaignId, { cost: totalCost });
  if (nothingQueued) await deleteBrandTemplate(templateId).catch(() => {});

  return { campaignId: campaign.id, queued, dropped, totalCost };
}

/** 캠페인 목록 한 줄 요약 */
function summaryOf(type: BubbleType, c: PkContent): string {
  const first = (s: string) => s.trim().split('\n')[0];
  const text =
    first(c.content) ||
    c.header.trim() ||
    c.commerce.title.trim() ||
    c.mainItem.title.trim() ||
    c.cards[0]?.header.trim() ||
    c.cards[0]?.commerce.title.trim() ||
    '';
  return `[${SPEC[type].name}] ${text}`.slice(0, 80);
}

/**
 * 결과가 모두 확정된 캠페인을 마감한다 — 성공/실패 집계, 템플릿 삭제.
 * 알림톡 워커 폴링마다 호출 (그룹 결과 확인·환불은 워커가 먼저 끝낸다).
 */
export async function finalizePremiumKakaoCampaigns(limit = 5): Promise<number> {
  const campaigns = await prisma.premiumKakaoCampaign.findMany({
    where: { status: 'SENDING', createdAt: { lt: new Date(Date.now() - 30_000) } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, solapiTemplateId: true },
  });
  let done = 0;
  for (const c of campaigns) {
    const rows = await prisma.alimTalkOutbox.groupBy({
      by: ['status'],
      where: { id: { startsWith: `pk_${c.id}_` } },
      _count: { _all: true },
    });
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    const open = count('PENDING') + count('PROCESSING') + count('RETRY');
    if (open > 0) {
      await prisma.premiumKakaoCampaign.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
      continue;
    }
    await prisma.premiumKakaoCampaign.update({
      where: { id: c.id },
      data: { status: 'COMPLETED', sentCount: count('SENT'), failedCount: count('FAILED'), completedAt: new Date() },
    });
    if (c.solapiTemplateId) {
      await deleteBrandTemplate(c.solapiTemplateId).catch((e) => console.error(`[PremiumKakao] template delete failed ${c.solapiTemplateId}:`, e.message));
    }
    done++;
  }
  return done;
}
