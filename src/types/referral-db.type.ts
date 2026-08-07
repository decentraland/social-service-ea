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
   * granted, when it is parked for manual review, when another worker holds an unexpired claim,
   * or when the attempt budget is spent.
   *
   * Every winning claim stamps a fresh `claim_token` on the row. That token is the fencing
   * token: it must be handed back to any call that closes the claim, so a worker whose lease
   * expired mid-issuance can no longer write over the claim that superseded it.
   *
   * @param referrer The referrer wallet address.
   * @param tier The tier being granted.
   * @param options Attempt budget and how long a claim blocks a competing worker.
   * @returns The claimed grant row including its fresh claim token, or null when the caller did not win the claim.
   */
  claimTierReward(
    referrer: string,
    tier: number,
    options: { maxAttempts: number; leaseMs: number }
  ): Promise<ReferralRewardGrant | null>
  /**
   * Marks a claimed tier as granted, closing it to any further issuance.
   *
   * @param claimToken The token returned by the claim being closed. A stale worker passing a
   * superseded token matches no row instead of closing the claim that replaced it.
   * @returns The number of rows transitioned (0 when the claim is no longer this caller's, or
   * it is no longer pending).
   */
  markTierRewardGranted(referrer: string, tier: number, claimToken: string): Promise<number>
  /**
   * Records why an issuance attempt failed, leaving the tier claimable again once the lease expires.
   *
   * Only for failures that prove nothing was issued. Anything ambiguous must be parked with
   * {@link markTierRewardNeedsManualReview} instead, or the retry issues a second reward.
   *
   * @param claimToken The token returned by the claim that failed; fences out a stale worker.
   */
  recordTierRewardFailure(referrer: string, tier: number, claimToken: string, error: string): Promise<void>
  /**
   * Parks a claimed tier whose issuance outcome is unknown, taking it out of the retry loop.
   *
   * The reward may or may not have been created upstream and there is no way to ask, so the
   * grant is neither closed as granted nor left claimable. A human or reconciliation job must
   * check with the reward provider and then either close it as granted or return it to pending.
   *
   * @param claimToken The token returned by the claim that ended ambiguously; fences out a stale
   * worker. Pass null to park whichever claim currently holds the row — only valid when this
   * caller's own token is already superseded but a reward is known to have been issued.
   * @returns The number of rows parked (0 when the claim is no longer this caller's, or, for an
   * unfenced park, when the row is no longer pending).
   */
  markTierRewardNeedsManualReview(
    referrer: string,
    tier: number,
    claimToken: string | null,
    error: string
  ): Promise<number>
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
  GRANTED = 'granted',
  /**
   * Issuance was attempted but the outcome is unknown, so the reward may already exist.
   * Terminal to the automatic path — only a human or a reconciliation job moves it out.
   */
  NEEDS_MANUAL_REVIEW = 'needs_manual_review'
}

export type ReferralRewardGrant = {
  id: string
  referrer: string
  tier: number
  status: ReferralRewardGrantStatus
  attempts: number
  /** Fencing token, rotated on every winning claim. Required to close or park the claim. */
  claim_token: string
  last_error: string | null
  created_at: number
  updated_at: number
}
