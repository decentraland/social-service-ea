export interface IReferralDatabaseComponent {
  createReferral(referralInput: { referrer: string; invited_user: string }): Promise<ReferralProgress>
  findReferralProgress(filter: ReferralProgressFilter): Promise<ReferralProgress[]>
  updateReferralProgress(
    invited_user: string,
    status: ReferralProgressStatus.SIGNED_UP | ReferralProgressStatus.TIER_GRANTED
  ): Promise<void>
  hasReferralProgress(invited_user: string): Promise<boolean>
  listAllReferralProgress(filter?: Pick<ReferralProgressFilter, 'limit' | 'offset'>): Promise<ReferralProgress[]>
  countAcceptedInvitesByReferrer(referrer: string): Promise<number>
  getLastViewedProgressByReferrer(referrer: string): Promise<number>
  setLastViewedProgressByReferrer(referrer: string, invitedUsersSeen: number): Promise<void>
}

export enum ReferralProgressStatus {
  PENDING = 'pending',
  SIGNED_UP = 'signed_up',
  TIER_GRANTED = 'tier_granted'
}

export type ReferralProgressFilter = Partial<{
  referrer: string
  invited_user: string
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
}

export type ReferralTierSeen = {
  referrer: string
  invites_accepted_viewed: number
  created_at: number
  updated_at: number
}
