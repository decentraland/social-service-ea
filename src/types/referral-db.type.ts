export interface IReferralDatabaseComponent {
  /**
   * Inserts a referral, or resolves to null when a concurrent create already
   * inserted one for the same invited user (unique index conflict).
   */
  createReferral(referralInput: {
    referrer: string
    invitedUser: string
    invitedUserIP: string
  }): Promise<ReferralProgress | null>
  findReferralProgress(filter: ReferralProgressFilter): Promise<ReferralProgress[]>
  updateReferralProgress(
    invitedUser: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<number>
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
  /**
   * Atomically takes the exclusive right to issue the reward for a (referrer, tier) pair.
   *
   * Resolves to null — meaning the caller must NOT issue anything — when the tier is already
   * granted, when another worker holds an unexpired claim, or when the attempt budget is spent.
   *
   * @param referrer The referrer wallet address.
   * @param tier The tier being granted.
   * @param options Attempt budget and how long a claim blocks a competing worker.
   * @returns The claimed grant row, or null when the caller did not win the claim.
   */
  claimTierReward(
    referrer: string,
    tier: number,
    options: { maxAttempts: number; leaseMs: number }
  ): Promise<ReferralRewardGrant | null>
  /**
   * Marks a claimed tier as granted, closing it to any further issuance.
   *
   * @returns The number of rows transitioned (0 when it was not in the pending state).
   */
  markTierRewardGranted(referrer: string, tier: number): Promise<number>
  /**
   * Records why an issuance attempt failed, leaving the tier claimable again once the lease expires.
   */
  recordTierRewardFailure(referrer: string, tier: number, error: string): Promise<void>
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

export enum ReferralRewardGrantStatus {
  PENDING = 'pending',
  GRANTED = 'granted'
}

export type ReferralRewardGrant = {
  id: string
  referrer: string
  tier: number
  status: ReferralRewardGrantStatus
  attempts: number
  last_error: string | null
  created_at: number
  updated_at: number
}
