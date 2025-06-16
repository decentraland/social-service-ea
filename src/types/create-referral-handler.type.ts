export type CreateReferralPayload = {
  referrer: string
}

export type CreateReferralWithInvitedUser = CreateReferralPayload & {
  invitedUser: string
}
