import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { IValidationComponents } from '../types/validations.type'
import { ReferralProgressStatus } from '../types/referral-db.type'
import {
  ReferralProgressNotFoundError,
  InvalidReferralStatusError,
  SelfReferralError,
  ReferralProgressExistsError
} from '../types/errors'

export const validationRules = {
  required: {
    validate: async (value: string, { fieldName }: IValidationComponents) => {
      if (!value) {
        throw new InvalidRequestError(`Missing required field: ${fieldName}`)
      }
      return true
    },
    error: InvalidRequestError
  },

  ethAddress: {
    validate: async (value: string, { fieldName }: IValidationComponents) => {
      if (!EthAddress.validate(value)) {
        throw new InvalidRequestError(`Invalid ${fieldName} address`)
      }
      return true
    },
    error: InvalidRequestError
  },

  referralExists: {
    validate: async (value: string, { db }: IValidationComponents) => {
      const exists = await db.hasReferralProgress(value)
      if (!exists) {
        throw new ReferralProgressNotFoundError(value)
      }
      return true
    },
    error: ReferralProgressNotFoundError
  },

  referralStatus: {
    validate: async (value: string, { db }: IValidationComponents) => {
      const progress = await db.findReferralProgress({ invited_user: value })
      if (!progress.length) {
        throw new ReferralProgressNotFoundError(value)
      }
      const status = progress[0].status
      if (status !== ReferralProgressStatus.PENDING) {
        throw new InvalidReferralStatusError(status)
      }
      return true
    },
    error: InvalidReferralStatusError
  },

  notSelfReferral: {
    validate: async (value: string, { body }: IValidationComponents) => {
      const referrer = body?.referrer?.toLowerCase()
      const invitedUser = value.toLowerCase()

      if (referrer === invitedUser) {
        throw new SelfReferralError(invitedUser)
      }

      return true
    },
    error: SelfReferralError
  },

  referralDoesNotExist: {
    validate: async (value: string, { db }: IValidationComponents) => {
      const exists = await db.hasReferralProgress(value)
      if (exists) {
        throw new ReferralProgressExistsError(value)
      }
      return true
    },
    error: ReferralProgressExistsError
  }
} as const
