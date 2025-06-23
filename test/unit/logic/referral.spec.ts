import { ReferralProgressStatus } from '../../../src/types/referral-db.type'
import { createReferralComponent, IReferralComponent } from '../../../src/logic/referral'
import {
  ReferralNotFoundError,
  ReferralInvalidInputError,
  ReferralAlreadyExistsError,
  ReferralInvalidStatusError,
  SelfReferralError
} from '../../../src/logic/referral/errors'
import { Events } from '@dcl/schemas'

describe('referral-component', () => {
  let mockReferralDb: any
  let mockLogger: any
  let mockSns: any
  let referralComponent: IReferralComponent

  beforeEach(async () => {
    mockReferralDb = {
      createReferral: jest.fn(),
      hasReferralProgress: jest.fn(),
      findReferralProgress: jest.fn(),
      updateReferralProgress: jest.fn(),
      countAcceptedInvitesByReferrer: jest.fn(),
      getLastViewedProgressByReferrer: jest.fn(),
      setLastViewedProgressByReferrer: jest.fn()
    }

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }

    mockSns = {
      publishMessage: jest.fn().mockResolvedValue({ MessageId: 'mock-message-id' })
    }

    referralComponent = await createReferralComponent({
      referralDb: mockReferralDb,
      logs: { getLogger: () => mockLogger },
      sns: mockSns
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when creating a referral', () => {
    const validReferrer = '0x1234567890123456789012345678901234567890'
    const validInvitedUser = '0x0987654321098765432109876543210987654321'
    let validInput: { referrer: string; invitedUser: string }
    let selfReferralInput: { referrer: string; invitedUser: string }

    beforeEach(() => {
      validInput = {
        referrer: validReferrer,
        invitedUser: validInvitedUser
      }
      selfReferralInput = {
        referrer: validReferrer,
        invitedUser: validReferrer
      }
    })

    describe('with a valid referral input', () => {
      it('should create referral successfully', async () => {
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.createReferral.mockResolvedValueOnce({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING
        })

        const result = await referralComponent.create(validInput)

        expect(mockReferralDb.hasReferralProgress).toHaveBeenCalledWith(validInvitedUser)
        expect(mockReferralDb.createReferral).toHaveBeenCalledWith({
          referrer: validReferrer.toLowerCase(),
          invitedUser: validInvitedUser.toLowerCase()
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Creating referral', {
          referrer: validReferrer.toLowerCase(),
          invitedUser: validInvitedUser.toLowerCase()
        })
        expect(mockLogger.info).toHaveBeenCalledWith(
          `Referral from ${validReferrer.toLowerCase()} to ${validInvitedUser.toLowerCase()} created successfully`
        )
        expect(result).toEqual({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING
        })
      })
    })

    describe('when validating the referrer address', () => {
      let address: string
      let invalidInput: { referrer: string; invitedUser: string }

      beforeEach(() => {
        invalidInput = { ...validInput, referrer: address }
      })

      describe('and the address is shorter than an Ethereum address', () => {
        beforeEach(() => {
          address = '0x123'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid referrer address')
          )
        })
      })

      describe('and the address contains non hexa characters', () => {
        beforeEach(() => {
          address = 'invalid-address'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid referrer address')
          )
        })
      })

      describe('and the address is longer than an Ethereum address', () => {
        beforeEach(() => {
          address = '0x12345678901234567890123456789012345678901'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid referrer address')
          )
        })
      })

      describe('and the address is an empty string', () => {
        beforeEach(() => {
          address = ''
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid referrer address')
          )
        })
      })

      describe('and the address is not an address format', () => {
        beforeEach(() => {
          address = 'not-an-address'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid referrer address')
          )
        })
      })
    })

    describe('when validating the invited user address', () => {
      let address: string
      let invalidInput: { referrer: string; invitedUser: string }

      beforeEach(() => {
        invalidInput = { ...validInput, invitedUser: address }
      })

      describe('and the address is shorter than an Ethereum address', () => {
        beforeEach(() => {
          address = '0x123'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid invitedUser address')
          )
        })
      })

      describe('and the address contains non hexa characters', () => {
        beforeEach(() => {
          address = 'invalid-address'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid invitedUser address')
          )
        })
      })

      describe('and the address is longer than an Ethereum address', () => {
        beforeEach(() => {
          address = '0x12345678901234567890123456789012345678901'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid invitedUser address')
          )
        })
      })

      describe('and the address is an empty string', () => {
        beforeEach(() => {
          address = ''
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid invitedUser address')
          )
        })
      })

      describe('and the address is not an address format', () => {
        beforeEach(() => {
          address = 'not-an-address'
        })

        it('should throw a referral invalid input error', async () => {
          await expect(referralComponent.create(invalidInput)).rejects.toThrow(
            new ReferralInvalidInputError('Invalid invitedUser address')
          )
        })
      })
    })

    describe('when referrer and invitedUser are the same', () => {
      it('should throw SelfReferralError', async () => {
        await expect(referralComponent.create(selfReferralInput)).rejects.toThrow(
          new SelfReferralError(validReferrer.toLowerCase())
        )
      })

      it('should throw SelfReferralError with case insensitive comparison', async () => {
        const caseInsensitiveSelfReferral = {
          referrer: '0x1234567890123456789012345678901234567890',
          invitedUser: '0x1234567890123456789012345678901234567890'
        }

        await expect(referralComponent.create(caseInsensitiveSelfReferral)).rejects.toThrow(
          new SelfReferralError(validReferrer.toLowerCase())
        )
      })
    })

    describe('when referral already exists', () => {
      beforeEach(() => {
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(true)
      })

      it('should throw ReferralAlreadyExistsError', async () => {
        await expect(referralComponent.create(validInput)).rejects.toThrow(
          new ReferralAlreadyExistsError(validInvitedUser.toLowerCase())
        )
      })
    })
  })

  describe('when updating referral progress', () => {
    const validInvitedUser = '0x1234567890123456789012345678901234567890'

    describe('with valid data and pending status', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: '0x0987654321098765432109876543210987654321',
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
      })

      it('should update progress to signed up', async () => {
        await referralComponent.updateProgress(validInvitedUser, ReferralProgressStatus.SIGNED_UP)

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: validInvitedUser.toLowerCase()
        })
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.SIGNED_UP
        )
        expect(mockLogger.info).toHaveBeenCalledWith('Updating referral progress', {
          invitedUser: validInvitedUser.toLowerCase(),
          status: ReferralProgressStatus.SIGNED_UP
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Referral progress updated successfully', {
          invitedUser: validInvitedUser.toLowerCase(),
          status: ReferralProgressStatus.SIGNED_UP
        })
      })

      it('should update progress to tier granted', async () => {
        await referralComponent.updateProgress(validInvitedUser, ReferralProgressStatus.TIER_GRANTED)

        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
      })
    })

    describe('when referral not found', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
      })

      it('should throw ReferralNotFoundError', async () => {
        await expect(
          referralComponent.updateProgress(validInvitedUser, ReferralProgressStatus.SIGNED_UP)
        ).rejects.toThrow(new ReferralNotFoundError(validInvitedUser.toLowerCase()))
      })
    })

    describe('when status is not pending', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: '0x0987654321098765432109876543210987654321',
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
      })

      it('should throw ReferralInvalidStatusError', async () => {
        await expect(
          referralComponent.updateProgress(validInvitedUser, ReferralProgressStatus.SIGNED_UP)
        ).rejects.toThrow(
          new ReferralInvalidStatusError(ReferralProgressStatus.SIGNED_UP, ReferralProgressStatus.PENDING)
        )
      })
    })

    describe('with invalid invitedUser address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(
          referralComponent.updateProgress('invalid-address', ReferralProgressStatus.SIGNED_UP)
        ).rejects.toThrow(new ReferralInvalidInputError('Invalid invitedUser address'))
      })
    })
  })

  describe('when finalizing referral', () => {
    const validInvitedUser = '0x1234567890123456789012345678901234567890'
    const validReferrer = '0x0987654321098765432109876543210987654321'

    describe('with valid signed up status', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
      })

      it('should finalize referral to tier granted and publish event', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: validInvitedUser.toLowerCase()
        })
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
        expect(mockReferralDb.countAcceptedInvitesByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: Events.Type.REFERRAL,
            subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED,
            metadata: expect.objectContaining({
              address: validReferrer.toLowerCase(),
              invitedUserAddress: validInvitedUser.toLowerCase(),
              invitedUsers: 5
            })
          })
        )
        expect(mockLogger.info).toHaveBeenCalledWith('Finalizing referral', {
          invitedUser: validInvitedUser.toLowerCase(),
          previousStatus: ReferralProgressStatus.SIGNED_UP,
          newStatus: ReferralProgressStatus.TIER_GRANTED
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Referral finalized successfully', {
          invitedUser: validInvitedUser.toLowerCase(),
          status: ReferralProgressStatus.TIER_GRANTED
        })
      })
    })

    describe('when referral reaches a tier milestone', () => {
      describe('and the referral reaches tier 1 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        })

        it('should calculate correct tier for 5 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 1,
                invitedUsers: 5
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 2 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(10)
        })

        it('should calculate correct tier for 10 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 2,
                invitedUsers: 10
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 3 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(20)
        })

        it('should calculate correct tier for 20 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 3,
                invitedUsers: 20
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 4 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(25)
        })

        it('should calculate correct tier for 25 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 4,
                invitedUsers: 25
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 5 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(30)
        })

        it('should calculate correct tier for 30 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 5,
                invitedUsers: 30
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 6 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(50)
        })

        it('should calculate correct tier for 50 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 6,
                invitedUsers: 50
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 7 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(60)
        })

        it('should calculate correct tier for 60 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 7,
                invitedUsers: 60
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 8 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(75)
        })

        it('should calculate correct tier for 75 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 8,
                invitedUsers: 75
              })
            })
          )
        })
      })

      describe('and the referral reaches tier 9 milestone', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(100)
        })

        it('should calculate correct tier for 100 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 9,
                invitedUsers: 100
              })
            })
          )
        })
      })
    })

    describe('when referral does not reach a tier milestone', () => {
      describe('and the referral has 1 invited user', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(1)
        })

        it('should calculate correct tier for 1 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 1,
                invitedUsers: 1
              })
            })
          )
        })
      })

      describe('and the referral has 3 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(3)
        })

        it('should calculate correct tier for 3 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 1,
                invitedUsers: 3
              })
            })
          )
        })
      })

      describe('and the referral has 7 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(7)
        })

        it('should calculate correct tier for 7 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 2,
                invitedUsers: 7
              })
            })
          )
        })
      })

      describe('and the referral has 15 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(15)
        })

        it('should calculate correct tier for 15 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 3,
                invitedUsers: 15
              })
            })
          )
        })
      })

      describe('and the referral has 22 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(22)
        })

        it('should calculate correct tier for 22 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 4,
                invitedUsers: 22
              })
            })
          )
        })
      })

      describe('and the referral has 28 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(28)
        })

        it('should calculate correct tier for 28 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 5,
                invitedUsers: 28
              })
            })
          )
        })
      })

      describe('and the referral has 45 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(45)
        })

        it('should calculate correct tier for 45 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 6,
                invitedUsers: 45
              })
            })
          )
        })
      })

      describe('and the referral has 55 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(55)
        })

        it('should calculate correct tier for 55 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 7,
                invitedUsers: 55
              })
            })
          )
        })
      })

      describe('and the referral has 70 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(70)
        })

        it('should calculate correct tier for 70 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 8,
                invitedUsers: 70
              })
            })
          )
        })
      })

      describe('and the referral has 95 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(95)
        })

        it('should calculate correct tier for 95 invited users', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 9,
                invitedUsers: 95
              })
            })
          )
        })
      })
    })

    describe('when referral exceeds maximum tier', () => {
      describe('and the referral has 101 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(101)
        })

        it('should return tier 0 for 101 invited users (exceeds max)', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 0,
                invitedUsers: 101
              })
            })
          )
        })
      })

      describe('and the referral has 150 invited users', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(150)
        })

        it('should return tier 0 for 150 invited users (exceeds max)', async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier: 0,
                invitedUsers: 150
              })
            })
          )
        })
      })
    })

    describe('when referral not found', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
      })

      it('should return without error', async () => {
        await expect(referralComponent.finalizeReferral(validInvitedUser)).resolves.toBeUndefined()

        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })

    describe('when referral is already finalized', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.TIER_GRANTED
          }
        ])
      })

      it('should still process the referral and publish event', async () => {
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)

        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
        expect(mockSns.publishMessage).toHaveBeenCalled()
        expect(mockLogger.info).toHaveBeenCalledWith('Finalizing referral', {
          invitedUser: validInvitedUser.toLowerCase(),
          previousStatus: ReferralProgressStatus.TIER_GRANTED,
          newStatus: ReferralProgressStatus.TIER_GRANTED
        })
      })
    })

    describe('with invalid invitedUser address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(referralComponent.finalizeReferral('invalid-address')).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
        )
      })
    })

    describe('when SNS publish fails', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockSns.publishMessage.mockRejectedValueOnce(new Error('SNS publish failed'))
      })

      it('should still update referral progress even if SNS fails', async () => {
        await expect(referralComponent.finalizeReferral(validInvitedUser)).rejects.toThrow('SNS publish failed')

        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
      })
    })
  })

  describe('when getting invited users accepted stats', () => {
    const validReferrer = '0x1234567890123456789012345678901234567890'

    describe('with valid data', () => {
      it('should return stats and update last viewed', async () => {
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValueOnce(3)
        mockReferralDb.setLastViewedProgressByReferrer.mockResolvedValueOnce(undefined)

        const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

        expect(mockReferralDb.countAcceptedInvitesByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
        expect(mockReferralDb.getLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
        expect(mockReferralDb.setLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase(), 5)
        expect(mockLogger.info).toHaveBeenCalledWith('Getting invited users accepted stats', {
          referrer: validReferrer.toLowerCase()
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Invited users accepted stats retrieved successfully', {
          referrer: validReferrer.toLowerCase(),
          invitedUsersAccepted: 5,
          invitedUsersAcceptedViewed: 3
        })
        expect(result).toEqual({
          invitedUsersAccepted: 5,
          invitedUsersAcceptedViewed: 3
        })
      })

      describe('with zero invited users', () => {
        beforeEach(() => {
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(0)
          mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValue(0)
        })

        it('should return 0 for both accepted and viewed', async () => {
          const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

          expect(result).toEqual({
            invitedUsersAccepted: 0,
            invitedUsersAcceptedViewed: 0
          })
          expect(mockReferralDb.setLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase(), 0)
        })
      })

      describe('with null last viewed progress', () => {
        beforeEach(() => {
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(5)
          mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValue(null)
        })

        it('should return null for viewed', async () => {
          const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

          expect(result).toEqual({
            invitedUsersAccepted: 5,
            invitedUsersAcceptedViewed: null
          })
          expect(mockReferralDb.setLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase(), 5)
        })
      })
    })

    describe('with invalid referrer address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(referralComponent.getInvitedUsersAcceptedStats('invalid-address')).rejects.toThrow(
          new ReferralInvalidInputError('Invalid referrer address')
        )
      })
    })
  })
})
