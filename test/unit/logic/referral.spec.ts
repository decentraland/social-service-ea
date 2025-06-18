import { ReferralProgressStatus } from '../../../src/types/referral-db.type'
import { createReferralComponent, IReferralComponent } from '../../../src/logic/referral'
import {
  ReferralNotFoundError,
  ReferralInvalidInputError,
  ReferralAlreadyExistsError,
  ReferralInvalidStatusError,
  SelfReferralError
} from '../../../src/logic/referral/errors'

describe('referral-component', () => {
  let mockReferralDb: any
  let mockLogger: any
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

    referralComponent = await createReferralComponent({
      referralDb: mockReferralDb,
      logs: { getLogger: () => mockLogger }
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
      it('should throw ReferralInvalidInputError', async () => {
        await expect(referralComponent.create(invalidInputInvalidReferrer)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid referrer address')
        )
      })
    })

    describe('with invalid invitedUser address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(referralComponent.create(invalidInputInvalidInvitedUser)).rejects.toThrow(
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

    describe('with valid signed up status', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: '0x0987654321098765432109876543210987654321',
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
      })

      it('should finalize referral to tier granted', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: validInvitedUser.toLowerCase()
        })
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
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

    describe('when referral not found', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
      })

      it('should return without error', async () => {
        await expect(referralComponent.finalizeReferral(validInvitedUser)).resolves.toBeUndefined()

        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
      })
    })

    describe('with invalid invitedUser address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(referralComponent.finalizeReferral('invalid-address')).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
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
