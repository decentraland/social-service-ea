import { AppComponents, IRewardComponent } from '../types'
import { RewardAttributes } from '../logic/referral/types'

export async function createRewardComponent(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IRewardComponent> {
  const { fetcher, config } = components

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
      const { data: rewards } = await response.json()
      return rewards
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }

  return {
    sendReward
  }
}
