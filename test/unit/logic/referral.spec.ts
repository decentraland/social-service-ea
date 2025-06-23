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
    let invalidInputInvalidReferrer: { referrer: string; invitedUser: string }
    let invalidInputInvalidInvitedUser: { referrer: string; invitedUser: string }
    let selfReferralInput: { referrer: string; invitedUser: string }

    beforeEach(() => {
      validInput = {
        referrer: validReferrer,
        invitedUser: validInvitedUser
      }
      invalidInputInvalidReferrer = { ...validInput, referrer: 'invalid-address' }
      invalidInputInvalidInvitedUser = { ...validInput, invitedUser: 'invalid-address' }
      selfReferralInput = {
        referrer: validReferrer,
        invitedUser: validReferrer
      }
    })

    describe('with valid data', () => {
      beforeEach(() => {
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.createReferral.mockResolvedValueOnce({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING
        })
      })

      it('should create referral successfully', async () => {
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

    describe('with invalid referrer address', () => {
      it.each([
        'invalid-address',
        '0x123',
        '0x123456789012345678901234567890123456789',
        '0x12345678901234567890123456789012345678901',
        '',
        'not-an-address'
      ])('should throw ReferralInvalidInputError for invalid address: %s', async (invalidAddress) => {
        const invalidInput = { ...validInput, referrer: invalidAddress }

        await expect(referralComponent.create(invalidInput)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid referrer address')
        )
      })
    })

    describe('with invalid invitedUser address', () => {
      it.each([
        'invalid-address',
        '0x123',
        '0x123456789012345678901234567890123456789',
        '0x12345678901234567890123456789012345678901',
        '',
        'not-an-address'
      ])('should throw ReferralInvalidInputError for invalid address: %s', async (invalidAddress) => {
        const invalidInput = { ...validInput, invitedUser: invalidAddress }

        await expect(referralComponent.create(invalidInput)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
        )
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

    describe('when referral reaches a tier milestones', () => {
      it.each([
        [5, 1], // 5 invited users = Tier 1
        [10, 2], // 10 invited users = Tier 2
        [20, 3], // 20 invited users = Tier 3
        [25, 4], // 25 invited users = Tier 4
        [30, 5], // 30 invited users = Tier 5
        [50, 6], // 50 invited users = Tier 6
        [60, 7], // 60 invited users = Tier 7
        [75, 8], // 75 invited users = Tier 8
        [100, 9] // 100 invited users = Tier 9
      ])('should calculate correct tier for %i invited users', async (invitedUsers, expectedTier) => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)

        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              tier: expectedTier,
              invitedUsers
            })
          })
        )
      })
    })

    describe('when referral does not reach a tier milestone', () => {
      it.each([
        [1, 1], // 1 invited user = Tier 1 (default)
        [3, 1], // 3 invited users = Tier 1 (default)
        [7, 2], // 7 invited users = Tier 2 (default)
        [15, 3], // 15 invited users = Tier 3 (default)
        [22, 4], // 22 invited users = Tier 4 (default)
        [28, 5], // 28 invited users = Tier 5 (default)
        [45, 6], // 45 invited users = Tier 6 (default)
        [55, 7], // 55 invited users = Tier 7 (default)
        [70, 8], // 70 invited users = Tier 8 (default)
        [95, 9] // 95 invited users = Tier 9 (default)
      ])('should calculate correct tier for %i invited users', async (invitedUsers, expectedTier) => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)

        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              tier: expectedTier,
              invitedUsers
            })
          })
        )
      })
    })

    describe('when referral exceeds maximum tier', () => {
      it.each([
        [101, 0], // 101 invited users = Tier 0 (no tier found)
        [150, 0] // 150 invited users = Tier 0 (no tier found)
      ])('should return tier 0 for %i invited users (exceeds max)', async (invitedUsers, expectedTier) => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)

        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              tier: expectedTier,
              invitedUsers
            })
          })
        )
      })
    })

    describe('when referral reaches a tier milestone', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5) // Tier 1 milestone
      })

      it('should finalize referral and publish invited users accepted event', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'referral',
            subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED,
            metadata: expect.objectContaining({
              tier: 1,
              invitedUsers: 5
            })
          })
        )
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
      beforeEach(() => {
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValueOnce(3)
        mockReferralDb.setLastViewedProgressByReferrer.mockResolvedValueOnce(undefined)
      })

      it('should return stats and update last viewed', async () => {
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
