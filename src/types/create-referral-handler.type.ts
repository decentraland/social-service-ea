export type CreateReferralPayload = {
  referrer: string
  invitedUserIP?: string
}

export type CreateReferralWithInvitedUser = {
  referrer: string
  invitedUser: string
  invitedUserIP: string
}
