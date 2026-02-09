export interface RewardOption {
  description: string;
  probability: number; // 퍼센트 (합계 100)
}

export interface RewardEntry {
  tier: number;
  description: string;
  options: RewardOption[] | null;
}

export interface MilestoneResult {
  tier: number;
  reward: string;
}

export const LEGACY_TIERS = [5, 10, 15, 20, 25, 30] as const;

/**
 * 확률 기반 랜덤 보상 선택
 */
export function selectRandomReward(options: RewardOption[]): string {
  if (!options || options.length === 0) return '';
  if (options.length === 1) return options[0].description;

  const random = Math.random() * 100;
  let cumulative = 0;

  for (const option of options) {
    cumulative += option.probability;
    if (random <= cumulative) {
      return option.description;
    }
  }

  // 부동소수점 오차 방지를 위한 폴백
  return options[options.length - 1].description;
}

/**
 * 레거시 컬럼(reward5Description 등)에서 rewards JSON 배열로 변환
 */
export function buildRewardsFromLegacy(stampSetting: Record<string, any>): RewardEntry[] {
  const rewards: RewardEntry[] = [];
  for (const tier of LEGACY_TIERS) {
    const desc = stampSetting[`reward${tier}Description`] as string | null;
    const opts = stampSetting[`reward${tier}Options`] as RewardOption[] | null;
    if (desc || (opts && Array.isArray(opts) && opts.length > 0)) {
      rewards.push({
        tier,
        description: desc || (opts && opts[0]?.description) || '',
        options: (opts && Array.isArray(opts) && opts.length > 0) ? opts : null,
      });
    }
  }
  return rewards;
}

/**
 * rewards JSON에서 레거시 컬럼 데이터 생성 (5/10/15/20/25/30 티어만)
 */
export function buildLegacyFromRewards(rewards: RewardEntry[]): Record<string, any> {
  const data: Record<string, any> = {};
  // 모든 레거시 컬럼을 null로 초기화
  for (const tier of LEGACY_TIERS) {
    data[`reward${tier}Description`] = null;
    data[`reward${tier}Options`] = null;
  }
  // rewards에서 레거시 티어에 해당하는 것만 채움
  for (const entry of rewards) {
    if (LEGACY_TIERS.includes(entry.tier as any)) {
      data[`reward${entry.tier}Description`] = entry.description || null;
      data[`reward${entry.tier}Options`] = entry.options || null;
    }
  }
  return data;
}

/**
 * 마일스톤 도달 여부 확인 및 보상 추첨 (rewards JSON 기반)
 */
export function checkMilestoneAndDraw(
  previousStamps: number,
  newStamps: number,
  stampSetting: Record<string, any>,
): MilestoneResult | null {
  // rewards JSON이 있으면 그걸 사용, 없으면 레거시 컬럼에서 빌드
  const rewards: RewardEntry[] = stampSetting.rewards
    ? (stampSetting.rewards as RewardEntry[])
    : buildRewardsFromLegacy(stampSetting);

  // tier 오름차순 정렬
  const sorted = [...rewards].sort((a, b) => a.tier - b.tier);

  for (const entry of sorted) {
    if (previousStamps < entry.tier && newStamps >= entry.tier) {
      if (entry.options && Array.isArray(entry.options) && entry.options.length > 0) {
        return { tier: entry.tier, reward: selectRandomReward(entry.options) };
      }
      if (entry.description) {
        return { tier: entry.tier, reward: entry.description };
      }
    }
  }

  return null;
}

/**
 * 보상 옵션 유효성 검증
 */
export function validateRewardOptions(
  options: any[],
): { valid: boolean; error?: string } {
  if (!Array.isArray(options))
    return { valid: false, error: '옵션은 배열이어야 합니다.' };
  if (options.length === 0) return { valid: true };

  for (const opt of options) {
    if (
      !opt.description ||
      typeof opt.description !== 'string' ||
      opt.description.trim() === ''
    ) {
      return { valid: false, error: '각 옵션에 보상 설명을 입력해주세요.' };
    }
    if (typeof opt.probability !== 'number' || opt.probability <= 0) {
      return {
        valid: false,
        error: '확률은 0보다 큰 숫자여야 합니다.',
      };
    }
  }

  const totalProb = options.reduce(
    (sum: number, opt: any) => sum + opt.probability,
    0,
  );
  if (Math.abs(totalProb - 100) > 0.1) {
    return {
      valid: false,
      error: `확률의 합이 100%가 되어야 합니다. (현재: ${totalProb.toFixed(1)}%)`,
    };
  }

  return { valid: true };
}

/**
 * rewards 배열 유효성 검증
 */
export function validateRewards(
  rewards: any[],
): { valid: boolean; error?: string } {
  if (!Array.isArray(rewards))
    return { valid: false, error: '보상 설정은 배열이어야 합니다.' };

  for (const entry of rewards) {
    if (typeof entry.tier !== 'number' || entry.tier < 1 || entry.tier > 50) {
      return { valid: false, error: '티어는 1~50 사이의 숫자여야 합니다.' };
    }
    if (!entry.description || typeof entry.description !== 'string' || !entry.description.trim()) {
      return { valid: false, error: `${entry.tier}개 보상에 설명을 입력해주세요.` };
    }
    if (entry.options && Array.isArray(entry.options) && entry.options.length > 0) {
      const validation = validateRewardOptions(entry.options);
      if (!validation.valid) {
        return { valid: false, error: `${entry.tier}개 보상: ${validation.error}` };
      }
    }
  }

  // 중복 티어 확인
  const tiers = rewards.map(r => r.tier);
  const uniqueTiers = new Set(tiers);
  if (tiers.length !== uniqueTiers.size) {
    return { valid: false, error: '중복된 티어가 있습니다.' };
  }

  return { valid: true };
}
