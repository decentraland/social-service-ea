export interface IReferralDatabaseComponent {
  createReferral(
    referralInput: {
      referrer: string
      invitedUser: string
      invitedUserIP: string
    },
    denyList: Set<string>
  ): Promise<ReferralProgress>
  findReferralProgress(filter: ReferralProgressFilter): Promise<ReferralProgress[]>
  updateReferralProgress(
    invitedUser: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<void>
  hasReferralProgress(invitedUser: string): Promise<boolean>
  listAllReferralProgress(filter?: Pick<ReferralProgressFilter, 'limit' | 'offset'>): Promise<ReferralProgress[]>
  countAcceptedInvitesByReferrer(referrer: string): Promise<number>
  getLastViewedProgressByReferrer(referrer: string): Promise<number>
  setLastViewedProgressByReferrer(referrer: string, invitedUsersSeen: number): Promise<void>
  setReferralEmail(referralEmailInput: { referrer: string; email: string }): Promise<ReferralEmail>
  setReferralRewardImage(referralRewardImageInput: {
    referrer: string
    rewardImageUrl: string
    tier: number
  }): Promise<ReferralRewardImage>
  getLastReferralEmailByReferrer(referrer: string): Promise<ReferralEmail | null>
  getReferralRewardImage(referrer: string): Promise<ReferralRewardImage[] | null>
}

export enum ReferralProgressStatus {
  PENDING = 'pending',
  SIGNED_UP = 'signed_up',
  TIER_GRANTED = 'tier_granted',
  REJECTED_IP_MATCH = 'rejected_ip_match'
}

export type ReferralProgressFilter = Partial<{
  referrer: string
  invitedUser: string
  status: ReferralProgressStatus
  limit: number
  offset: number
}>

export type ReferralProgress = {
  id: string
  referrer: string
  invited_user: string
  status: ReferralProgressStatus
  signed_up_at: number | null
  tier_granted: boolean
  tier_granted_at: number | null
  created_at: number
  updated_at: number
  invited_user_ip: string | null
}

export type ReferralTierSeen = {
  referrer: string
  invites_accepted_viewed: number
  created_at: number
  updated_at: number
}

export type ReferralEmail = {
  id: string
  referrer: string
  email: string
  created_at: number
  updated_at: number
}

export type ReferralRewardImage = {
  id: string
  referrer: string
  reward_image_url: string
  tier: number
  created_at: number
}
