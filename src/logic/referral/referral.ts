import { IReferralComponent } from './referral.types'
import { AppComponents } from '../../types/system'
import { ReferralProgressStatus } from '../../types/referral-db.type'
import { InvalidRequestError, NotFoundError } from '@dcl/platform-server-commons'
import { EthAddress } from '@dcl/schemas'
import { CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'

function validate(value: string | undefined, field: string): string {
  if (!value) {
    throw new InvalidRequestError(`Missing required field: ${field}`)
  }
  if (!EthAddress.validate(value)) {
    throw new InvalidRequestError(`Invalid ${field} address`)
  }
  return value.toLowerCase()
}

export async function createReferralComponent(
  components: Pick<AppComponents, 'referralDb' | 'logs'>
): Promise<IReferralComponent> {
  const { referralDb, logs } = components

  const logger = logs.getLogger('referral-component')

  return {
    create: async (referralInput: CreateReferralWithInvitedUser) => {
      const referrer = validate(referralInput.referrer, 'referrer')
      const invitedUser = validate(referralInput.invitedUser, 'invitedUser')
      if (referrer === invitedUser) {
        throw new InvalidRequestError(`User cannot refer themselves: ${invitedUser}`)
      }
      const referralExists = await referralDb.hasReferralProgress(invitedUser)
      if (referralExists) {
        throw new InvalidRequestError(`Referral progress already exists for the invited user: ${invitedUser}`)
      }

      logger.info('Creating referral', {
        referrer,
        invitedUser
      })

      const referral = await referralDb.createReferral({ referrer, invitedUser })

      logger.info('Referral created successfully')

      return referral
    },

    updateProgress: async (
      invitedUserToUpdate: string,
      status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
    ) => {
      const invitedUser = validate(invitedUserToUpdate, 'invitedUser')

      const progress = await referralDb.findReferralProgress({ invitedUser })
      if (!progress.length) {
        throw new NotFoundError(`Referral progress not found for user: ${invitedUser}`)
      }

      const currentStatus = progress[0].status
      if (currentStatus !== ReferralProgressStatus.PENDING) {
        throw new InvalidRequestError(`Invalid referral status: ${currentStatus}. Expected: PENDING`)
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

    getInvitedUsersAcceptedStats: async (referrer: string) => {
      const ref = validate(referrer, 'referrer')
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
