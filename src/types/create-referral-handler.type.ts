export type CreateReferralPayload = {
  referrer: string
}

export type CreateReferralWithInvitedUser = CreateReferralPayload & {
  invited_user: string
}
