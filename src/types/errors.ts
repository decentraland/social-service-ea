import { InvalidRequestError } from '@dcl/platform-server-commons'

export class ReferralProgressExistsError extends InvalidRequestError {
  constructor(invited_user: string) {
    super(`Referral progress already exists for the invited user: ${invited_user}`)
  }
}

export class ReferralProgressNotFoundError extends InvalidRequestError {
  constructor(invited_user: string) {
    super(`No referral progress found for the invited user: ${invited_user}`)
  }
}

export class InvalidReferralStatusError extends InvalidRequestError {
  constructor(currentStatus: string) {
    super(`Invalid referral status: ${currentStatus}. Expected: PENDING`)
  }
}

export class SelfReferralError extends InvalidRequestError {
  constructor(invited_user: string) {
    super(`User cannot refer themselves: ${invited_user}`)
  }
}
