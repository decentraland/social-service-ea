import { AppComponents, IRewardComponent } from '../types'
import { RewardAttributes } from '../logic/referral/types'
import { discardResponseBody } from '../utils/fetch'

/** Thrown when the reward server answered but granted nothing usable. No reward was issued. */
export class RewardIssuanceError extends Error {
  constructor(reason: string) {
    super(`Reward server issued no usable reward: ${reason}`)
    this.name = 'RewardIssuanceError'
  }
}

/** Thrown when the reward server answered with a non-ok status. Carries the status so callers can classify it. */
export class RewardRequestFailedError extends Error {
  constructor(
    readonly status: number,
    url: string
  ) {
    super(`Failed to fetch ${url}: ${status}`)
    this.name = 'RewardRequestFailedError'
  }
}

/**
 * Whether a `sendReward` rejection proves that no reward was created.
 *
 * The reward API has no idempotency key and no way to ask after the fact, so a retry is only
 * safe when the failure itself rules out a side effect. Exactly two do: the server answered
 * and the answer was unusable ({@link RewardIssuanceError}), or the server refused the request
 * with a 4xx ({@link RewardRequestFailedError}).
 *
 * Everything else is unknown and must NOT be retried. That includes a 5xx (the reward can be
 * created before the handler fails) and every transport failure, which is what the injected
 * fetcher throws: `@dcl/fetch-component` turns a timeout or an abort into a bare
 * `Error('Request aborted (timed out)')` and rethrows undici's `TypeError: fetch failed` for
 * DNS/connection-reset/socket-hangup — none of which say whether the request reached the
 * server. Any unexpected throw lands here too, which is the safe default: treating "unknown"
 * as "not issued" is what turns one reward into two.
 */
export function isDefinitiveNonIssuance(error: unknown): boolean {
  if (error instanceof RewardIssuanceError) return true
  return error instanceof RewardRequestFailedError && error.status >= 400 && error.status < 500
}

function isUsableReward(reward: unknown): reward is RewardAttributes {
  return !!reward && typeof (reward as RewardAttributes).image === 'string' && !!(reward as RewardAttributes).image
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export async function createRewardComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>
): Promise<IRewardComponent> {
  const { fetcher, config, logs } = components
  const logger = logs.getLogger('rewards-component')

  const rewardUrl = new URL(await config.requireString('REWARD_SERVER_URL'))

  const requestTimeoutMs = (await config.getNumber('REWARD_REQUEST_TIMEOUT_MS')) ?? DEFAULT_REQUEST_TIMEOUT_MS

  /**
   * Requests a reward for a beneficiary.
   *
   * Never runs longer than {@link IRewardComponent.requestTimeoutMs}, so a caller holding a
   * time-bounded claim can guarantee the call finishes while the claim is still its own.
   *
   * @throws {RewardIssuanceError} When the response carries no reward we can act on. Callers must
   * treat this as "nothing was issued" — every caller dereferences the first element.
   * @throws {RewardRequestFailedError} When the server answered with a non-ok status.
   * @throws {Error} Whatever the fetcher throws on a transport failure (timeout, abort, network).
   * Callers must classify with {@link isDefinitiveNonIssuance} before retrying: only a definitive
   * non-issuance is safe to retry.
   */
  async function sendReward(campaignKey: string, beneficiary: string): Promise<RewardAttributes[]> {
    const url = new URL('/api/rewards', rewardUrl).toString()

    // The fetcher's own timeout stops applying once the headers land, so a trickled body would
    // leave the call unbounded. This controller spans the body read too, which is what makes
    // the total duration something a caller can hold a claim against.
    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), requestTimeoutMs)

    try {
      const response = await fetcher.fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ campaign_key: campaignKey, beneficiary }),
        abortController
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

      // Status only: the upstream body is deliberately not read into errors or logs, but it still
      // has to be released or the keep-alive socket stays pinned.
      await discardResponseBody(response)
      throw new RewardRequestFailedError(response.status, url)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    sendReward,
    requestTimeoutMs
  }
}
