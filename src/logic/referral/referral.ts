import { ReferralProgressStatus } from '../../types/referral-db.type'
import { EthAddress, Events, ReferralInvitedUsersAcceptedEvent, ReferralNewTierReachedEvent } from '@dcl/schemas'
import { CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'
import {
  ReferralNotFoundError,
  ReferralInvalidInputError,
  ReferralAlreadyExistsError,
  ReferralInvalidStatusError,
  SelfReferralError
} from './errors'
import type { IReferralComponent, RewardAttributes } from './types'
import type { AppComponents } from '../../types/system'

const TIERS = [5, 10, 20, 25, 30, 50, 60, 75, 100]

function validateAddress(value: string, field: string): string {
  if (!EthAddress.validate(value)) {
    throw new ReferralInvalidInputError(`Invalid ${field} address`)
  }
  return value.toLowerCase()
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
      url: `https://decentraland.org/profile/accounts/${referrer}/referral`,
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
      url: `https://decentraland.org/profile/accounts/${referrer}/referral`,
      image: 'https://assets-cdn.decentraland.org/referral/referral-new-tier-reached-icon.png',
      invitedUserAddress: invitedUser,
      invitedUsers: totalInvitedUsers,
      rarity: reward.rarity!
    }
  }
}

export async function createReferralComponent(
  components: Pick<AppComponents, 'referralDb' | 'logs' | 'sns'>
): Promise<IReferralComponent> {
  const { referralDb, logs, sns } = components

  const logger = logs.getLogger('referral-component')

  return {
    create: async (referralInput: CreateReferralWithInvitedUser) => {
      const referrer = validateAddress(referralInput.referrer, 'referrer')
      const invitedUser = validateAddress(referralInput.invitedUser, 'invitedUser')

      if (referrer === invitedUser) {
        throw new SelfReferralError(invitedUser)
      }

      const referralExists = await referralDb.hasReferralProgress(invitedUser)
      if (referralExists) {
        throw new ReferralAlreadyExistsError(invitedUser)
      }

      logger.info('Creating referral', {
        referrer,
        invitedUser
      })

      const referral = await referralDb.createReferral({ referrer, invitedUser })

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
      if (!progress.length) {
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
      await sns.publishMessage(event)

      if (TIERS.includes(acceptedInvites)) {
        // TODO: send notification to referrer getting the information from the reward server
        /* const event = createReferralNewTierReachedEvent(referrer, invitedUser, acceptedInvites, reward)
        await sns.publishMessage(event) */
      }

      logger.info('Referral finalized successfully', {
        invitedUser,
        status: ReferralProgressStatus.TIER_GRANTED
      })
    },

    getInvitedUsersAcceptedStats: async (referrer: string) => {
      const ref = validateAddress(referrer, 'referrer')
      logger.info('Getting invited users accepted stats', { referrer: ref })

      const [invitedUsersAccepted, invitedUsersAcceptedViewed] = await Promise.all([
        referralDb.countAcceptedInvitesByReferrer(ref),
        referralDb.getLastViewedProgressByReferrer(ref)
      ])

      await referralDb.setLastViewedProgressByReferrer(ref, invitedUsersAccepted)

      logger.info('Invited users accepted stats retrieved successfully', {
        referrer: ref,
        invitedUsersAccepted,
        invitedUsersAcceptedViewed
      })

      return {
        invitedUsersAccepted,
        invitedUsersAcceptedViewed
      }
    }
  }
}
