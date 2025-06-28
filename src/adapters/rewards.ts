import { AppComponents, IRewardComponent } from '../types'
import { RewardAttributes } from '../logic/referral/types'

export function createRewardComponent(components: Pick<AppComponents, 'fetcher' | 'config'>): IRewardComponent {
  const { fetcher, config } = components

  const fetchJson = async (baseURL: URL, path: string, body: { campaign_key: string; beneficiary: string }) => {
    let url = baseURL.toString()
    if (!url.endsWith('/')) {
      url += '/'
    }
    url += path
    const response = await fetcher.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (response.ok === true) {
      return response.json()
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }

  async function sendReward(
    campaignKey: string,
    beneficiary: string
  ): Promise<{ ok: boolean; data: RewardAttributes[] }> {
    const rewardUrl = new URL(await config.requireString('REWARD_SERVER_URL'))
    return fetchJson(rewardUrl, 'rewards', { campaign_key: campaignKey, beneficiary })
  }

  return {
    sendReward
  }
}
