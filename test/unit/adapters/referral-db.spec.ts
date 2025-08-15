import { createReferralDBComponent } from '../../../src/adapters/referral-db'
import { ReferralProgressStatus } from '../../../src/types/referral-db.type'

describe('referral-db-component', () => {
  let mockPg: any
  let mockLogger: any
  let referralDb: any

  beforeEach(async () => {
    mockPg = {
      query: jest.fn()
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

      it('should return results in descending order by creation time', async () => {
        const result = await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })

        expect(result).toEqual(mockReferrals)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 100 and offset 0'
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

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 2 and offset 0'
        )
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

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 100 and offset 5'
        )
      })

      it('should default to limit 100 and offset 0 when not provided', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890'
        })

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 100 and offset 0'
        )
      })

      it('should handle invalid limit values by defaulting to 100', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          limit: -5
        })

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 100 and offset 0'
        )
      })

      it('should handle invalid offset values by defaulting to 0', async () => {
        await referralDb.findReferralProgress({
          referrer: '0x1234567890123456789012345678901234567890',
          offset: -10
        })

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Finding referral_progress for referrer 0x1234567890123456789012345678901234567890 with limit 100 and offset 0'
        )
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
        expect(mockLogger.debug).toHaveBeenCalledWith('Finding referral_progress with limit 100 and offset 0')
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
})
