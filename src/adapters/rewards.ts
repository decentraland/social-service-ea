import { AppComponents, IRewardComponent } from '../types'
import { RewardAttributes } from '../logic/referral/types'

export async function createRewardComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>
): Promise<IRewardComponent> {
  const { fetcher, config, logs } = components
  const logger = logs.getLogger('rewards-component')

  const rewardUrl = new URL(await config.requireString('REWARD_SERVER_URL'))

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
      if (!Array.isArray(rewards)) {
        logger.warn('Reward server response did not contain a data array; returning no rewards', {
          campaignKey,
          beneficiary
        })
        return []
      }
      return rewards
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }

  return {
    sendReward
  }
}
