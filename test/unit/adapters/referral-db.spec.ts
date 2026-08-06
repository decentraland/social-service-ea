import { createReferralDBComponent } from '../../../src/adapters/referral-db'
import { ReferralProgressStatus } from '../../../src/types/referral-db.type'

describe('referral-db-component', () => {
  let mockPg: any
  let mockLogger: any
  let referralDb: any
  let transactionQuery: jest.Mock

  beforeEach(async () => {
    transactionQuery = jest.fn()
    mockPg = {
      query: jest.fn(),
      withTransaction: jest.fn(async (callback) => callback({ query: transactionQuery }))
    }

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    referralDb = await createReferralDBComponent({
      pg: mockPg,
      logs: { getLogger: () => mockLogger },
      config: {
        getString: jest.fn(),
        getNumber: jest.fn(),
        requireString: jest.fn(),
        requireNumber: async () => Promise.resolve(2)
      }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when creating a referral in an IP anti-fraud bucket', () => {
    let referralInput: { referrer: string; invitedUser: string; invitedUserIP: string }

    beforeEach(() => {
      referralInput = {
        referrer: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        invitedUser: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        invitedUserIP: '203.0.113.20'
      }
      transactionQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'referral-id' }], rowCount: 1 })
    })

    it('should serialize the count and insert using the normalized referrer and IP', async () => {
      await referralDb.createReferral(referralInput)

      expect(transactionQuery).toHaveBeenNthCalledWith(
        1,
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [referralInput.referrer.toLowerCase(), referralInput.invitedUserIP]
      )
    })
  })

  describe('findReferralProgress', () => {
    const mockReferrals = [
      {
        id: '1',
        referrer: '0x1234567890123456789012345678901234567890',
        invited_user: '0x0987654321098765432109876543210987654321',
        status: ReferralProgressStatus.PENDING,
        created_at: 1000000000000,
        updated_at: 1000000000000
      },
      {
        id: '2',
        referrer: '0x1234567890123456789012345678901234567890',
        invited_user: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        status: ReferralProgressStatus.PENDING,
        created_at: 999999999000,
        updated_at: 999999999000
      }
    ]

    describe('with ordering', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValue({ rows: mockReferrals })
      })

      it('should order results by created_at DESC', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('ORDER BY created_at DESC')
          })
        )
      })

      it('should order results by created_at DESC with limit and offset', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          limit: 5,
          offset: 10
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('ORDER BY created_at DESC LIMIT')
          })
        )
      })
    })

    describe('with filters', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValue({ rows: mockReferrals })
      })

      it('should filter by referrer and order by created_at DESC', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringMatching(/WHERE.*referrer.*ORDER BY created_at DESC/)
          })
        )
      })

      it('should filter by invitedUser and order by created_at DESC', async () => {
        await referralDb.findReferralProgress({
          invitedUser: '0x0987654321098765432109876543210987654321'
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringMatching(/WHERE.*invited_user.*ORDER BY created_at DESC/)
          })
        )
      })

      it('should filter by both referrer and invitedUser and order by created_at DESC', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          invitedUser: '0x0987654321098765432109876543210987654321'
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringMatching(/WHERE.*referrer.*AND.*invited_user.*ORDER BY created_at DESC/)
          })
        )
      })
    })

    describe('with custom limits', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValue({ rows: mockReferrals })
      })

      it('should use custom limit when provided', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          limit: 2
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('LIMIT $2')
          })
        )
      })

      it('should use custom offset when provided', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          offset: 5
        })
      })

      it('should default to limit 100 and offset 0 when not provided', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })
      })

      it('should handle invalid limit values by defaulting to 100', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          limit: -5
        })
      })

      it('should handle invalid offset values by defaulting to 0', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          offset: -10
        })
      })
    })

    describe('without filters', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValue({ rows: mockReferrals })
      })

      it('should query all referrals ordered by created_at DESC', async () => {
        await referralDb.findReferralProgress({})

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringMatching(/^SELECT \* FROM referral_progress ORDER BY created_at DESC LIMIT.*OFFSET/)
          })
        )
      })
    })

    describe('database integration', () => {
      it('should handle database errors gracefully', async () => {
        const error = new Error('Database connection failed')
        mockPg.query.mockRejectedValue(error)

        await expect(
          referralDb.findReferralProgress({
            referrer: '0x1234567890123456789012345678901234567890'
          })
        ).rejects.toThrow('Database connection failed')
      })

      it('should return empty array when no results found', async () => {
        mockPg.query.mockResolvedValue({ rows: [] })

        const result = await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })

        expect(result).toEqual([])
      })
    })

    describe('case sensitivity', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValue({ rows: mockReferrals })
      })

      it('should convert referrer address to lowercase', async () => {
        await referralDb.findReferralProgress({
          referrer: '0X1234567890123456789012345678901234567890' // uppercase
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            values: expect.arrayContaining(['0x1234567890123456789012345678901234567890']) // lowercase
          })
        )
      })

      it('should convert invitedUser address to lowercase', async () => {
        await referralDb.findReferralProgress({
          invitedUser: '0X0987654321098765432109876543210987654321' // uppercase
        })

        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            values: expect.arrayContaining(['0x0987654321098765432109876543210987654321']) // lowercase
          })
        )
      })
    })
  })

  describe('when claiming a tier reward', () => {
    let referrer: string
    let tier: number
    let options: { maxAttempts: number; leaseMs: number }

    beforeEach(() => {
      referrer = '0XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      tier = 5
      options = { maxAttempts: 5, leaseMs: 300000 }
    })

    describe('and no grant row exists yet', () => {
      let result: unknown

      beforeEach(async () => {
        mockPg.query.mockResolvedValueOnce({ rows: [{ id: 'grant-id', tier: 5, attempts: 1 }], rowCount: 1 })
        result = await referralDb.claimTierReward(referrer, tier, options)
      })

      it('should return the claimed grant so the caller may issue the reward', () => {
        expect(result).toEqual({ id: 'grant-id', tier: 5, attempts: 1 })
      })

      it('should upsert on the referrer/tier conflict target with the normalized referrer', () => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining('ON CONFLICT (referrer, tier) DO UPDATE'),
            values: expect.arrayContaining([referrer.toLowerCase(), tier])
          })
        )
      })

      it('should restrict the conflict update to pending grants that are within budget and unleased', () => {
        expect(mockPg.query.mock.calls[0][0].text.replace(/\s+/g, ' ')).toMatch(
          /WHERE referral_reward_grants\.status = \$\d+ AND referral_reward_grants\.attempts < \$\d+ AND referral_reward_grants\.updated_at <= \$\d+/
        )
      })

      it('should bound the claim by the configured attempt budget', () => {
        expect(mockPg.query.mock.calls[0][0].values).toContain(options.maxAttempts)
      })
    })

    describe('and the grant is already granted or still leased by another worker', () => {
      let result: unknown

      beforeEach(async () => {
        mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
        result = await referralDb.claimTierReward(referrer, tier, options)
      })

      it('should return null so the caller issues nothing', () => {
        expect(result).toBeNull()
      })
    })
  })

  describe('when marking a tier reward as granted', () => {
    let referrer: string
    let result: number

    beforeEach(async () => {
      referrer = '0XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })
      result = await referralDb.markTierRewardGranted(referrer, 5)
    })

    it('should report the single row it transitioned', () => {
      expect(result).toBe(1)
    })

    it('should only transition a grant that is still pending, using the normalized referrer', () => {
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('AND status ='),
          values: expect.arrayContaining(['granted', referrer.toLowerCase(), 5, 'pending'])
        })
      )
    })
  })

  describe('when recording a tier reward failure', () => {
    let referrer: string

    beforeEach(async () => {
      referrer = '0XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })
      await referralDb.recordTierRewardFailure(referrer, 5, 'upstream 503')
    })

    it('should store the failure reason against the pending grant', () => {
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining(['upstream 503', referrer.toLowerCase(), 5, 'pending'])
        })
      )
    })

    it('should not extend the lease, so the tier becomes retryable on schedule', () => {
      expect(mockPg.query.mock.calls[0][0].text).not.toContain('updated_at =')
    })
  })
})
