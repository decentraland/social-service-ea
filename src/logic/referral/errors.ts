import { InvalidRequestError } from '@dcl/platform-server-commons'

export class ReferralNotFoundError extends Error {
  constructor(userAddress: string) {
    super(`Referral progress not found for user: ${userAddress}`)
  }
}

export class ReferralInvalidInputError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class ReferralAlreadyExistsError extends Error {
  constructor(invitedUser: string) {
    super(`Referral progress already exists for the invited user: ${invitedUser}`)
  }
}

export class ReferralInvalidStatusError extends Error {
  constructor(currentStatus: string, expectedStatus: string) {
    super(`Invalid referral status: ${currentStatus}. Expected: ${expectedStatus}`)
  }
}

export class SelfReferralError extends Error {
  constructor(userAddress: string) {
    super(`User cannot refer themselves: ${userAddress}`)
  }
}

export class ReferralEmailUpdateTooSoonError extends InvalidRequestError {
  constructor(referrer: string) {
    super(`Email can only be updated once per day. Last update was less than 24 hours ago for user: ${referrer}`)
  }
}
