import { ReferralEmail, ReferralProgress, ReferralProgressStatus } from '../../types/referral-db.type'
import { EthAddress, Events, ReferralInvitedUsersAcceptedEvent, ReferralNewTierReachedEvent, Email } from '@dcl/schemas'
import { CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'
import {
  ReferralNotFoundError,
  ReferralInvalidInputError,
  ReferralAlreadyExistsError,
  ReferralInvalidStatusError,
  SelfReferralError,
  ReferralEmailUpdateTooSoonError
} from './errors'
import type { IReferralComponent, RewardAttributes, SetReferralRewardImageInput } from './types'
import type { AppComponents } from '../../types/system'
import {
  referral100InvitesReachedMessage,
  referralIpMatchRejectionMessage,
  referralSuspiciousTimingMessage
} from '../../utils/slackMessages'
import { fetchJson } from '../../utils/fetch'
import { isDefinitiveNonIssuance } from '../../adapters/rewards'

const TIERS = [5, 10, 20, 25, 30, 50, 60, 75]
const TIERS_IRL_SWAG = 100
const MARKETING_EMAIL = 'marketing@decentraland.org'

function validateAddress(value: string, field: string): string {
  if (!EthAddress.validate(value)) {
    throw new ReferralInvalidInputError(`Invalid ${field} address`)
  }
  return value.toLowerCase()
}

export async function createReferralComponent(
  components: Pick<AppComponents, 'referralDb' | 'logs' | 'sns' | 'config' | 'rewards' | 'email' | 'slack' | 'redis'>
): Promise<IReferralComponent> {
  const { referralDb, logs, sns, config, rewards, email: emailComponent, slack, redis } = components

  const logger = logs.getLogger('referral-component')

  const [
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60,
    REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75,
    PROFILE_URL,
    ENV,
    REFERRAL_METABASE_DASHBOARD,
    REFERRAL_MAX_IP_MATCHES,
    REFERRAL_MIN_LOGIN_DAYS,
    REFERRAL_FIVE_MINUTES_IN_MS
  ] = await Promise.all([
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75'),
    config.requireString('PROFILE_URL'),
    config.requireString('ENV'),
    config.requireString('REFERRAL_METABASE_DASHBOARD'),
    config.requireNumber('REFERRAL_MAX_IP_MATCHES'),
    config.requireNumber('REFERRAL_MIN_LOGIN_DAYS'),
    config.requireNumber('REFERRAL_FIVE_MINUTES_IN_MS')
  ])

  const isDev = ENV === 'dev'

  // Bounds retries of a tier whose issuance keeps failing, and how long one worker's claim
  // blocks a competing worker from issuing the same tier.
  const rewardMaxAttempts = (await config.getNumber('REFERRAL_REWARD_MAX_ATTEMPTS')) ?? 5
  const rewardClaimLeaseMs = (await config.getNumber('REFERRAL_REWARD_CLAIM_LEASE_MS')) ?? 5 * 60 * 1000

  const rewardKeys = {
    5: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5,
    10: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10,
    20: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20,
    25: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25,
    30: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30,
    50: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50,
    60: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60,
    75: REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75
  }

  function createReferralInvitedUsersAcceptedEvent(
    referrer: string,
    invitedUser: string,
    totalInvitedUsers: number
  ): ReferralInvitedUsersAcceptedEvent {
    return {
      type: Events.Type.REFERRAL,
      subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED,
      key: `${Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED}-${referrer}-${invitedUser}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        address: referrer,
        title: 'Referral Completed!',
        description: `Your friend jumped into Decentraland, so you're closer to unlocking your next reward!`,
        tier: TIERS.findIndex((tier) => totalInvitedUsers <= tier) + 1,
        url: `${PROFILE_URL}/accounts/${referrer}/referral`,
        image: 'https://assets-cdn.decentraland.org/referral/referral-invited-user-accepted-icon.png',
        invitedUserAddress: invitedUser,
        invitedUsers: totalInvitedUsers,
        rarity: null
      }
    }
  }

  // `tierInvites` is the tier boundary being granted, not the live invite count: a count that
  // skipped past the boundary must still announce the tier it actually unlocked.
  function createReferralNewTierReachedEvent(
    referrer: string,
    invitedUser: string,
    tierInvites: number,
    reward: RewardAttributes
  ): ReferralNewTierReachedEvent {
    return {
      type: Events.Type.REFERRAL,
      subType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED,
      key: `${Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED}-${referrer}-${invitedUser}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        address: referrer,
        title: 'Referral Reward Unlocked!',
        description: `Check the 'Referral Rewards' tab in your web profile to see your prize!`,
        tier: TIERS.findIndex((tier) => tierInvites <= tier) + 1,
        url: `${PROFILE_URL}/accounts/${referrer}/referral`,
        image: reward.image,
        invitedUserAddress: invitedUser,
        invitedUsers: tierInvites,
        rarity: reward.rarity!
      }
    }
  }

  async function fetchDenyList(): Promise<Set<string>> {
    try {
      const data = await fetchJson<{ users?: { wallet: string }[] }>(
        () => fetch('https://config.decentraland.org/denylist.json'),
        (r) => new Error(`Failed to fetch deny list, status: ${r.status}`)
      )
      if (data.users && Array.isArray(data.users)) {
        return new Set(data.users.map((user: { wallet: string }) => user.wallet.toLocaleLowerCase()))
      } else {
        logger.warn('Deny list is missing "users" field or it is not an array.')
        return new Set()
      }
    } catch (error) {
      logger.error(`Error fetching deny list: ${(error as Error).message}`)
      return new Set()
    }
  }

  async function assertReferrerNotBanned(referrer: string, ip: string | null | undefined): Promise<void> {
    const denyList = await fetchDenyList()
    const context = ip !== null && ip !== undefined ? `${referrer}, ${ip}` : referrer

    if (denyList.has(referrer.toLowerCase())) {
      throw new ReferralInvalidInputError(`Referrer is on the deny list ${context}`)
    }

    const referrerAsInvitedRecords = await referralDb.findReferralProgress({ invitedUser: referrer, limit: 1 })
    if (referrerAsInvitedRecords.length > 0) {
      const originalReferrer = referrerAsInvitedRecords[0].referrer
      if (denyList.has(originalReferrer.toLowerCase())) {
        throw new ReferralInvalidInputError(`Referrer is part of a banned referral chain ${context}`)
      }
    }
  }

  /**
   * Issues the reward for one crossed tier, at most once ever.
   *
   * The claim is taken before the reward server is called and is only closed after a confirmed
   * success, fenced on the claim's token. A failure that proves nothing was issued leaves the
   * tier claimable by a later event; a failure whose outcome is unknown parks the grant for a
   * human instead, because the reward API has no idempotency key and a blind retry would be
   * how a second reward gets issued.
   */
  async function grantTierReward(referrer: string, invitedUser: string, tier: number): Promise<void> {
    const claim = await referralDb.claimTierReward(referrer, tier, {
      maxAttempts: rewardMaxAttempts,
      leaseMs: rewardClaimLeaseMs
    })

    if (!claim) return

    let rewardsSent: RewardAttributes[]
    try {
      rewardsSent = await rewards.sendReward(rewardKeys[tier as keyof typeof rewardKeys], referrer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (!isDefinitiveNonIssuance(error)) {
        logger.error(
          'MANUAL REVIEW REQUIRED: tier reward issuance ended with an unknown outcome, so the reward may already exist upstream. The grant is parked and will not be retried until a human reconciles it with the reward provider',
          { referrer, tier, attempts: claim.attempts, error: message }
        )
        await parkForManualReviewBestEffort(referrer, tier, claim.claim_token, message)
        return
      }

      // Proven not issued, so the tier must stay claimable for a later event.
      logger.error('Failed to issue tier reward; nothing was issued, so it stays claimable for a later event', {
        referrer,
        tier,
        attempts: claim.attempts,
        error: message
      })
      await recordFailureBestEffort(referrer, tier, claim.claim_token, message)
      return
    }

    // Only a successful call returning zero rows proves the claim is no longer ours. A throw
    // leaves it unknown, and the reward is already issued, so that path still announces.
    let closedByAnotherWorker = false
    try {
      // The reward exists now. Closing the grant is mandatory: a row left pending is re-claimed
      // once the lease expires, and the tier would be issued again.
      closedByAnotherWorker = (await referralDb.markTierRewardGranted(referrer, tier, claim.claim_token)) === 0
    } catch (error) {
      // The reward exists but the row may still be pending, which the next lease expiry would
      // turn into a second issuance. Park it instead. The park is fenced on the same token, so
      // it matches nothing if the close actually landed.
      const message = error instanceof Error ? error.message : String(error)
      logger.error(
        'MANUAL REVIEW REQUIRED: tier reward was issued but the grant could not be closed; parking it so a later event cannot re-issue it',
        { referrer, tier, error: message }
      )
      await parkForManualReviewBestEffort(referrer, tier, claim.claim_token, `issued but not closed: ${message}`)
    }

    if (closedByAnotherWorker) {
      // Either the grant was already closed, or this worker's lease expired and another worker
      // re-claimed the tier — in which case both workers called the reward server.
      logger.error(
        'MANUAL REVIEW REQUIRED: tier reward was issued but the claim is no longer ours, so a duplicate reward may exist. Skipping notifications',
        { referrer, tier, attempts: claim.attempts }
      )
      return
    }

    // Everything below is best-effort and can never make the tier retryable.
    const reward = rewardsSent[0]
    if (!reward) return

    await Promise.all([
      publishBestEffort(createReferralNewTierReachedEvent(referrer, invitedUser, tier, reward)),
      setRewardImageBestEffort(referrer, reward.image, tier)
    ])
  }

  /** Recording why an attempt failed must never abort the remaining tiers. */
  async function recordFailureBestEffort(referrer: string, tier: number, claimToken: string, reason: string) {
    try {
      await referralDb.recordTierRewardFailure(referrer, tier, claimToken, reason)
    } catch (error) {
      logger.error('Failed to record a tier reward failure', {
        referrer,
        tier,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Parks a grant whose issuance outcome is unknown, so no later event can retry it.
   *
   * Best-effort like the rest of the bookkeeping, but a failure here is the worst case: the
   * grant stays pending and becomes claimable again, so it is logged for alerting.
   */
  async function parkForManualReviewBestEffort(referrer: string, tier: number, claimToken: string, reason: string) {
    try {
      const parked = await referralDb.markTierRewardNeedsManualReview(referrer, tier, claimToken, reason)
      if (parked === 0) {
        logger.error('MANUAL REVIEW REQUIRED: could not park a tier reward grant because the claim is no longer ours', {
          referrer,
          tier
        })
      }
    } catch (error) {
      logger.error(
        'MANUAL REVIEW REQUIRED: failed to park a tier reward grant with an unknown outcome; it stays claimable and may be issued twice',
        {
          referrer,
          tier,
          error: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /** Notifies the IRL-swag milestone once, using the same claim guard as the reward tiers. */
  async function grantIrlSwagTier(referrer: string): Promise<void> {
    const claim = await referralDb.claimTierReward(referrer, TIERS_IRL_SWAG, {
      maxAttempts: rewardMaxAttempts,
      leaseMs: rewardClaimLeaseMs
    })

    if (!claim) return

    try {
      await slack.sendMessage(referral100InvitesReachedMessage(referrer, isDev, REFERRAL_METABASE_DASHBOARD))
    } catch (error) {
      // Deliberately stays retryable even though a Slack failure is as ambiguous as a reward
      // one: a duplicate ping costs nothing, so here the trade runs the other way.
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('Failed to send the IRL swag Slack notification; it stays claimable', { referrer, error: message })
      await recordFailureBestEffort(referrer, TIERS_IRL_SWAG, claim.claim_token, message)
      return
    }

    // Closed in its own block: leaving the row pending after a sent notification re-sends it.
    try {
      await referralDb.markTierRewardGranted(referrer, TIERS_IRL_SWAG, claim.claim_token)
    } catch (error) {
      logger.error('IRL swag notification was sent but the grant could not be closed', {
        referrer,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Grants every tier the referrer has reached but not yet been granted.
   *
   * Uses `<=` against the accepted-invite count rather than exact equality, so a count that
   * jumps past a boundary under concurrency still grants the skipped tier on this or a later event.
   */
  async function grantReachedTiers(referrer: string, invitedUser: string, acceptedInvites: number): Promise<void> {
    for (const tier of TIERS.filter((tier) => tier <= acceptedInvites)) {
      await grantTierReward(referrer, invitedUser, tier)
    }

    if (acceptedInvites >= TIERS_IRL_SWAG) {
      await grantIrlSwagTier(referrer)
    }
  }

  /** Notifications are best-effort: a failure must not abort or re-run the money path. */
  async function publishBestEffort(event: ReferralInvitedUsersAcceptedEvent | ReferralNewTierReachedEvent) {
    try {
      await sns.publishMessage(event)
    } catch (error) {
      logger.warn('Failed to publish referral event', {
        subType: event.subType,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function setRewardImageBestEffort(referrer: string, rewardImageUrl: string, tier: number) {
    try {
      await referralDb.setReferralRewardImage({ referrer, rewardImageUrl, tier })
    } catch (error) {
      logger.warn('Failed to store referral reward image', {
        referrer,
        tier,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    create: async (referralInput: CreateReferralWithInvitedUser) => {
      const referrer = validateAddress(referralInput.referrer, 'referrer')
      const invitedUser = validateAddress(referralInput.invitedUser, 'invitedUser')
      const invitedUserIP = referralInput.invitedUserIP

      if (referrer === invitedUser) {
        throw new SelfReferralError(invitedUser)
      }

      // Decides what an already-existing referral for this invited user means. A create with
      // the SAME referrer is a safe no-op (returns the existing record → 204), which makes the
      // client retry-safe: a dropped response, a re-registration during onboarding, or the web
      // setup flow having already recorded it all converge without error. A DIFFERENT referrer
      // is a genuine conflict (first-wins attribution) and is rejected.
      const resolveExistingReferral = async (): Promise<ReferralProgress> => {
        const existing = await referralDb.findReferralProgress({ invitedUser })
        if (existing.length > 0 && existing[0].referrer.toLowerCase() === referrer) {
          logger.info('Referral already exists with the same referrer; treating create as idempotent', {
            referrer,
            invitedUser
          })
          return existing[0]
        }
        throw new ReferralAlreadyExistsError(invitedUser)
      }

      const referralExists = await referralDb.hasReferralProgress(invitedUser)
      if (referralExists) {
        return resolveExistingReferral()
      }

      logger.info('Creating referral', {
        referrer,
        invitedUser,
        invitedUserIP
      })

      await assertReferrerNotBanned(referrer, invitedUserIP)

      const referral = await referralDb.createReferral({ referrer, invitedUser, invitedUserIP })

      // The check above and this insert are not a single transaction, so two concurrent creates
      // can both reach here. The unique index on invited_user rejects the loser's insert, which
      // comes back as null — resolve it the same way as a pre-detected existing referral instead
      // of writing a second, contradictory attribution.
      if (!referral) {
        logger.info('Concurrent create lost the insert race; resolving against the stored referral', {
          referrer,
          invitedUser
        })
        return resolveExistingReferral()
      }

      const recentInvitations = await referralDb.findReferralProgress({
        referrer,
        limit: 2
      })

      if (recentInvitations.length >= 2) {
        const newestCreatedAt = Number(recentInvitations[0].created_at)
        const previousCreatedAt = Number(recentInvitations[1].created_at)
        const timeDifference = newestCreatedAt - previousCreatedAt

        if (timeDifference < REFERRAL_FIVE_MINUTES_IN_MS) {
          const timeDifferenceMins = Math.round((timeDifference / (1000 * 60)) * 100) / 100 // Round to 2 decimal places
          const newInvitationTime = new Date(newestCreatedAt).toISOString()
          const previousInvitationTime = new Date(previousCreatedAt).toISOString()

          try {
            await slack.sendMessage(
              referralSuspiciousTimingMessage(
                referrer,
                newestCreatedAt.toString(),
                previousCreatedAt.toString(),
                timeDifferenceMins,
                newInvitationTime,
                previousInvitationTime,
                isDev,
                REFERRAL_METABASE_DASHBOARD
              )
            )
          } catch (error) {
            logger.warn('Failed to send suspicious timing Slack notification', {
              referrer,
              newestCreatedAt,
              previousCreatedAt,
              timeDifferenceMins,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      }

      if (referral.status === ReferralProgressStatus.REJECTED_IP_MATCH) {
        try {
          await slack.sendMessage(
            referralIpMatchRejectionMessage(
              referrer,
              invitedUser,
              invitedUserIP,
              isDev,
              REFERRAL_METABASE_DASHBOARD,
              REFERRAL_MAX_IP_MATCHES
            )
          )
        } catch (error) {
          logger.warn('Failed to send IP rejection Slack notification', {
            invitedUser,
            referrer,
            invitedUserIP,
            error: error instanceof Error ? error.message : String(error)
          })
        }

        throw new ReferralInvalidInputError(
          `Invited user has already reached the maximum number of ${REFERRAL_MAX_IP_MATCHES} referrals from the same IP: ${invitedUserIP}`
        )
      }

      logger.info(`Referral from ${referrer} to ${invitedUser} created successfully`)

      return referral
    },

    updateProgress: async (
      invitedUserToUpdate: string,
      status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
    ) => {
      const invitedUser = validateAddress(invitedUserToUpdate, 'invitedUser')

      const progress = await referralDb.findReferralProgress({ invitedUser })

      if (!progress.length) {
        throw new ReferralNotFoundError(invitedUser)
      }

      await assertReferrerNotBanned(progress[0].referrer, progress[0].invited_user_ip)

      const currentStatus = progress[0].status
      if (currentStatus !== ReferralProgressStatus.PENDING) {
        throw new ReferralInvalidStatusError(currentStatus, ReferralProgressStatus.PENDING)
      }

      logger.info('Updating referral progress', {
        invitedUser,
        status
      })

      await referralDb.updateReferralProgress(invitedUser, status)

      logger.info('Referral progress updated successfully', {
        invitedUser,
        status
      })
    },

    finalizeReferral: async (invitedUserToFinalize: string) => {
      const invitedUser = validateAddress(invitedUserToFinalize, 'invitedUser')

      const progress = await referralDb.findReferralProgress({ invitedUser })

      if (!progress.length) {
        return
      }

      await assertReferrerNotBanned(progress[0].referrer, progress[0].invited_user_ip)

      if (
        progress[0].status === ReferralProgressStatus.TIER_GRANTED ||
        progress[0].status === ReferralProgressStatus.REJECTED_IP_MATCH
      ) {
        logger.info('Avoiding finalizing referral', {
          invitedUser,
          status: progress[0].status,
          invitedUserIP: progress[0].invited_user_ip || 'N/A',
          referrer: progress[0].referrer
        })
        return
      }

      const { status: currentStatus, referrer } = progress[0]

      const cacheKey = `referral:invited-user:${invitedUser}`
      const cachedInvitedUserLogins: string[] = (await redis.get(cacheKey)) || []

      if (cachedInvitedUserLogins.length < REFERRAL_MIN_LOGIN_DAYS) {
        const loginDays = new Set(cachedInvitedUserLogins)
        loginDays.add(new Date().toISOString().split('T')[0])
        await redis.put(cacheKey, Array.from(loginDays), { noTTL: true })
        logger.info(`User must have logged in at least ${REFERRAL_MIN_LOGIN_DAYS} days`, {
          invitedUser,
          referrer,
          cachedInvitedUserLogins: JSON.stringify(cachedInvitedUserLogins)
        })
        return
      }

      // Clear the login-days cache promptly (Redis rejects a 0 TTL, so use a minimal positive one).
      await redis.put(cacheKey, [], { EX: 1 })

      logger.info('Finalizing referral', {
        invitedUser,
        previousStatus: currentStatus,
        newStatus: ReferralProgressStatus.TIER_GRANTED
      })

      const granted = await referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)

      // If no row transitioned, another concurrent finalize already granted this
      // referral. Stop here to avoid sending the referrer a duplicate reward.
      if (!granted) {
        logger.info('Referral already finalized by a concurrent request, skipping reward', {
          invitedUser,
          referrer
        })
        return
      }

      const acceptedInvites = await referralDb.countAcceptedInvitesByReferrer(referrer)

      await publishBestEffort(createReferralInvitedUsersAcceptedEvent(referrer, invitedUser, acceptedInvites))

      await grantReachedTiers(referrer, invitedUser, acceptedInvites)

      logger.info('Referral finalized successfully', {
        invitedUser,
        status: ReferralProgressStatus.TIER_GRANTED
      })
    },

    getInvitedUsersAcceptedStats: async (referrer: string) => {
      const ref = validateAddress(referrer, 'referrer')
      logger.info('Getting invited users accepted stats', { referrer: ref })

      const [invitedUsersAccepted, invitedUsersAcceptedViewed, referralRewardImage] = await Promise.all([
        referralDb.countAcceptedInvitesByReferrer(ref),
        referralDb.getLastViewedProgressByReferrer(ref),
        referralDb.getReferralRewardImage(ref)
      ])

      await referralDb.setLastViewedProgressByReferrer(ref, invitedUsersAccepted)

      logger.info('Invited users accepted stats retrieved successfully', {
        referrer: ref,
        invitedUsersAccepted,
        invitedUsersAcceptedViewed
      })

      const rewardImages =
        referralRewardImage?.map((image) => ({
          tier: image.tier,
          url: image.reward_image_url
        })) || []

      return {
        invitedUsersAccepted,
        invitedUsersAcceptedViewed,
        rewardImages
      }
    },

    setReferralEmail: async (referralEmailInput: Pick<ReferralEmail, 'referrer' | 'email'>) => {
      const referrer = validateAddress(referralEmailInput.referrer, 'referrer')

      const denyList = await fetchDenyList()

      if (denyList.has(referrer.toLowerCase())) {
        throw new ReferralInvalidInputError(`Referrer is on the deny list ${referrer.toLowerCase()}`)
      }

      const acceptedInvites = await referralDb.countAcceptedInvitesByReferrer(referrer)

      if (acceptedInvites < TIERS_IRL_SWAG) {
        throw new ReferralInvalidInputError(`You must have at least ${TIERS_IRL_SWAG} accepted invites to set an email`)
      }

      if (!referralEmailInput.email || !referralEmailInput.email.trim()) {
        throw new ReferralInvalidInputError('Email is required')
      }

      const email = referralEmailInput.email.trim().toLowerCase()

      // Security validations
      if (email.length > 254) {
        throw new ReferralInvalidInputError('Email is too long')
      }

      // Check for dangerous characters that could be used in XSS attacks
      const dangerousChars = /<|>|"|'|`|&|;|\(|\)|{|}|\[|\]|\\|script|javascript|vbscript|onload|onerror|onclick/i
      if (dangerousChars.test(email)) {
        throw new ReferralInvalidInputError('Email contains invalid characters')
      }

      // Email format validation using Email.validate()
      if (!Email.validate(email)) {
        throw new ReferralInvalidInputError('Invalid email format')
      }

      // Check if user has updated email in the last 24 hours
      const lastEmailRecord = await referralDb.getLastReferralEmailByReferrer(referrer)
      if (lastEmailRecord) {
        const now = Date.now()
        const lastUpdate = lastEmailRecord.updated_at
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

        if (now - lastUpdate < twentyFourHoursInMs) {
          throw new ReferralEmailUpdateTooSoonError(referrer)
        }
      }

      logger.info('Setting referral email', {
        referrer
      })

      const referralEmail = await referralDb.setReferralEmail({ referrer, email })

      logger.info('Referral email set successfully', {
        referrer
      })

      try {
        await emailComponent.sendEmail(
          MARKETING_EMAIL,
          '[Action Needed] IRL Swag Referral Tier Unlocked',
          `A user has unlocked the IRL Swag Referral Tier and provided the following email for contact: ${email}`
        )
        logger.info('Marketing email sent successfully', {
          referrer
        })
      } catch (error) {
        logger.warn('Failed to send marketing email, but referral email was saved', {
          referrer,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      return referralEmail
    },

    setReferralRewardImage: async (referralRewardImageInput: SetReferralRewardImageInput) => {
      const referrer = validateAddress(referralRewardImageInput.referrer, 'referrer')

      if (!referralRewardImageInput.rewardImageUrl || !referralRewardImageInput.rewardImageUrl.trim()) {
        throw new ReferralInvalidInputError('Reward image URL is required')
      }

      const rewardImageUrl = referralRewardImageInput.rewardImageUrl.trim()
      const urlRegex = /^https?:\/\/.+/
      if (!urlRegex.test(rewardImageUrl)) {
        throw new ReferralInvalidInputError('Invalid reward image URL format')
      }

      if (!Number.isInteger(referralRewardImageInput.tier) || referralRewardImageInput.tier <= 0) {
        throw new ReferralInvalidInputError('Tier must be a positive integer')
      }

      logger.info('Setting referral reward image', {
        referrer,
        rewardImageUrl,
        tier: referralRewardImageInput.tier
      })

      const referralRewardImage = await referralDb.setReferralRewardImage({
        referrer,
        rewardImageUrl,
        tier: referralRewardImageInput.tier
      })

      logger.info('Referral reward image set successfully', {
        referrer,
        rewardImageUrl,
        tier: referralRewardImageInput.tier
      })

      return referralRewardImage
    }
  }
}
