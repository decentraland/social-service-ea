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

const TIERS = [5, 10, 20, 25, 30, 50, 60, 75]
const TIERS_IRL_SWAG = 100
const MARKETING_EMAIL = 'marketing@decentraland.org'
export const MAX_IP_MATCHES = 3

function validateAddress(value: string, field: string): string {
  if (!EthAddress.validate(value)) {
    throw new ReferralInvalidInputError(`Invalid ${field} address`)
  }
  return value.toLowerCase()
}

export async function createReferralComponent(
  components: Pick<AppComponents, 'referralDb' | 'logs' | 'sns' | 'config' | 'rewards' | 'email'>
): Promise<IReferralComponent> {
  const { referralDb, logs, sns, config, rewards, email: emailComponent } = components

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
    PROFILE_URL
  ] = await Promise.all([
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60'),
    config.requireString('REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75'),
    config.requireString('PROFILE_URL')
  ])

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

      const referral = await referralDb.createReferral({ referrer, invitedUser, invitedUserIP })
      if (referral.status === ReferralProgressStatus.REJECTED_IP_MATCH) {
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
      if (!progress.length) {
        throw new ReferralNotFoundError(invitedUser)
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
      if (!progress.length || progress[0].status === ReferralProgressStatus.TIER_GRANTED) {
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
