import { ReferralEmail, ReferralProgressStatus } from '../../types/referral-db.type'
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
import { referral100InvitesReachedMessage, referralIpMatchRejectionMessage } from '../../utils/slackMessages'

const TIERS = [5, 10, 20, 25, 30, 50, 60, 75]
const TIERS_IRL_SWAG = 100
const MARKETING_EMAIL = 'marketing@decentraland.org'
export const MAX_IP_MATCHES = 2

function validateAddress(value: string, field: string): string {
  if (!EthAddress.validate(value)) {
    throw new ReferralInvalidInputError(`Invalid ${field} address`)
  }
  return value.toLowerCase()
}

export async function createReferralComponent(
  components: Pick<AppComponents, 'referralDb' | 'logs' | 'sns' | 'config' | 'rewards' | 'email' | 'slack'>
): Promise<IReferralComponent> {
  const { referralDb, logs, sns, config, rewards, email: emailComponent, slack } = components

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
    REFERRAL_METABASE_DASHBOARD
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
    config.requireString('REFERRAL_METABASE_DASHBOARD')
  ])

  const isDev = ENV === 'dev'

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

  function createReferralNewTierReachedEvent(
    referrer: string,
    invitedUser: string,
    totalInvitedUsers: number,
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
        tier: TIERS.findIndex((tier) => totalInvitedUsers <= tier) + 1,
        url: `${PROFILE_URL}/accounts/${referrer}/referral`,
        image: reward.image,
        invitedUserAddress: invitedUser,
        invitedUsers: totalInvitedUsers,
        rarity: reward.rarity!
      }
    }
  }

  async function fetchDenyList(): Promise<Set<string>> {
    try {
      const response = await fetch('https://config.decentraland.org/denylist.json')
      if (!response.ok) {
        throw new Error(`Failed to fetch deny list, status: ${response.status}`)
      }
      const data = await response.json()
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

  return {
    create: async (referralInput: CreateReferralWithInvitedUser) => {
      const referrer = validateAddress(referralInput.referrer, 'referrer')
      const invitedUser = validateAddress(referralInput.invitedUser, 'invitedUser')
      const invitedUserIP = referralInput.invitedUserIP

      if (referrer === invitedUser) {
        throw new SelfReferralError(invitedUser)
      }

      const referralExists = await referralDb.hasReferralProgress(invitedUser)
      if (referralExists) {
        throw new ReferralAlreadyExistsError(invitedUser)
      }

      logger.info('Creating referral', {
        referrer,
        invitedUser,
        invitedUserIP
      })

      const denyList = await fetchDenyList()

      if (denyList.has(referrer.toLowerCase())) {
        throw new ReferralInvalidInputError(`Referrer is on the deny list ${referrer}, ${invitedUserIP}`)
      }

      const referral = await referralDb.createReferral({ referrer, invitedUser, invitedUserIP })
      if (referral.status === ReferralProgressStatus.REJECTED_IP_MATCH) {
        try {
          await slack.sendMessage(
            referralIpMatchRejectionMessage(referrer, invitedUser, invitedUserIP, isDev, REFERRAL_METABASE_DASHBOARD)
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
          `Invited user has already reached the maximum number of ${MAX_IP_MATCHES} referrals from the same IP: ${invitedUserIP}`
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

      const denyList = await fetchDenyList()

      if (!progress.length) {
        throw new ReferralNotFoundError(invitedUser)
      }

      if (denyList.has(progress[0].referrer.toLowerCase())) {
        throw new ReferralInvalidInputError(
          `Referrer is on the deny list ${progress[0].referrer.toLowerCase()}, ${progress[0].invited_user_ip}`
        )
      }

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

      const denyList = await fetchDenyList()

      if (denyList.has(progress[0].referrer.toLowerCase())) {
        throw new ReferralInvalidInputError(
          `Referrer is on the deny list ${progress[0].referrer.toLowerCase()}, ${progress[0].invited_user_ip}`
        )
      }
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

      logger.info('Finalizing referral', {
        invitedUser,
        previousStatus: currentStatus,
        newStatus: ReferralProgressStatus.TIER_GRANTED
      })

      await referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)

      const acceptedInvites = await referralDb.countAcceptedInvitesByReferrer(referrer)

      const event = createReferralInvitedUsersAcceptedEvent(referrer, invitedUser, acceptedInvites)
      logger.debug('Publishing event createReferralInvitedUsersAcceptedEvent', {
        referrer,
        invitedUser,
        acceptedInvites,
        event: JSON.stringify(event)
      })
      await sns.publishMessage(event)

      if (TIERS.includes(acceptedInvites)) {
        const rewardKey = rewardKeys[acceptedInvites as keyof typeof rewardKeys]
        const rewardsSent = await rewards.sendReward(rewardKey, referrer)

        const eventNewTierReached = createReferralNewTierReachedEvent(
          referrer,
          invitedUser,
          acceptedInvites,
          rewardsSent[0]
        )
        logger.debug('Publishing event createReferralNewTierReachedEvent', {
          referrer,
          invitedUser,
          acceptedInvites,
          event: JSON.stringify(eventNewTierReached)
        })

        await Promise.all([
          sns.publishMessage(eventNewTierReached),
          referralDb.setReferralRewardImage({
            referrer,
            rewardImageUrl: rewardsSent[0].image,
            tier: acceptedInvites
          })
        ])

        return
      }

      if (acceptedInvites === TIERS_IRL_SWAG) {
        try {
          await slack.sendMessage(referral100InvitesReachedMessage(referrer, isDev, REFERRAL_METABASE_DASHBOARD))
        } catch (error) {
          logger.warn('Failed to send Slack notification, but referral was finalized successfully', {
            referrer,
            invitedUser,
            acceptedInvites,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

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
        referrer,
        email
      })

      const referralEmail = await referralDb.setReferralEmail({ referrer, email })

      logger.info('Referral email set successfully', {
        referrer,
        email
      })

      try {
        await emailComponent.sendEmail(
          MARKETING_EMAIL,
          '[Action Needed] IRL Swag Referral Tier Unlocked',
          `A user has unlocked the IRL Swag Referral Tier and provided the following email for contact: ${email}`
        )
        logger.info('Marketing email sent successfully', {
          referrer,
          email
        })
      } catch (error) {
        logger.warn('Failed to send marketing email, but referral email was saved', {
          referrer,
          email,
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
