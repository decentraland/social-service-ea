import { ReferralProgress, ReferralProgressStatus } from '../../types/referral-db.type'
import { CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'

export interface IReferralComponent {
  create(referralInput: CreateReferralWithInvitedUser): Promise<ReferralProgress>
  updateProgress(
    invitedUser: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<void>
  getInvitedUsersAcceptedStats(
    referrer: string
  ): Promise<{ invitedUsersAccepted: number; invitedUsersAcceptedViewed: number }>
}
