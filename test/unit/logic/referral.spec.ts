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
import {
  referralIpMatchRejectionMessage,
  referral100InvitesReachedMessage,
  referralSuspiciousTimingMessage
} from '../../../src/utils/slackMessages'
import { IPublisherComponent } from '@dcl/sns-component'
import { createSNSMockedComponent } from '../../mocks/components'
import { RewardIssuanceError, RewardRequestFailedError } from '../../../src/adapters/rewards'

const MAX_IP_MATCHES = 2
const REWARD_MAX_ATTEMPTS = 5
const REWARD_CLAIM_LEASE_MS = 5 * 60 * 1000
const REWARD_REQUEST_TIMEOUT_MS = 30 * 1000
// The fencing token a winning claim hands back; every call that closes or parks that claim
// must carry it, or the database matches no row.
const CLAIM_TOKEN = '11111111-1111-4111-8111-111111111111'

describe('referral-component', () => {
  let mockReferralDb: any
  let mockLogger: any
  let mockConfig: any
  let mockRewards: any
  let mockEmail: any
  let mockSlack: any
  let mockRedis: any
  let mockSns: jest.Mocked<IPublisherComponent>
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
      getReferralRewardImage: jest.fn(),
      // Default: every reached tier is already granted, so nothing new is issued. Tests that
      // expect an issuance claim their specific tier explicitly.
      claimTierReward: jest.fn().mockResolvedValue(null),
      markTierRewardGranted: jest.fn().mockResolvedValue(1),
      recordTierRewardFailure: jest.fn().mockResolvedValue(undefined),
      markTierRewardNeedsManualReview: jest.fn().mockResolvedValue(1)
    }

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }

    mockSns = createSNSMockedComponent({
      publishMessage: jest.fn().mockResolvedValue({ MessageId: 'mock-message-id' })
    })

    mockConfig = {
      requireString: jest.fn().mockImplementation((key: string) => {
        const configValues: Record<string, string> = {
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_25',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_30',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_50',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_60',
          REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75: 'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_75',
          PROFILE_URL: 'https://decentraland.org/profile',
          ENV: 'dev',
          REFERRAL_METABASE_DASHBOARD: 'https://dashboard.decentraland.systems/1234'
        }
        return Promise.resolve(configValues[key])
      }),
      requireNumber: jest.fn().mockImplementation((key: string) => {
        const configValues: Record<string, number> = {
          REFERRAL_MAX_IP_MATCHES: MAX_IP_MATCHES,
          REFERRAL_MIN_LOGIN_DAYS: 3,
          REFERRAL_FIVE_MINUTES_IN_MS: 5 * 60 * 1000
        }
        return Promise.resolve(configValues[key])
      }),
      getNumber: jest.fn().mockImplementation((key: string) => {
        const configValues: Record<string, number> = {
          REFERRAL_REWARD_MAX_ATTEMPTS: REWARD_MAX_ATTEMPTS,
          REFERRAL_REWARD_CLAIM_LEASE_MS: REWARD_CLAIM_LEASE_MS
        }
        return Promise.resolve(configValues[key])
      })
    }

    mockRewards = {
      sendReward: jest.fn().mockResolvedValue([{ image: 'test-image.png', rarity: 'common' }]),
      requestTimeoutMs: REWARD_REQUEST_TIMEOUT_MS
    }

    mockEmail = {
      sendEmail: jest.fn().mockResolvedValue(undefined)
    }

    mockSlack = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    }

    mockRedis = {
      get: jest.fn(),
      put: jest.fn().mockResolvedValue(undefined)
    }

    referralComponent = await createReferralComponent({
      referralDb: mockReferralDb,
      logs: { getLogger: () => mockLogger },
      sns: mockSns,
      config: mockConfig,
      rewards: mockRewards,
      email: mockEmail,
      slack: mockSlack,
      redis: mockRedis
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when starting up with a claim lease no longer than the reward request timeout', () => {
    let thrown: unknown

    beforeEach(async () => {
      mockRewards.requestTimeoutMs = REWARD_CLAIM_LEASE_MS

      thrown = await createReferralComponent({
        referralDb: mockReferralDb,
        logs: { getLogger: () => mockLogger },
        sns: mockSns,
        config: mockConfig,
        rewards: mockRewards,
        email: mockEmail,
        slack: mockSlack,
        redis: mockRedis
      }).catch((error) => error)
    })

    it('should refuse to start rather than let a lease expire while an issuance is in flight', () => {
      expect(thrown).toMatchObject({
        message: `REFERRAL_REWARD_CLAIM_LEASE_MS (${REWARD_CLAIM_LEASE_MS}ms) must be at least ${REWARD_CLAIM_LEASE_MS * 2}ms, 2x the reward request timeout of ${REWARD_CLAIM_LEASE_MS}ms`
      })
    })
  })

  describe('when creating a referral', () => {
    const validReferrer = '0x1234567890123456789012345678901234567890'
    const validInvitedUser = '0x0987654321098765432109876543210987654321'
    let validInput: { referrer: string; invitedUser: string; invitedUserIP: string }
    let selfReferralInput: { referrer: string; invitedUser: string; invitedUserIP: string }
    let address: string
    let invalidInput: { referrer: string; invitedUser: string; invitedUserIP: string }
    let validIP: string

    beforeEach(() => {
      validIP = '192.168.1.1'
      validInput = {
        referrer: validReferrer,
        invitedUser: validInvitedUser,
        invitedUserIP: validIP
      }
      selfReferralInput = {
        referrer: validReferrer,
        invitedUser: validReferrer,
        invitedUserIP: validIP
      }

      invalidInput = { ...validInput, referrer: address }
    })

    describe('with a valid referral input', () => {
      let mockCreatedAt: number

      beforeEach(() => {
        mockCreatedAt = Date.now()
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
        mockReferralDb.createReferral.mockResolvedValueOnce({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING,
          created_at: mockCreatedAt
        })
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING,
            created_at: mockCreatedAt
          }
        ])
      })

      it('should create referral successfully', async () => {
        const result = await referralComponent.create(validInput)

        expect(mockReferralDb.hasReferralProgress).toHaveBeenCalledWith(validInvitedUser)
        expect(mockReferralDb.createReferral).toHaveBeenCalledWith({
          referrer: validReferrer.toLowerCase(),
          invitedUser: validInvitedUser.toLowerCase(),
          invitedUserIP: validIP
        })
        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          referrer: validReferrer.toLowerCase(),
          limit: 2
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Creating referral', {
          referrer: validReferrer.toLowerCase(),
          invitedUser: validInvitedUser.toLowerCase(),
          invitedUserIP: validIP
        })
        expect(mockLogger.info).toHaveBeenCalledWith(
          `Referral from ${validReferrer.toLowerCase()} to ${validInvitedUser.toLowerCase()} created successfully`
        )
        expect(result).toEqual({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING,
          created_at: mockCreatedAt
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
        let caseInsensitiveSelfReferral: { referrer: string; invitedUser: string; invitedUserIP: string }

        beforeEach(() => {
          caseInsensitiveSelfReferral = {
            referrer: '0x1234567890123456789012345678901234567abc',
            invitedUser: '0x1234567890123456789012345678901234567ABC',
            invitedUserIP: validIP
          }
        })

        it('should throw SelfReferralError', async () => {
          await expect(referralComponent.create(caseInsensitiveSelfReferral)).rejects.toThrow(
            new SelfReferralError(caseInsensitiveSelfReferral.referrer.toLowerCase())
          )
        })
      })
    })

    describe('when a concurrent create wins the insert race', () => {
      beforeEach(() => {
        // Passes the existence pre-check, then the unique index rejects the insert.
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.createReferral.mockResolvedValueOnce(null)
      })

      describe('and the stored referral has the same referrer', () => {
        let stored: { referrer: string; invited_user: string; status: ReferralProgressStatus; created_at: number }

        beforeEach(() => {
          stored = {
            referrer: validReferrer.toLowerCase(),
            invited_user: validInvitedUser.toLowerCase(),
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([]).mockResolvedValueOnce([stored])
        })

        it('should resolve to the stored referral instead of writing a second attribution', async () => {
          const result = await referralComponent.create(validInput)

          expect(result).toEqual(stored)
        })
      })

      describe('and the stored referral has a different referrer', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([]).mockResolvedValueOnce([
            {
              referrer: '0x1111111111111111111111111111111111111111',
              invited_user: validInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: Date.now()
            }
          ])
        })

        it('should throw ReferralAlreadyExistsError', async () => {
          await expect(referralComponent.create(validInput)).rejects.toThrow(
            new ReferralAlreadyExistsError(validInvitedUser.toLowerCase())
          )
        })
      })
    })

    describe('when referral already exists', () => {
      beforeEach(() => {
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(true)
      })

      describe('and it belongs to a different referrer', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: '0x1111111111111111111111111111111111111111',
              invited_user: validInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: Date.now()
            }
          ])
        })

        it('should throw ReferralAlreadyExistsError', async () => {
          await expect(referralComponent.create(validInput)).rejects.toThrow(
            new ReferralAlreadyExistsError(validInvitedUser.toLowerCase())
          )
        })
      })

      describe('and it belongs to the same referrer', () => {
        let existing: { referrer: string; invited_user: string; status: ReferralProgressStatus; created_at: number }

        beforeEach(() => {
          existing = {
            referrer: validReferrer.toLowerCase(),
            invited_user: validInvitedUser.toLowerCase(),
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([existing])
        })

        it('should return the existing referral without creating a new one (idempotent)', async () => {
          const result = await referralComponent.create(validInput)

          expect(result).toEqual(existing)
          expect(mockReferralDb.createReferral).not.toHaveBeenCalled()
        })
      })
    })

    describe('when suspicious timing is detected', () => {
      let newCreatedAt: number
      let previousCreatedAt: number
      let previousInvitedUser: string

      beforeEach(() => {
        newCreatedAt = Date.now()
        previousCreatedAt = newCreatedAt - 2 * 60 * 1000 // 2 minutes earlier
        previousInvitedUser = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.createReferral.mockResolvedValueOnce({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING,
          created_at: newCreatedAt
        })
        mockSlack.sendMessage.mockResolvedValueOnce(undefined)
      })

      describe('and referrals are within 5 minutes', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer.toLowerCase(),
              invited_user: validInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: newCreatedAt
            },
            {
              referrer: validReferrer.toLowerCase(),
              invited_user: previousInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: previousCreatedAt
            }
          ])
        })

        it('should send Slack notification with timing details', async () => {
          await referralComponent.create(validInput)

          expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            limit: 2
          })

          expect(mockSlack.sendMessage).toHaveBeenCalledWith(
            referralSuspiciousTimingMessage(
              validReferrer.toLowerCase(),
              newCreatedAt.toString(),
              previousCreatedAt.toString(),
              2, // 2 minutes difference
              new Date(newCreatedAt).toISOString(),
              new Date(previousCreatedAt).toISOString(),
              true, // isDev
              'https://dashboard.decentraland.systems/1234'
            )
          )
        })
      })

      describe('and referrals are more than 5 minutes apart', () => {
        let oldCreatedAt: number

        beforeEach(() => {
          oldCreatedAt = newCreatedAt - 6 * 60 * 1000 // 6 minutes earlier
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer.toLowerCase(),
              invited_user: validInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: newCreatedAt
            },
            {
              referrer: validReferrer.toLowerCase(),
              invited_user: previousInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: oldCreatedAt
            }
          ])
        })

        it('should not send Slack notification', async () => {
          await referralComponent.create(validInput)

          expect(mockSlack.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({
              text: expect.stringContaining('Suspicious Referral Timing')
            })
          )
        })
      })

      describe('and there is only one referral', () => {
        beforeEach(() => {
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer.toLowerCase(),
              invited_user: validInvitedUser.toLowerCase(),
              status: ReferralProgressStatus.PENDING,
              created_at: newCreatedAt
            }
          ])
        })

        it('should not send Slack notification', async () => {
          await referralComponent.create(validInput)

          expect(mockSlack.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({
              text: expect.stringContaining('Suspicious Referral Timing')
            })
          )
        })
      })
    })

    describe('when IP validation fails', () => {
      describe('and the invited user has been created with the rejected ip match status', () => {
        beforeEach(() => {
          mockSlack.sendMessage.mockResolvedValueOnce(undefined)
          mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
          mockReferralDb.createReferral.mockResolvedValueOnce({
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.REJECTED_IP_MATCH
          })
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
        })

        it('should throw ReferralInvalidInputError, create rejected IP match record and send Slack notification', async () => {
          await expect(referralComponent.create(validInput)).rejects.toThrow(
            new ReferralInvalidInputError(
              `Invited user has already reached the maximum number of ${MAX_IP_MATCHES} referrals from the same IP: ${validIP}`
            )
          )

          expect(mockReferralDb.createReferral).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            invitedUser: validInvitedUser.toLowerCase(),
            invitedUserIP: validIP
          })

          expect(mockSlack.sendMessage).toHaveBeenCalledWith(
            referralIpMatchRejectionMessage(
              validReferrer,
              validInvitedUser,
              validIP,
              true,
              'https://dashboard.decentraland.systems/1234',
              MAX_IP_MATCHES
            )
          )
        })

        describe('and Slack notification fails', () => {
          beforeEach(() => {
            mockSlack.sendMessage.mockReset()
            mockSlack.sendMessage.mockRejectedValueOnce(new Error('Slack service unavailable'))
            mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
            mockReferralDb.createReferral.mockResolvedValueOnce({
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.REJECTED_IP_MATCH
            })
          })

          it('should still throw error even', async () => {
            await expect(referralComponent.create(validInput)).rejects.toThrow(
              new ReferralInvalidInputError(
                `Invited user has already reached the maximum number of ${MAX_IP_MATCHES} referrals from the same IP: ${validIP}`
              )
            )

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to send IP rejection Slack notification', {
              invitedUser: validInvitedUser.toLowerCase(),
              referrer: validReferrer.toLowerCase(),
              invitedUserIP: validIP,
              error: 'Slack service unavailable'
            })
          })
        })
      })

      describe('and the invited user has been created with a non rejected status', () => {
        beforeEach(() => {
          mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
          mockReferralDb.createReferral.mockResolvedValueOnce({
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING
          })

          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.PENDING,
              created_at: Date.now()
            }
          ])
        })

        it('should create referral successfully when IP matches equals maximum', async () => {
          const result = await referralComponent.create(validInput)

          expect(mockReferralDb.createReferral).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            invitedUser: validInvitedUser.toLowerCase(),
            invitedUserIP: validIP
          })
          expect(result).toEqual({
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING
          })
        })
      })
    })

    describe('and the referrer is on deny list', () => {
      let denyListedReferrer: string
      let denyListedInput: { referrer: string; invitedUser: string; invitedUserIP: string }

      beforeEach(() => {
        denyListedReferrer = '0x1111111111111111111111111111111111111111'
        denyListedInput = {
          referrer: denyListedReferrer,
          invitedUser: validInvitedUser,
          invitedUserIP: validIP
        }
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [
                { wallet: denyListedReferrer.toLowerCase() },
                { wallet: '0x2222222222222222222222222222222222222222' }
              ]
            })
        } as any)
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
      })

      it('should throw ReferralInvalidInputError when referrer is deny listed', async () => {
        await expect(referralComponent.create(denyListedInput)).rejects.toThrow(
          new ReferralInvalidInputError(
            `Referrer is on the deny list ${denyListedReferrer.toLowerCase()}, ${denyListedInput.invitedUserIP}`
          )
        )

        expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://config.decentraland.org/denylist.json')
        expect(mockReferralDb.createReferral).not.toHaveBeenCalled()
      })
    })

    describe('and deny list fetch fails', () => {
      beforeEach(() => {
        jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'))
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([])
        mockReferralDb.createReferral.mockResolvedValueOnce({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING
        })

        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
        ])
      })

      it('should create referral successfully when deny list fetch fails', async () => {
        const result = await referralComponent.create(validInput)

        expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://config.decentraland.org/denylist.json')
        expect(mockLogger.error).toHaveBeenCalledWith('Error fetching deny list: Network error')
        expect(mockReferralDb.createReferral).toHaveBeenCalledWith({
          referrer: validReferrer.toLowerCase(),
          invitedUser: validInvitedUser.toLowerCase(),
          invitedUserIP: validInput.invitedUserIP
        })
        expect(result).toEqual({
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.PENDING
        })
      })
    })
  })

  describe('when updating referral progress', () => {
    const validInvitedUser = '0x1234567890123456789012345678901234567890'

    beforeEach(() => {
      mockReferralDb.findReferralProgress.mockResolvedValue([])
    })

    describe('with valid data and pending status', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: '0x0987654321098765432109876543210987654321',
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
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

    describe('and the referrer is on deny list', () => {
      let denyListedReferrer: string

      beforeEach(() => {
        denyListedReferrer = '0x1111111111111111111111111111111111111111'
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [{ wallet: denyListedReferrer.toLowerCase() }]
            })
        } as any)
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: denyListedReferrer.toLowerCase(),
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.PENDING,
            invited_user_ip: '192.168.1.1'
          }
        ])
      })

      it('should throw ReferralInvalidInputError when referrer is deny listed', async () => {
        await expect(
          referralComponent.updateProgress(validInvitedUser, ReferralProgressStatus.SIGNED_UP)
        ).rejects.toThrow(
          new ReferralInvalidInputError(`Referrer is on the deny list ${denyListedReferrer.toLowerCase()}, 192.168.1.1`)
        )

        expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://config.decentraland.org/denylist.json')
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
      })
    })
  })

  describe('when finalizing referral', () => {
    const validInvitedUser = '0x1234567890123456789012345678901234567890'
    const validReferrer = '0x0987654321098765432109876543210987654321'
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000

    beforeEach(() => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] })
      } as any)
      mockReferralDb.findReferralProgress.mockResolvedValue([])
    })

    describe(`with valid signed up status and 3 login days in Redis cache`, () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
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
        expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
        expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [], { EX: 1 })
      })
    })

    describe('when user has insufficient login days in Redis cache', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02'])
      })

      it('should add current day to cache and return without processing', async () => {
        const today = new Date().toISOString().split('T')[0]

        const result = await referralComponent.finalizeReferral(validInvitedUser)
        expect(result).toBeUndefined()

        expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
        expect(mockRedis.put).toHaveBeenCalledWith(
          `referral:invited-user:${validInvitedUser}`,
          ['2024-01-01', '2024-01-02', today],
          { noTTL: true }
        )
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })

    describe('when user has no login days in Redis cache', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockRedis.get.mockResolvedValueOnce([])
      })

      it('should add current day to cache and return without processing', async () => {
        const today = new Date().toISOString().split('T')[0]

        const result = await referralComponent.finalizeReferral(validInvitedUser)
        expect(result).toBeUndefined()

        expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
        expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [today], {
          noTTL: true
        })
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })

    describe('when user has exactly minimum required login days', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
      })

      it('should clear Redis cache and finalize referral successfully', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
        expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [], { EX: 1 })
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: Events.Type.REFERRAL,
            subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED
          })
        )
      })
    })

    describe('when user has more than minimum required login days', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'])
      })

      it('should clear Redis cache and finalize referral successfully', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
        expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [], { EX: 1 })
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: Events.Type.REFERRAL,
            subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED
          })
        )
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
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
          mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
          // Only this tier is outstanding; every lower tier was granted by an earlier event.
          mockReferralDb.claimTierReward.mockImplementation(async (_referrer: string, claimedTier: number) =>
            claimedTier === invitedUsers ? { id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN } : null
          )
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

          expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
          expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [], { EX: 1 })
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

    describe('when a concurrent finalize already granted the tier', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        // The guarded UPDATE affects no rows because another request already granted it.
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(0)
      })

      it('should not send a reward nor publish an event', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
        expect(mockReferralDb.countAcceptedInvitesByReferrer).not.toHaveBeenCalled()
        expect(mockRewards.sendReward).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
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
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
          mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        })

        it(`should send the notification with the correct tier for ${invitedUsers} invited users and not send reward`, async () => {
          await referralComponent.finalizeReferral(validInvitedUser)

          expect(mockRedis.get).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`)
          expect(mockRedis.put).toHaveBeenCalledWith(`referral:invited-user:${validInvitedUser}`, [], { EX: 1 })
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
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(invitedUsers)
          mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
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

    describe('when the reward server issues nothing usable', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockRejectedValueOnce(
          new RewardIssuanceError('response contained an empty reward list')
        )

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not crash the finalize flow on the missing reward payload', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to issue tier reward; nothing was issued, so it stays claimable for a later event',
          expect.objectContaining({
            tier: 5,
            error: 'Reward server issued no usable reward: response contained an empty reward list'
          })
        )
      })

      it('should not mark the tier as granted', () => {
        expect(mockReferralDb.markTierRewardGranted).not.toHaveBeenCalled()
      })

      it('should not record a reward image for a reward that was never issued', () => {
        expect(mockReferralDb.setReferralRewardImage).not.toHaveBeenCalled()
      })

      it('should record the failure so the tier is retried by a later event', () => {
        expect(mockReferralDb.recordTierRewardFailure).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          'Reward server issued no usable reward: response contained an empty reward list'
        )
      })

      it('should not park a tier the server proved it never issued', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).not.toHaveBeenCalled()
      })
    })

    describe('when the reward server times out after the request was sent', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        // What @dcl/fetch-component throws once its timeout aborts the in-flight request.
        mockRewards.sendReward.mockRejectedValueOnce(new Error('Request aborted (timed out)'))

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should park the grant for manual review instead of leaving it claimable', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          'Request aborted (timed out)'
        )
      })

      it('should not record it as a retryable failure, because the reward may already exist', () => {
        expect(mockReferralDb.recordTierRewardFailure).not.toHaveBeenCalled()
      })

      it('should not mark the tier as granted, because the reward was never confirmed', () => {
        expect(mockReferralDb.markTierRewardGranted).not.toHaveBeenCalled()
      })

      it('should raise an alertable error telling an operator the grant needs reconciling', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'MANUAL REVIEW REQUIRED: tier reward issuance ended with an unknown outcome, so the reward may already exist upstream. The grant is parked and will not be retried until a human reconciles it with the reward provider',
          expect.objectContaining({ tier: 5, error: 'Request aborted (timed out)' })
        )
      })
    })

    describe('when the reward server answers a tier with a 5xx', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockRejectedValueOnce(new RewardRequestFailedError(503, 'https://rewards/api/rewards'))

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should park the grant, since the reward can be created before the handler fails', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          'Failed to fetch https://rewards/api/rewards: 503'
        )
      })

      it('should not leave the tier plainly retryable', () => {
        expect(mockReferralDb.recordTierRewardFailure).not.toHaveBeenCalled()
      })
    })

    describe('when the reward server rejects a tier with a 4xx', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockRejectedValueOnce(new RewardRequestFailedError(422, 'https://rewards/api/rewards'))

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should keep the tier retryable, since the server refused before creating anything', () => {
        expect(mockReferralDb.recordTierRewardFailure).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          'Failed to fetch https://rewards/api/rewards: 422'
        )
      })

      it('should not park a tier that was definitively never issued', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).not.toHaveBeenCalled()
      })
    })

    describe('when a worker whose lease expired finishes issuing the reward', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward5.png', rarity: null }])
        // Another worker re-claimed the tier meanwhile, so the row carries a newer token and the
        // fenced UPDATE matches nothing.
        mockReferralDb.markTierRewardGranted.mockResolvedValueOnce(0)

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should attempt the close fenced on its own now-superseded token', () => {
        expect(mockReferralDb.markTierRewardGranted).toHaveBeenCalledWith(validReferrer.toLowerCase(), 5, CLAIM_TOKEN)
      })

      it('should raise an alertable error naming the possible duplicate', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'MANUAL REVIEW REQUIRED: tier reward was issued but the claim is no longer ours, so a duplicate reward may exist. Skipping notifications',
          expect.objectContaining({ tier: 5 })
        )
      })

      it('should park the row so a reward known to exist cannot stay retryable behind the newer claim', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          null,
          'issued by a worker whose claim was superseded'
        )
      })

      it('should not fence that park on its own superseded token, or it would match nothing', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).not.toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          expect.anything()
        )
      })
    })

    describe('when a superseded worker parks a row another worker already closed', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward5.png', rarity: null }])
        mockReferralDb.markTierRewardGranted.mockResolvedValueOnce(0)
        // The newer worker already reached a terminal state, so the unfenced park matches nothing.
        mockReferralDb.markTierRewardNeedsManualReview.mockResolvedValueOnce(0)

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not raise a lost-claim alert, since an unfenced park matching nothing is expected', () => {
        expect(mockLogger.error).not.toHaveBeenCalledWith(
          'MANUAL REVIEW REQUIRED: could not park a tier reward grant because the claim is no longer ours',
          expect.anything()
        )
      })
    })

    describe('when the reward server fails and a later event retries the tier', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }
      let grantedTiers: number[]

      beforeEach(async () => {
        grantedTiers = []
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }

        // Models the durable grant row: claimable while pending, closed for good once granted.
        mockReferralDb.claimTierReward.mockImplementation(async (_referrer: string, tier: number) =>
          grantedTiers.includes(tier) ? null : { id: `grant-${tier}`, attempts: 1, claim_token: CLAIM_TOKEN }
        )
        mockReferralDb.markTierRewardGranted.mockImplementation(async (_referrer: string, tier: number) => {
          grantedTiers.push(tier)
          return 1
        })

        mockReferralDb.findReferralProgress.mockResolvedValue([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValue(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(5)
        mockRedis.get.mockResolvedValue(['2024-01-01', '2024-01-02', '2024-01-03'])

        // Definitive non-issuance: the server answered and granted nothing, so a retry is safe.
        mockRewards.sendReward.mockRejectedValueOnce(new RewardIssuanceError('response contained an empty reward list'))
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward5.png', rarity: null }])

        await referralComponent.finalizeReferral(validInvitedUser)
        await referralComponent.finalizeReferral(validInvitedUser)
        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should stop contacting the reward server once the reward has been issued', () => {
        expect(mockRewards.sendReward).toHaveBeenCalledTimes(2)
      })

      it('should ultimately issue the reward exactly once', () => {
        expect(mockReferralDb.markTierRewardGranted).toHaveBeenCalledTimes(1)
      })

      it('should close only the tier that was recovered', () => {
        expect(grantedTiers).toEqual([5])
      })

      it('should record the reward image exactly once', () => {
        expect(mockReferralDb.setReferralRewardImage).toHaveBeenCalledTimes(1)
      })
    })

    describe('when the reward was issued but the grant could not be closed', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward5.png', rarity: null }])
        mockReferralDb.markTierRewardGranted.mockRejectedValueOnce(new Error('connection terminated'))

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should raise an alertable error naming the re-issue risk', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'MANUAL REVIEW REQUIRED: tier reward was issued but the grant could not be closed; parking it so a later event cannot re-issue it',
          expect.objectContaining({ tier: 5, error: 'connection terminated' })
        )
      })

      it('should park the grant so the expiring lease cannot hand the tier to another worker', () => {
        expect(mockReferralDb.markTierRewardNeedsManualReview).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN,
          'issued but not closed: connection terminated'
        )
      })

      it('should not record it as a retryable issuance failure', () => {
        expect(mockReferralDb.recordTierRewardFailure).not.toHaveBeenCalled()
      })

      it('should still publish the tier-reached event for the reward that was issued', () => {
        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({ subType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED })
        )
      })
    })

    describe('when another worker closed the grant before this one could', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward5.png', rarity: null }])
        mockReferralDb.markTierRewardGranted.mockResolvedValueOnce(0)

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not publish a second tier-reached event for the same tier', () => {
        expect(mockSns.publishMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ subType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED })
        )
      })

      it('should not write a second reward image row', () => {
        expect(mockReferralDb.setReferralRewardImage).not.toHaveBeenCalled()
      })
    })

    describe('when recording an issuance failure itself fails', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }
      let thrown: Error | undefined

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockRejectedValueOnce(new RewardIssuanceError('response contained no data array'))
        mockReferralDb.recordTierRewardFailure.mockRejectedValueOnce(new Error('connection terminated'))

        thrown = await referralComponent.finalizeReferral(validInvitedUser).catch((error) => error)
      })

      it('should not propagate the bookkeeping error out of the finalize', () => {
        expect(thrown).toBeUndefined()
      })

      it('should raise an alertable error for the failed bookkeeping', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to record a tier reward failure',
          expect.objectContaining({ tier: 5, error: 'connection terminated' })
        )
      })
    })

    describe('when a concurrent finalize pushed the count past a tier boundary', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }
      let claimedTiers: number[]

      beforeEach(async () => {
        claimedTiers = []
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        // Both concurrent finalizes committed before either counted, so the tier-5 boundary
        // is never observed as an exact count.
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(6)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockImplementation(async (_referrer: string, tier: number) => {
          claimedTiers.push(tier)
          return { id: `grant-${tier}`, attempts: 1, claim_token: CLAIM_TOKEN }
        })
        mockRewards.sendReward.mockResolvedValue([{ image: 'reward5.png', rarity: null }])

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should still grant the skipped tier instead of dropping it', () => {
        expect(mockRewards.sendReward).toHaveBeenCalledWith(
          'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5',
          validReferrer.toLowerCase()
        )
      })

      it('should only consider tiers at or below the accepted invite count', () => {
        expect(claimedTiers).toEqual([5])
      })

      it('should announce the tier that was unlocked rather than the live invite count', () => {
        expect(mockSns.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            subType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED,
            metadata: expect.objectContaining({ tier: 1, invitedUsers: 5 })
          })
        )
      })
    })

    describe('when several tiers were crossed while issuance was failing', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(20)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValue({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValue([{ image: 'reward.png', rarity: null }])

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should back-fill every outstanding tier in ascending order', () => {
        expect(mockRewards.sendReward.mock.calls.map((call: string[]) => call[0])).toEqual([
          'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_5',
          'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_10',
          'REWARDS_API_KEY_BY_REFERRAL_INVITED_USERS_20'
        ])
      })
    })

    describe('when a tier reward fails but a later tier can still be issued', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(10)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValue({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockRejectedValueOnce(new RewardIssuanceError('response contained an empty reward list'))
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward10.png', rarity: null }])

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not let one failing tier block the tiers after it', () => {
        expect(mockReferralDb.markTierRewardGranted).toHaveBeenCalledWith(validReferrer.toLowerCase(), 10, CLAIM_TOKEN)
      })

      it('should leave the failed tier unclosed so it is retried later', () => {
        expect(mockReferralDb.markTierRewardGranted).not.toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          5,
          CLAIM_TOKEN
        )
      })
    })

    describe('when an ambiguous failure parks a tier and a later event runs', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }
      let parkedTiers: number[]

      beforeEach(async () => {
        parkedTiers = []
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }

        // Models the durable grant row: a parked tier leaves the pending state for good, so the
        // claim predicate can never match it again.
        mockReferralDb.claimTierReward.mockImplementation(async (_referrer: string, tier: number) =>
          parkedTiers.includes(tier) ? null : { id: `grant-${tier}`, attempts: 1, claim_token: CLAIM_TOKEN }
        )
        mockReferralDb.markTierRewardNeedsManualReview.mockImplementation(async (_referrer: string, tier: number) => {
          parkedTiers.push(tier)
          return 1
        })

        mockReferralDb.findReferralProgress.mockResolvedValue([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValue(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValue(5)
        mockRedis.get.mockResolvedValue(['2024-01-01', '2024-01-02', '2024-01-03'])

        mockRewards.sendReward.mockRejectedValueOnce(new Error('Request aborted (timed out)'))
        mockRewards.sendReward.mockResolvedValue([{ image: 'reward5.png', rarity: null }])

        await referralComponent.finalizeReferral(validInvitedUser)
        await referralComponent.finalizeReferral(validInvitedUser)
        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should never contact the reward server again for the parked tier', () => {
        expect(mockRewards.sendReward).toHaveBeenCalledTimes(1)
      })

      it('should park the tier exactly once', () => {
        expect(parkedTiers).toEqual([5])
      })

      it('should never close the parked grant on its own', () => {
        expect(mockReferralDb.markTierRewardGranted).not.toHaveBeenCalled()
      })
    })

    describe('when the tier was already granted by a previous event', () => {
      let signedUpProgress: { referrer: string; invited_user: string; status: ReferralProgressStatus }

      beforeEach(async () => {
        signedUpProgress = {
          referrer: validReferrer,
          invited_user: validInvitedUser,
          status: ReferralProgressStatus.SIGNED_UP
        }
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([signedUpProgress])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValue(null)

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not contact the reward server again', () => {
        expect(mockRewards.sendReward).not.toHaveBeenCalled()
      })

      it('should not publish a duplicate tier-reached event', () => {
        expect(mockSns.publishMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ subType: Events.SubType.Referral.REFERRAL_NEW_TIER_REACHED })
        )
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
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
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
      beforeEach(async () => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(5)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        mockReferralDb.claimTierReward.mockResolvedValueOnce({ id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN })
        mockRewards.sendReward.mockResolvedValueOnce([{ image: 'reward.png', rarity: null }])
        mockSns.publishMessage.mockRejectedValueOnce(new Error('SNS publish failed'))

        await referralComponent.finalizeReferral(validInvitedUser)
      })

      it('should not propagate the notification failure to the caller', () => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to publish referral event',
          expect.objectContaining({ error: 'SNS publish failed' })
        )
      })

      it('should still update referral progress to tier granted', () => {
        expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
          validInvitedUser.toLowerCase(),
          ReferralProgressStatus.TIER_GRANTED
        )
      })

      it('should still issue the tier reward the notification was announcing', () => {
        expect(mockRewards.sendReward).toHaveBeenCalledTimes(1)
      })
    })

    describe('when referral reaches 100 invited users', () => {
      beforeEach(() => {
        mockSlack.sendMessage.mockResolvedValueOnce(undefined)
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer,
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP
          }
        ])
        mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(100)
        mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])
        // Only the IRL swag milestone is outstanding; the reward tiers were granted earlier.
        mockReferralDb.claimTierReward.mockImplementation(async (_referrer: string, claimedTier: number) =>
          claimedTier === 100 ? { id: 'grant-id', attempts: 1, claim_token: CLAIM_TOKEN } : null
        )
      })

      it('should send Slack notification', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockSlack.sendMessage).toHaveBeenCalledWith(
          referral100InvitesReachedMessage(validReferrer, true, 'https://dashboard.decentraland.systems/1234')
        )
      })

      it('should close the milestone so a later event does not notify again', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.markTierRewardGranted).toHaveBeenCalledWith(
          validReferrer.toLowerCase(),
          100,
          CLAIM_TOKEN
        )
      })

      describe('and Slack notification fails', () => {
        beforeEach(async () => {
          mockSlack.sendMessage.mockReset()
          mockSlack.sendMessage.mockRejectedValueOnce(new Error('Slack service unavailable'))
          mockReferralDb.findReferralProgress.mockResolvedValueOnce([
            {
              referrer: validReferrer,
              invited_user: validInvitedUser,
              status: ReferralProgressStatus.SIGNED_UP
            }
          ])
          mockReferralDb.updateReferralProgress.mockResolvedValueOnce(1)
          mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(100)
          mockRedis.get.mockResolvedValueOnce(['2024-01-01', '2024-01-02', '2024-01-03'])

          await referralComponent.finalizeReferral(validInvitedUser)
        })

        it('should still finalize the referral to tier granted', () => {
          expect(mockReferralDb.updateReferralProgress).toHaveBeenCalledWith(
            validInvitedUser.toLowerCase(),
            ReferralProgressStatus.TIER_GRANTED
          )
        })

        it('should still publish the invited-users-accepted event', () => {
          expect(mockSns.publishMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              type: Events.Type.REFERRAL,
              subType: Events.SubType.Referral.REFERRAL_INVITED_USERS_ACCEPTED
            })
          )
        })

        it('should leave the milestone unclosed so a later event can notify', () => {
          expect(mockReferralDb.markTierRewardGranted).not.toHaveBeenCalledWith(
            validReferrer.toLowerCase(),
            100,
            CLAIM_TOKEN
          )
        })

        it('should record the Slack failure against the pending milestone', () => {
          expect(mockReferralDb.recordTierRewardFailure).toHaveBeenCalledWith(
            validReferrer.toLowerCase(),
            100,
            CLAIM_TOKEN,
            'Slack service unavailable'
          )
        })

        it('should keep the milestone retryable rather than park it, since a duplicate ping is harmless', () => {
          expect(mockReferralDb.markTierRewardNeedsManualReview).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the referrer is on deny list', () => {
      let denyListedReferrer: string

      beforeEach(() => {
        denyListedReferrer = '0x1111111111111111111111111111111111111111'

        // Reset fetch mock and set up new response
        jest.mocked(global.fetch).mockReset()
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [{ wallet: denyListedReferrer.toLowerCase() }]
            })
        } as any)

        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: denyListedReferrer.toLowerCase(),
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.SIGNED_UP,
            invited_user_ip: '192.168.1.1',
            first_login_at: threeDaysAgo
          }
        ])
      })

      it('should throw ReferralInvalidInputError when referrer is deny listed', async () => {
        await expect(referralComponent.finalizeReferral(validInvitedUser)).rejects.toThrow(
          new ReferralInvalidInputError(`Referrer is on the deny list ${denyListedReferrer.toLowerCase()}, 192.168.1.1`)
        )

        expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://config.decentraland.org/denylist.json')
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })

    describe('when referral has REJECTED_IP_MATCH status', () => {
      beforeEach(() => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: validReferrer.toLowerCase(),
            invited_user: validInvitedUser,
            status: ReferralProgressStatus.REJECTED_IP_MATCH,
            invited_user_ip: '192.168.1.1'
          }
        ])
      })

      it('should not process the referral and not publish event', async () => {
        await referralComponent.finalizeReferral(validInvitedUser)

        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
        expect(mockLogger.info).toHaveBeenCalledWith('Avoiding finalizing referral', {
          invitedUser: validInvitedUser.toLowerCase(),
          status: ReferralProgressStatus.REJECTED_IP_MATCH,
          invitedUserIP: '192.168.1.1',
          referrer: validReferrer.toLowerCase()
        })
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

  describe('when setting referral email', () => {
    const validReferrer = '0x1234567890123456789012345678901234567890'
    const validEmail = 'test@example.com'

    beforeEach(() => {
      mockReferralDb.getLastReferralEmailByReferrer.mockResolvedValue(null)
      mockReferralDb.setReferralEmail.mockResolvedValue({
        id: 'test-id',
        referrer: validReferrer.toLowerCase(),
        email: validEmail,
        created_at: Date.now(),
        updated_at: Date.now()
      })
    })

    describe('with valid data', () => {
      describe('when email sending is successful', () => {
        beforeEach(() => {
          mockEmail.sendEmail.mockResolvedValue(undefined)
        })

        it('should set referral email successfully', async () => {
          const result = await referralComponent.setReferralEmail({
            referrer: validReferrer,
            email: validEmail
          })

          expect(mockReferralDb.getLastReferralEmailByReferrer).toHaveBeenCalledWith(validReferrer.toLowerCase())
          expect(mockReferralDb.setReferralEmail).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            email: validEmail
          })
          expect(mockEmail.sendEmail).toHaveBeenCalledWith(
            'marketing@decentraland.org',
            '[Action Needed] IRL Swag Referral Tier Unlocked',
            `A user has unlocked the IRL Swag Referral Tier and provided the following email for contact: ${validEmail}`
          )
          expect(mockLogger.info).toHaveBeenCalledWith('Setting referral email', {
            referrer: validReferrer.toLowerCase()
          })
          expect(mockLogger.info).toHaveBeenCalledWith('Marketing email sent successfully', {
            referrer: validReferrer.toLowerCase()
          })
          expect(mockLogger.info).toHaveBeenCalledWith('Referral email set successfully', {
            referrer: validReferrer.toLowerCase()
          })
          expect(result).toEqual({
            id: 'test-id',
            referrer: validReferrer.toLowerCase(),
            email: validEmail,
            created_at: expect.any(Number),
            updated_at: expect.any(Number)
          })
        })
      })

      describe('when email sending fails', () => {
        beforeEach(() => {
          mockEmail.sendEmail.mockRejectedValue(new Error('Email service unavailable'))
        })

        it('should still save referral email and log warning', async () => {
          const result = await referralComponent.setReferralEmail({
            referrer: validReferrer,
            email: validEmail
          })

          expect(mockReferralDb.setReferralEmail).toHaveBeenCalledWith({
            referrer: validReferrer.toLowerCase(),
            email: validEmail
          })
          expect(mockLogger.warn).toHaveBeenCalledWith('Failed to send marketing email, but referral email was saved', {
            referrer: validReferrer.toLowerCase(),
            error: 'Email service unavailable'
          })
          expect(mockLogger.info).toHaveBeenCalledWith('Referral email set successfully', {
            referrer: validReferrer.toLowerCase()
          })
          expect(result).toEqual({
            id: 'test-id',
            referrer: validReferrer.toLowerCase(),
            email: validEmail,
            created_at: expect.any(Number),
            updated_at: expect.any(Number)
          })
        })
      })
    })

    describe('with invalid email format', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(
          referralComponent.setReferralEmail({
            referrer: validReferrer,
            email: 'invalid-email'
          })
        ).rejects.toThrow(new ReferralInvalidInputError('Invalid email format'))
      })
    })

    describe('with empty email', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(
          referralComponent.setReferralEmail({
            referrer: validReferrer,
            email: ''
          })
        ).rejects.toThrow(new ReferralInvalidInputError('Email is required'))
      })
    })

    describe('with whitespace only email', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(
          referralComponent.setReferralEmail({
            referrer: validReferrer,
            email: '   '
          })
        ).rejects.toThrow(new ReferralInvalidInputError('Email is required'))
      })
    })

    describe('with invalid referrer address', () => {
      it('should throw ReferralInvalidInputError', async () => {
        await expect(
          referralComponent.setReferralEmail({
            referrer: 'invalid-address',
            email: validEmail
          })
        ).rejects.toThrow(new ReferralInvalidInputError('Invalid referrer address'))
      })
    })

    describe('and the referrer is on deny list', () => {
      let denyListedReferrer: string
      let denyListedInput: { referrer: string; email: string }

      beforeEach(() => {
        denyListedReferrer = '0x1111111111111111111111111111111111111111'
        denyListedInput = {
          referrer: denyListedReferrer,
          email: validEmail
        }
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [
                { wallet: denyListedReferrer.toLowerCase() },
                { wallet: '0x2222222222222222222222222222222222222222' }
              ]
            })
        } as any)
        mockReferralDb.countAcceptedInvitesByReferrer.mockResolvedValueOnce(100)
      })

      it('should throw ReferralInvalidInputError when referrer is deny listed', async () => {
        await expect(referralComponent.setReferralEmail(denyListedInput)).rejects.toThrow(
          new ReferralInvalidInputError(`Referrer is on the deny list ${denyListedReferrer.toLowerCase()}`)
        )

        expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://config.decentraland.org/denylist.json')
        expect(mockReferralDb.setReferralEmail).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the referrer is part of a banned referral chain', () => {
    const bannedOriginalReferrer = '0x1111111111111111111111111111111111111111'
    const referrerPreviouslyInvited = '0x3333333333333333333333333333333333333333'
    const invitedUser = '0x1234567890123456789012345678901234567890'

    beforeEach(() => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [{ wallet: bannedOriginalReferrer.toLowerCase() }] })
      } as any)
    })

    describe('when creating a referral', () => {
      it('should throw ReferralInvalidInputError', async () => {
        mockReferralDb.hasReferralProgress.mockResolvedValueOnce(false)
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: bannedOriginalReferrer.toLowerCase(),
            invited_user: referrerPreviouslyInvited.toLowerCase(),
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
        ])

        await expect(
          referralComponent.create({ referrer: referrerPreviouslyInvited, invitedUser, invitedUserIP: '192.168.1.1' })
        ).rejects.toThrow(
          new ReferralInvalidInputError(
            `Referrer is part of a banned referral chain ${referrerPreviouslyInvited.toLowerCase()}, 192.168.1.1`
          )
        )

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: referrerPreviouslyInvited.toLowerCase(),
          limit: 1
        })
        expect(mockReferralDb.createReferral).not.toHaveBeenCalled()
      })
    })

    describe('when updating referral progress', () => {
      it('should throw ReferralInvalidInputError', async () => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: referrerPreviouslyInvited.toLowerCase(),
            invited_user: invitedUser,
            status: ReferralProgressStatus.PENDING,
            invited_user_ip: '192.168.1.1'
          }
        ])
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: bannedOriginalReferrer.toLowerCase(),
            invited_user: referrerPreviouslyInvited.toLowerCase(),
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
        ])

        await expect(referralComponent.updateProgress(invitedUser, ReferralProgressStatus.SIGNED_UP)).rejects.toThrow(
          new ReferralInvalidInputError(
            `Referrer is part of a banned referral chain ${referrerPreviouslyInvited.toLowerCase()}, 192.168.1.1`
          )
        )

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: referrerPreviouslyInvited.toLowerCase(),
          limit: 1
        })
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
      })
    })

    describe('when finalizing referral', () => {
      it('should throw ReferralInvalidInputError', async () => {
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: referrerPreviouslyInvited.toLowerCase(),
            invited_user: invitedUser,
            status: ReferralProgressStatus.SIGNED_UP,
            invited_user_ip: '192.168.1.1'
          }
        ])
        mockReferralDb.findReferralProgress.mockResolvedValueOnce([
          {
            referrer: bannedOriginalReferrer.toLowerCase(),
            invited_user: referrerPreviouslyInvited.toLowerCase(),
            status: ReferralProgressStatus.PENDING,
            created_at: Date.now()
          }
        ])

        await expect(referralComponent.finalizeReferral(invitedUser)).rejects.toThrow(
          new ReferralInvalidInputError(
            `Referrer is part of a banned referral chain ${referrerPreviouslyInvited.toLowerCase()}, 192.168.1.1`
          )
        )

        expect(mockReferralDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: referrerPreviouslyInvited.toLowerCase(),
          limit: 1
        })
        expect(mockReferralDb.updateReferralProgress).not.toHaveBeenCalled()
        expect(mockSns.publishMessage).not.toHaveBeenCalled()
      })
    })
  })
})
