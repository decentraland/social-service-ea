import {
  ReferralProgress,
  ReferralProgressStatus,
  ReferralEmail,
  ReferralRewardImage
} from '../../types/referral-db.type'
import { CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'
import { ChainId, Rarity } from '@dcl/schemas'

export interface IReferralComponent {
  create(referralInput: CreateReferralWithInvitedUser): Promise<ReferralProgress>
  updateProgress(
    invitedUser: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<void>
  finalizeReferral(invitedUser: string): Promise<void>
  getInvitedUsersAcceptedStats(referrer: string): Promise<{
    invitedUsersAccepted: number
    invitedUsersAcceptedViewed: number
    rewardImages: { tier: number; url: string }[]
  }>
  setReferralEmail(referralEmailInput: Pick<ReferralEmail, 'referrer' | 'email'>): Promise<ReferralEmail>
  setReferralRewardImage(referralRewardImageInput: SetReferralRewardImageInput): Promise<ReferralRewardImage>
}

export type SetReferralRewardImageInput = {
  referrer: string
  rewardImageUrl: string
  tier: number
}

export enum RewardStatus {
  unassigned = 'unassigned',

  // assigned and waiting for a confirmation (example: blockchain confirmation)
  pending = 'pending',

  assigned = 'assigned',
  sending = 'sending',
  success = 'success',
  rejected = 'rejected',
  confirmed = 'confirmed'
}

export type RewardAttributes = {
  id: string
  user: string | null
  status: RewardStatus
  chain_id: ChainId | 0
  target: string
  value: string
  token: string
  image: string

  rarity: Rarity | null
}
