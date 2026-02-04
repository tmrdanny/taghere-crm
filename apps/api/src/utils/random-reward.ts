export interface RewardOption {
  description: string;
  probability: number; // 퍼센트 (합계 100)
}

export interface MilestoneResult {
  tier: number;
  reward: string;
}

const REWARD_TIERS = [5, 10, 15, 20, 25, 30] as const;

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
 * 마일스톤 도달 여부 확인 및 보상 추첨
 */
export function checkMilestoneAndDraw(
  previousStamps: number,
  newStamps: number,
  stampSetting: Record<string, any>,
): MilestoneResult | null {
  for (const tier of REWARD_TIERS) {
    if (previousStamps < tier && newStamps >= tier) {
      const optionsKey = `reward${tier}Options`;
      const descKey = `reward${tier}Description`;

      const options = stampSetting[optionsKey] as RewardOption[] | null;

      if (options && Array.isArray(options) && options.length > 0) {
        return { tier, reward: selectRandomReward(options) };
      }

      // 기존 단일 보상 설명 폴백
      const desc = stampSetting[descKey] as string | null;
      if (desc) {
        return { tier, reward: desc };
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
