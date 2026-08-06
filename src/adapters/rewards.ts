import { AppComponents, IRewardComponent } from '../types'
import { RewardAttributes } from '../logic/referral/types'

/** Thrown when the reward server answered but granted nothing usable. No reward was issued. */
export class RewardIssuanceError extends Error {
  constructor(reason: string) {
    super(`Reward server issued no usable reward: ${reason}`)
    this.name = 'RewardIssuanceError'
  }
}

function isUsableReward(reward: unknown): reward is RewardAttributes {
  return !!reward && typeof (reward as RewardAttributes).image === 'string' && !!(reward as RewardAttributes).image
}

export async function createRewardComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>
): Promise<IRewardComponent> {
  const { fetcher, config, logs } = components
  const logger = logs.getLogger('rewards-component')

  const rewardUrl = new URL(await config.requireString('REWARD_SERVER_URL'))

  /**
   * Requests a reward for a beneficiary.
   *
   * @throws {RewardIssuanceError} When the response carries no reward we can act on. Callers must
   * treat this as "nothing was issued" — every caller dereferences the first element.
   */
  async function sendReward(campaignKey: string, beneficiary: string): Promise<RewardAttributes[]> {
    const url = new URL('/api/rewards', rewardUrl).toString()
    const response = await fetcher.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ campaign_key: campaignKey, beneficiary })
    })

    if (response.ok) {
      const body = await response.json()
      const rewards = body?.data

      // Callers dereference the first element, so an unusable response must throw, not return empty.
      if (!Array.isArray(rewards)) {
        logger.warn('Reward server response did not contain a data array', { beneficiary })
        throw new RewardIssuanceError('response contained no data array')
      }

      if (rewards.length === 0) {
        logger.warn('Reward server returned an empty reward list', { beneficiary })
        throw new RewardIssuanceError('response contained an empty reward list')
      }

      if (!rewards.every(isUsableReward)) {
        logger.warn('Reward server returned a reward without an image', { beneficiary })
        throw new RewardIssuanceError('a returned reward is missing its image')
      }

      return rewards
    }

    // Status only: the upstream body is deliberately not read into errors or logs.
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return {
    sendReward
  }
}
