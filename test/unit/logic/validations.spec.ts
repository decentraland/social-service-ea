import { InvalidRequestError } from '@dcl/platform-server-commons'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { IValidationComponents, ValidationConfig } from '../../../src/types/validations.type'
import { validateRequestBody, validationRules } from '../../../src/logic/validations'
import {
  ReferralProgressExistsError,
  SelfReferralError,
  InvalidReferralStatusError,
  ReferralProgressNotFoundError
} from '../../../src/types/errors'
import { ReferralProgressStatus } from '../../../src/types/referral-db.type'

describe('validations-unit', () => {
  let mockComponents: IValidationComponents
  let mockDb: any
  let mockLogger: any

  beforeEach(() => {
    mockDb = {
      hasReferralProgress: jest.fn(),
      findReferralProgress: jest.fn()
    }
    mockLogger = {
      debug: jest.fn()
    }
    mockComponents = {
      db: mockDb,
      logger: mockLogger,
      request: {
        json: jest.fn().mockResolvedValue({}),
        clone: jest.fn(),
        context: {},
        headers: new Headers(),
        method: 'POST',
        url: 'http://localhost:3000',
        body: null,
        arrayBuffer: jest.fn(),
        blob: jest.fn(),
        formData: jest.fn(),
        text: jest.fn(),
        signal: null,
        credentials: 'same-origin',
        integrity: '',
        keepalive: false,
        mode: 'cors',
        redirect: 'follow',
        referrer: '',
        referrerPolicy: 'no-referrer',
        cache: 'default'
      } as unknown as IHttpServerComponent.IRequest
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('validateRequestBody', () => {
    const endpoint = '/test-endpoint'
    type TestPayload = {
      field1: string
      field2: string
    }

    const createConfig = (): ValidationConfig => [
      {
        field: 'field1',
        rules: [validationRules.required]
      },
      {
        field: 'field2',
        rules: [validationRules.required]
      }
    ]

    describe('when request body is valid', () => {
      it('should return validated body', async () => {
        const body = { field1: 'value1', field2: 'value2' }
        const config = createConfig()

        const result = await validateRequestBody<TestPayload>(body, mockComponents, config)

        expect(result).toEqual({
          field1: 'value1',
          field2: 'value2'
        })
      })
    })

    describe('when request body is invalid', () => {
      describe('with invalid JSON', () => {
        it('should throw InvalidRequestError', async () => {
          const config = createConfig()

          await expect(validateRequestBody<TestPayload>("" as unknown as TestPayload, mockComponents, config)).rejects.toThrow(
            new InvalidRequestError('Invalid body')
          )
        })
      })

      describe('with missing required field', () => {
        it('should throw InvalidRequestError', async () => {
          const body = { field1: 'value1', field2: undefined } as TestPayload
          const config = createConfig()

          await expect(validateRequestBody<TestPayload>(body, mockComponents, config)).rejects.toThrow(
            new InvalidRequestError('Missing required field: field2')
          )
        })
      })

      describe('with non-object body', () => {
        it('should throw InvalidRequestError', async () => {
          const body = null as unknown as TestPayload
          const config = createConfig()

          await expect(validateRequestBody<TestPayload>(body, mockComponents, config)).rejects.toThrow(
            new InvalidRequestError('Invalid body')
          )
        })
      })
    })
  })

  describe('validationRules', () => {
    describe('common validations', () => {
      describe('required', () => {
        it('should validate when value is present', async () => {
          const isValid = await validationRules.required.validate('value', { ...mockComponents, fieldName: 'test' })
          expect(isValid).toBe(true)
        })

        it('should throw when value is undefined', async () => {
          await expect(
            validationRules.required.validate(undefined, { ...mockComponents, fieldName: 'test' })
          ).rejects.toThrow(InvalidRequestError)
        })

        it('should throw when value is empty string', async () => {
          await expect(validationRules.required.validate('', { ...mockComponents, fieldName: 'test' })).rejects.toThrow(
            InvalidRequestError
          )
        })
      })

      describe('ethAddress', () => {
        it('should validate when value is a valid ethereum address', async () => {
          const isValid = await validationRules.ethAddress.validate('0x1234567890123456789012345678901234567890', {
            ...mockComponents,
            fieldName: 'test'
          })
          expect(isValid).toBe(true)
        })

        it('should throw when value is not a valid ethereum address', async () => {
          await expect(
            validationRules.ethAddress.validate('invalid', { ...mockComponents, fieldName: 'test' })
          ).rejects.toThrow(InvalidRequestError)
        })

        it('should throw when value is empty', async () => {
          await expect(
            validationRules.ethAddress.validate('', { ...mockComponents, fieldName: 'test' })
          ).rejects.toThrow(InvalidRequestError)
        })
      })
    })

    describe('referral validations', () => {
      describe('referralExists', () => {
        it('should validate when referral exists', async () => {
          mockDb.hasReferralProgress.mockResolvedValueOnce(true)
          const isValid = await validationRules.referralExists.validate('0x123', mockComponents)
          expect(isValid).toBe(true)
        })

        it('should throw ReferralProgressNotFoundError when referral does not exist', async () => {
          mockDb.hasReferralProgress.mockResolvedValueOnce(false)
          await expect(validationRules.referralExists.validate('0x123', mockComponents)).rejects.toThrow(
            ReferralProgressNotFoundError
          )
        })
      })

      describe('referralStatus', () => {
        it('should validate when referral status is pending', async () => {
          mockDb.findReferralProgress.mockResolvedValueOnce([{ status: ReferralProgressStatus.PENDING }])
          const isValid = await validationRules.referralStatus.validate('0x123', mockComponents)
          expect(isValid).toBe(true)
        })

        it('should throw ReferralProgressNotFoundError when referral does not exist', async () => {
          mockDb.findReferralProgress.mockResolvedValueOnce([])
          await expect(validationRules.referralStatus.validate('0x123', mockComponents)).rejects.toThrow(
            ReferralProgressNotFoundError
          )
        })

        it('should throw InvalidReferralStatusError when referral status is not pending', async () => {
          mockDb.findReferralProgress.mockResolvedValueOnce([{ status: ReferralProgressStatus.SIGNED_UP }])
          await expect(validationRules.referralStatus.validate('0x123', mockComponents)).rejects.toThrow(
            InvalidReferralStatusError
          )
        })
      })

      describe('notSelfReferral', () => {
        it('should validate when referrer is different from invited user', async () => {
          const components = {
            ...mockComponents,
            body: { referrer: '0x123' }
          }
          const isValid = await validationRules.notSelfReferral.validate('0x456', components)
          expect(isValid).toBe(true)
        })

        it('should throw SelfReferralError when referrer is the same as invited user', async () => {
          const components = {
            ...mockComponents,
            body: { referrer: '0x123' }
          }
          await expect(validationRules.notSelfReferral.validate('0x123', components)).rejects.toThrow(SelfReferralError)
        })
      })

      describe('referralDoesNotExist', () => {
        it('should validate when referral does not exist', async () => {
          mockDb.hasReferralProgress.mockResolvedValueOnce(false)
          const isValid = await validationRules.referralDoesNotExist.validate('0x123', mockComponents)
          expect(isValid).toBe(true)
        })

        it('should throw ReferralProgressExistsError when referral exists', async () => {
          mockDb.hasReferralProgress.mockResolvedValueOnce(true)
          await expect(validationRules.referralDoesNotExist.validate('0x123', mockComponents)).rejects.toThrow(
            ReferralProgressExistsError
          )
        })
      })
    })
  })
})
