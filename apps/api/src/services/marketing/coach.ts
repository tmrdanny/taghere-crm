// 마케팅 코치 — 성과 숫자와 매장 데이터(방문 시간대, 인기 메뉴, 이탈 위험 고객 수)를 보고
// “다음에 무엇을, 누구에게, 언제, 어떤 문구로 보내면 더 많이 다시 올지”를 추천한다.
// 규칙 기반 분석이다 (외부 AI 호출 없음). 추천마다 근거 숫자를 함께 보여준다.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { listMenusInStores } from '../segment-engine.js';
import { PerformanceResult, WINDOW_DAYS } from './performance.js';

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  evidence?: string;
  action?: { label: string; href: string };
  copyIdeas?: string[];
}

export interface CoachContext {
  topMenus: string[];
  peakHour: number | null;
  peakWeekday: number | null;
  churnRisk: number;
  birthdayThisMonth: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 받침에 맞는 조사 — josa('문자', '이', '가') → '문자가' */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

export async function loadCoachContext(storeIds: string[]): Promise<CoachContext> {
  if (storeIds.length === 0) return { topMenus: [], peakHour: null, peakWeekday: null, churnRisk: 0, birthdayThisMonth: 0 };
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const [menus, hourRows, dayRows, churn, birthday] = await Promise.all([
    listMenusInStores(storeIds, 90, 5).catch(() => []),
    prisma.$queryRaw<Array<{ h: number; cnt: bigint }>>`
      SELECT EXTRACT(HOUR FROM (v."visitedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::int AS h, COUNT(*) AS cnt
      FROM visits_orders v WHERE v."storeId" IN (${Prisma.join(storeIds)}) AND v."visitedAt" > now() - interval '90 days'
      GROUP BY 1 ORDER BY cnt DESC LIMIT 1`,
    prisma.$queryRaw<Array<{ d: number; cnt: bigint }>>`
      SELECT EXTRACT(DOW FROM (v."visitedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::int AS d, COUNT(*) AS cnt
      FROM visits_orders v WHERE v."storeId" IN (${Prisma.join(storeIds)}) AND v."visitedAt" > now() - interval '90 days'
      GROUP BY 1 ORDER BY cnt DESC LIMIT 1`,
    prisma.customer.count({
      where: { storeId: { in: storeIds }, visitCount: { gte: 2 }, lastVisitAt: { lt: new Date(Date.now() - 45 * 86400000) }, consentMarketing: true, phone: { not: null } },
    }),
    prisma.customer.count({ where: { storeId: { in: storeIds }, birthday: { startsWith: month }, consentMarketing: true, phone: { not: null } } }),
  ]);
  return {
    topMenus: menus.map((m) => m.name),
    peakHour: hourRows[0] ? Number(hourRows[0].h) : null,
    peakWeekday: dayRows[0] ? Number(dayRows[0].d) : null,
    churnRisk: churn,
    birthdayThisMonth: birthday,
  };
}

/** 인기 메뉴와 혜택으로 바로 쓸 수 있는 문구 3개 */
function copyIdeas(menu: string, offer: string): string[] {
  return [
    `{고객명}님, 요즘 ${menu} 생각나지 않으세요? 이번 주 안에 오시면 ${offer} 드려요.`,
    `오랜만이에요! ${menu} 그대로 기다리고 있어요. 이 메시지를 보여주시면 ${offer}.`,
    `오늘 저녁 ${menu} 어떠세요? 매장에서 직원에게 쿠폰을 보여주시면 ${offer}.`,
  ];
}

export function buildRecommendations(perf: PerformanceResult, ctx: CoachContext, opts: { base: string; automationHref: string }): Recommendation[] {
  const out: Recommendation[] = [];
  const s = perf.summary;
  const matured = perf.campaigns.filter((c) => !c.maturing);
  const menu = ctx.topMenus[0] || '대표 메뉴';
  const sendHour = ctx.peakHour !== null ? (ctx.peakHour - 2 + 24) % 24 : null;
  const timeTip =
    ctx.peakHour !== null
      ? `손님이 가장 많이 오는 시간은 ${ctx.peakHour}시${ctx.peakWeekday !== null ? `, ${WEEKDAYS[ctx.peakWeekday]}요일` : ''}이에요. 방문 2시간 전인 ${sendHour}시쯤 보내면 “지금 가볼까” 하는 손님이 늘어요.`
      : null;

  // 1) 아직 보낸 캠페인이 없음
  if (perf.campaigns.length === 0) {
    out.push({
      id: 'first-campaign',
      priority: 'high',
      title: ctx.churnRisk > 0 ? `한동안 안 온 단골 ${ctx.churnRisk.toLocaleString()}명에게 먼저 보내 보세요` : '첫 캠페인을 보내 보세요',
      body: '두 번 이상 왔지만 45일 넘게 오지 않은 손님은 쿠폰 하나로 다시 오는 비율이 가장 높아요. 직원 확인 쿠폰을 붙이면 몇 명이 쿠폰을 들고 왔는지 여기서 바로 보여요.',
      action: { label: '메시지 보내기', href: `${opts.base}` },
      copyIdeas: copyIdeas(menu, '음료 1잔 무료'),
    });
  }

  // 2) 측정이 안 되는 캠페인이 많음 (직원 확인 쿠폰 없이 보냄)
  const noCoupon = perf.campaigns.filter((c) => !c.couponEnabled);
  if (perf.campaigns.length >= 2 && noCoupon.length / perf.campaigns.length >= 0.5) {
    out.push({
      id: 'enable-staff-verify',
      priority: 'high',
      title: '직원 확인 쿠폰을 붙여서 보내 보세요',
      body: `최근 캠페인 ${perf.campaigns.length}개 중 ${noCoupon.length}개는 쿠폰이 없어, 메시지를 보고 온 손님인지 알 수 없어요. 직원 확인 쿠폰을 켜면 손님이 쿠폰을 보여줄 때 직원이 “사용 완료”를 눌러 정확히 세어져요.`,
      evidence: `쿠폰 없이 보낸 캠페인 ${noCoupon.length}개`,
    });
  }

  // 3) 쿠폰 사용률이 낮음
  const couponMatured = matured.filter((c) => c.couponEnabled && c.couponIssued >= 30);
  const issued = couponMatured.reduce((a, c) => a + c.couponIssued, 0);
  const used = couponMatured.reduce((a, c) => a + c.couponUsed, 0);
  const useRate = issued > 0 ? (used / issued) * 100 : null;
  if (useRate !== null && useRate < 5) {
    out.push({
      id: 'stronger-offer',
      priority: 'high',
      title: '혜택을 더 눈에 띄게 바꿔 보세요',
      body: '쿠폰을 받고도 쓰러 오는 손님이 적어요. “10% 할인”보다 “음료 1잔 무료”처럼 바로 떠오르는 혜택이, 긴 유효기간보다 “이번 주 일요일까지”처럼 짧은 기한이 더 잘 움직여요. 사진이 들어간 프리미엄 카카오톡(이미지형·커머스형)도 효과가 좋아요.',
      evidence: `쿠폰 사용률 ${useRate.toFixed(1)}% (${used}/${issued}장)`,
      copyIdeas: copyIdeas(menu, `${menu} 1개 무료`),
    });
  }

  // 4) 평소보다 재방문이 늘지 않음 → 대상을 좁히기
  if (s.revisitRate !== null && s.baselineRevisitRate !== null && matured.length > 0 && s.revisitRate <= s.baselineRevisitRate + 1) {
    out.push({
      id: 'narrow-target',
      priority: 'medium',
      title: '전체 고객 대신 다시 올 이유가 있는 손님에게 보내세요',
      body: `메시지를 받은 손님의 재방문율이 평소와 비슷해요. 전체 발송보다 “이탈 위험(2회 이상 방문, 45일 이상 미방문)”이나 “이번 달 생일” 고객 그룹처럼 대상을 좁히면 적은 비용으로 더 많이 돌아와요.`,
      evidence: `메시지 받은 손님 ${s.revisitRate}% · 평소 ${s.baselineRevisitRate}% (${WINDOW_DAYS}일 안 재방문)`,
      action: { label: '고객 그룹 만들기', href: `${opts.base}` },
    });
  }

  // 5) 채널 비교 — 재방문당 비용이 가장 낮은 채널
  const comparable = perf.channels.filter((c) => c.channel !== 'AUTOMATION' && c.recipients >= 50 && c.revisitRate !== null);
  if (comparable.length >= 2) {
    const best = [...comparable].sort((a, b) => (b.revisitRate ?? 0) - (a.revisitRate ?? 0))[0];
    const worst = [...comparable].sort((a, b) => (a.revisitRate ?? 0) - (b.revisitRate ?? 0))[0];
    if (best.channel !== worst.channel && (best.revisitRate ?? 0) - (worst.revisitRate ?? 0) >= 2) {
      out.push({
        id: 'best-channel',
        priority: 'medium',
        title: `${josa(best.label, '이', '가')} 가장 잘 통하고 있어요`,
        body: `${josa(best.label, '을', '를')} 받은 손님이 ${worst.label}보다 더 많이 다시 왔어요. 다음 캠페인은 ${josa(best.label, '으로', '로')} 보내 보세요.`,
        evidence: `${best.label} ${best.revisitRate}% · ${worst.label} ${worst.revisitRate}%${best.costPerRevisit ? ` · 재방문 1명당 ${best.costPerRevisit.toLocaleString()}원` : ''}`,
      });
    }
  }

  // 6) 가장 성과 좋은 캠페인 다시 쓰기
  const top = [...matured].filter((c) => c.recipients >= 20 && (c.revisitRate ?? 0) > 0).sort((a, b) => (b.revisitRate ?? 0) - (a.revisitRate ?? 0))[0];
  if (top) {
    out.push({
      id: 'repeat-best',
      priority: 'low',
      title: '가장 잘된 캠페인을 다른 손님에게도 보내 보세요',
      body: `“${top.title}”는 받은 손님 ${top.revisitRate}%가 ${WINDOW_DAYS}일 안에 다시 왔어요. 같은 문구로 아직 받지 않은 손님에게 보내면 비슷한 효과를 기대할 수 있어요.`,
      evidence: `${top.channelLabel} · ${top.recipients.toLocaleString()}명 중 ${top.revisited.toLocaleString()}명 재방문${top.roi ? ` · ROI ${top.roi}배` : ''}`,
    });
  }

  // 7) 자동 마케팅이 꺼져 있음
  const off = perf.automation.filter((a) => !a.enabled && (a.type === 'BIRTHDAY' || a.type === 'CHURN_PREVENTION'));
  if (off.length > 0) {
    const counts = [
      off.some((a) => a.type === 'CHURN_PREVENTION') && ctx.churnRisk > 0 ? `이탈 위험 ${ctx.churnRisk.toLocaleString()}명` : null,
      off.some((a) => a.type === 'BIRTHDAY') && ctx.birthdayThisMonth > 0 ? `이번 달 생일 ${ctx.birthdayThisMonth.toLocaleString()}명` : null,
    ].filter(Boolean);
    out.push({
      id: 'turn-on-automation',
      priority: counts.length ? 'medium' : 'low',
      title: `${off.map((a) => a.label).join('·')} 자동 마케팅을 켜 두세요`,
      body: '한 번 켜 두면 조건에 맞는 손님에게 알아서 쿠폰이 나가고, 직원 확인으로 사용까지 세어져요. 사장님이 매번 보내지 않아도 돼요.',
      evidence: counts.length ? `지금 대상: ${counts.join(', ')}` : undefined,
      action: { label: '자동 마케팅 켜기', href: opts.automationHref },
    });
  }

  // 8) 보내는 시간
  if (timeTip && perf.campaigns.length > 0) {
    out.push({ id: 'send-time', priority: 'low', title: sendHour !== null ? `${sendHour}시쯤 보내 보세요` : '보내는 시간을 바꿔 보세요', body: timeTip });
  }

  // 9) 문구 추천은 항상 하나 (다른 추천에 문구가 없을 때)
  if (!out.some((r) => r.copyIdeas)) {
    out.push({
      id: 'copy-ideas',
      priority: 'low',
      title: '이런 문구로 보내 보세요',
      body: `최근 90일 가장 많이 팔린 “${menu}”${josa(menu, '을', '를').slice(menu.length)} 앞세우고, 혜택과 기한을 한 문장에 넣으면 반응이 좋아요.`,
      copyIdeas: copyIdeas(menu, '음료 1잔 무료'),
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
}
