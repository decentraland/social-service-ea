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
import { RewardStatus } from '../../../src/logic/referral/types'

describe('referral-component', () => {
  let mockReferralDb: any
  let mockLogger: any
  let mockSns: any
  let mockConfig: any
  let mockRewards: any
  let referralComponent: IReferralComponent

  beforeEach(async () => {
    mockReferralDb = {
      createReferral: jest.fn(),
      hasReferralProgress: jest.fn(),
      findReferralProgress: jest.fn(),
      updateReferralProgress: jest.fn(),
      countAcceptedInvitesByReferrer: jest.fn(),
      getLastViewedProgressByReferrer: jest.fn(),
      setLastViewedProgressByReferrer: jest.fn(),
      setReferralEmail: jest.fn(),
      getLastReferralEmailByReferrer: jest.fn(),
      setReferralRewardImage: jest.fn(),
      getReferralRewardImage: jest.fn()
    }

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }

    mockSns = {
      publishMessage: jest.fn().mockResolvedValue({ MessageId: 'mock-message-id' })
    }

    mockConfig = {
      requireString: jest.fn().mockImplementation((key: string) => {
        const rewardKeys: Record<string, string> = {
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75',
          PROFILE_URL: 'https://decentraland.org/profile'
        }
        return Promise.resolve(rewardKeys[key])
      })
    }

    mockRewards = {
      sendReward: jest.fn().mockResolvedValue([{ image: 'test-image.png', rarity: 'common' }])
    }

    referralComponent = await createReferralComponent({
      referralDb: mockReferralDb,
      logs: { getLogger: () => mockLogger },
      sns: mockSns,
      config: mockConfig,
      rewards: mockRewards
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
    let address: string
    let invalidInput: { referrer: string; invitedUser: string }

    beforeEach(() => {
      validInput = {
        referrer: validReferrer,
        invitedUser: validInvitedUser
      }
      selfReferralInput = {
        referrer: validReferrer,
        invitedUser: validReferrer
      }

      invalidInput = { ...validInput, referrer: address }
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

    describe('and the referral address is shorter than an Ethereum address', () => {
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

    describe('and the invited user address is shorter than an Ethereum address', () => {
      beforeEach(() => {
        address = '0x123'
        invalidInput = { ...validInput, invitedUser: address }
      })

      it('should throw a referral invalid input error', async () => {
        await expect(referralComponent.create(invalidInput)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
        )
      })
    })

    describe('and the invited user address is longer than an Ethereum address', () => {
      beforeEach(() => {
        address = '0x12345678901234567890123456789012345678901'
        invalidInput = { ...validInput, invitedUser: address }
      })

      it('should throw a referral invalid input error', async () => {
        await expect(referralComponent.create(invalidInput)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
        )
      })
    })

    describe('and the invited user address is an empty string', () => {
      beforeEach(() => {
        address = ''
        invalidInput = { ...validInput, invitedUser: address }
      })

      it('should throw a referral invalid input error', async () => {
        await expect(referralComponent.create(invalidInput)).rejects.toThrow(
          new ReferralInvalidInputError('Invalid invitedUser address')
        )
      })
    })

    describe('and the invited user address is not an address format', () => {
      beforeEach(() => {
        address = 'not-an-address'
        invalidInput = { ...validInput, invitedUser: address }
      })

      it('should throw a referral invalid input error', async () => {
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

      describe('and the address are in different cases', () => {
        let caseInsensitiveSelfReferral: { referrer: string; invitedUser: string }

        beforeEach(() => {
          caseInsensitiveSelfReferral = {
            referrer: '0x1234567890123456789012345678901234567abc',
            invitedUser: '0x1234567890123456789012345678901234567ABC'
          }
        })

        it('should throw SelfReferralError', async () => {
          await expect(referralComponent.create(caseInsensitiveSelfReferral)).rejects.toThrow(
            new SelfReferralError(caseInsensitiveSelfReferral.referrer.toLowerCase())
          )
        })
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
      })
    })

    describe('when referral reaches a tier milestone', () => {
      describe.each([
        { invitedUsers: 5, tier: 1, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5' },
        { invitedUsers: 10, tier: 2, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10' },
        { invitedUsers: 20, tier: 3, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20' },
        { invitedUsers: 25, tier: 4, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25' },
        { invitedUsers: 30, tier: 5, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30' },
        { invitedUsers: 50, tier: 6, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50' },
        { invitedUsers: 60, tier: 7, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60' },
        { invitedUsers: 75, tier: 8, rewardKey: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75' }
      ])('and the referral reaches tier $tier milestone', ({ invitedUsers, tier, rewardKey }) => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
          mockRewards.sendReward.mockResolvedValueOnce([
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              user: validReferrer,
              status: RewardStatus.assigned,
              chain_id: 137,
              target: validReferrer,
              value: '1000000000000000000',
              token: 'MANA',
              image: `https://rewards.decentraland.zone/reward${tier}.png`,
              rarity: null
            }
          ])
        })

        it(`should send the notification with the correct tier for ${invitedUsers} invited users`, async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockRewards.sendReward).toHaveBeenCalledWith(rewardKey, validReferrer.toLowerCase())
          expect(mockReferralDb.setReferralRewardImage).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            rewardImageUrl: `https://rewards.decentraland.zone/reward${tier}.png`,
            tier: invitedUsers
          })
          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier,
                invitedUsers,
                image: `https://rewards.decentraland.zone/reward${tier}.png`
              })
            })
          )
        })
      })
    })

    describe('when referral does not reach a tier milestone', () => {
      describe.each([
        { invitedUsers: 1, tier: 1 },
        { invitedUsers: 3, tier: 1 },
        { invitedUsers: 7, tier: 2 },
        { invitedUsers: 15, tier: 3 },
        { invitedUsers: 22, tier: 4 },
        { invitedUsers: 28, tier: 5 },
        { invitedUsers: 45, tier: 6 },
        { invitedUsers: 55, tier: 7 },
        { invitedUsers: 70, tier: 8 }
      ])('and the referral has $invitedUsers invited users', ({ invitedUsers, tier }) => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
        })

        it(`should send the notification with the correct tier for ${invitedUsers} invited users and not send reward`, async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockRewards.sendReward).not.toHaveBeenCalled()
          expect(mockReferralDb.setReferralRewardImage).not.toHaveBeenCalled()
          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier,
                invitedUsers
              })
            })
          )
        })
      })
    })

    describe('when referral exceeds maximum tier', () => {
      describe.each([
        { invitedUsers: 101, tier: 0 },
        { invitedUsers: 150, tier: 0 }
      ])('and the referral has $invitedUsers invited users', ({ invitedUsers, tier }) => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
        })

        it(`should return tier ${tier} for ${invitedUsers} invited users (exceeds max)`, async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                tier,
                invitedUsers
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

      it('should not process the referral and not publish event', async () => {
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(undefined)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)

        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
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
        mockReferralDb.getReferralRewardImage.mockResolvedValueOnce([
          {
            reward_image_url: 'https://rewards.decentraland.zone/reward5.png',
            tier: 5
          }
        ])

        const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

        expect(mockReferralDb.countAcceptedInvitesByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
        expect(mockReferralDb.getLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
        expect(mockReferralDb.setLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase(), 5)
        expect(mockReferralDb.getReferralRewardImage).toHaveBeenCalledWith(validReferrer.toLowerCase())
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
          invitedUsersAcceptedViewed: 3,
          rewardImages: [{ tier: 5, url: 'https://rewards.decentraland.zone/reward5.png' }]
        })
      })

      describe('with zero invited users', () => {
        beforeEach(() => {
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(0)
          mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValue(0)
          mockReferralDb.getReferralRewardImage.mockResolvedValue(null)
        })

        it('should return 0 for both accepted and viewed', async () => {
          const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

          expect(result).toEqual({
            invitedUsersAccepted: 0,
            invitedUsersAcceptedViewed: 0,
            rewardImages: []
          })
          expect(mockReferralDb.setLastViewedProgressByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase(), 0)
        })
      })

      describe('with null last viewed progress', () => {
        beforeEach(() => {
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(5)
          mockReferralDb.getLastViewedProgressByReferrer.mockResolvedValue(null)
          mockReferralDb.getReferralRewardImage.mockResolvedValue(null)
        })

        it('should return null for viewed', async () => {
          const result = await referralComponent.getInvitedUsersAcceptedStats(validReferrer)

          expect(result).toEqual({
            invitedUsersAccepted: 5,
            invitedUsersAcceptedViewed: null,
            rewardImages: []
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
