import { createUserModerationDBComponent } from '../../../src/adapters/user-moderation-db'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../../src/logic/user-moderation/errors'
import { mockLogs, mockPg } from '../../mocks/components'
import { normalizeAddress } from '../../../src/utils/address'

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid')
}))

describe('userModerationDb', () => {
  let dbComponent: ReturnType<typeof createUserModerationDBComponent>

  beforeEach(() => {
    jest.clearAllMocks()
    dbComponent = createUserModerationDBComponent({ pg: mockPg, logs: mockLogs })
  })

  describe('when creating a ban', () => {
    it('should insert a ban and return the created entity', async () => {
      const mockBan = {
        id: 'mock-uuid',
        bannedAddress: '0xabc',
        bannedBy: '0xadmin',
        reason: 'Violation',
        customMessage: null,
        bannedAt: new Date(),
        expiresAt: null,
        liftedAt: null,
        liftedBy: null,
        createdAt: new Date()
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockBan], rowCount: 1 })

      const result = await dbComponent.createBan({
        bannedAddress: '0xABC',
        bannedBy: '0xADMIN',
        reason: 'Violation'
      })

      expect(result).toEqual(mockBan)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining('INSERT INTO user_bans')]),
          values: expect.arrayContaining([
            'mock-uuid',
            normalizeAddress('0xABC'),
            normalizeAddress('0xADMIN'),
            'Violation'
          ])
        })
      )
    })

    it('should throw PlayerAlreadyBannedError on unique constraint violation', async () => {
      const pgError = new Error('unique violation') as any
      pgError.code = '23505'
      mockPg.query.mockRejectedValueOnce(pgError)

      await expect(
        dbComponent.createBan({
          bannedAddress: '0xABC',
          bannedBy: '0xADMIN',
          reason: 'Violation'
        })
      ).rejects.toThrow(PlayerAlreadyBannedError)
    })

    it('should apply normalizeAddress to address inputs', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 })

      await dbComponent.createBan({
        bannedAddress: '0xABC',
        bannedBy: '0xADMIN',
        reason: 'test'
      })

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([normalizeAddress('0xABC'), normalizeAddress('0xADMIN')])
        })
      )
    })
  })

  describe('when lifting a ban', () => {
    it('should update the ban when an active ban exists', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await expect(dbComponent.liftBan('0xABC', '0xADMIN')).resolves.toBeUndefined()

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining('UPDATE user_bans')]),
          values: expect.arrayContaining([normalizeAddress('0xADMIN'), normalizeAddress('0xABC')])
        })
      )
    })

    it('should throw BanNotFoundError when no active ban exists', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      await expect(dbComponent.liftBan('0xABC', '0xADMIN')).rejects.toThrow(BanNotFoundError)
    })

    it('should apply normalizeAddress to address inputs', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await dbComponent.liftBan('0xABC', '0xADMIN')

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([normalizeAddress('0xABC'), normalizeAddress('0xADMIN')])
        })
      )
    })
  })

  describe('when checking if a player is banned', () => {
    it('should return isBanned true with ban when an active ban exists', async () => {
      const mockBan = {
        id: 'ban-id',
        bannedAddress: '0xabc',
        bannedBy: '0xadmin',
        reason: 'Violation',
        customMessage: null,
        bannedAt: new Date(),
        expiresAt: null,
        liftedAt: null,
        liftedBy: null,
        createdAt: new Date()
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockBan], rowCount: 1 })

      const result = await dbComponent.isPlayerBanned('0xABC')

      expect(result).toEqual({ isBanned: true, ban: mockBan })
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([
            expect.stringContaining('FROM user_bans'),
            expect.stringContaining('lifted_at IS NULL')
          ]),
          values: expect.arrayContaining([normalizeAddress('0xABC')])
        })
      )
    })

    it('should return isBanned false when no active ban exists', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const result = await dbComponent.isPlayerBanned('0xABC')

      expect(result).toEqual({ isBanned: false })
    })

    it('should apply normalizeAddress to the address input', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      await dbComponent.isPlayerBanned('0xABC')

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([normalizeAddress('0xABC')])
        })
      )
    })
  })

  describe('when getting active bans', () => {
    it('should return all active bans ordered by banned_at DESC', async () => {
      const mockBans = [
        { id: 'ban-1', bannedAddress: '0xabc', bannedAt: new Date() },
        { id: 'ban-2', bannedAddress: '0xdef', bannedAt: new Date() }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockBans, rowCount: 2 })

      const result = await dbComponent.getActiveBans()

      expect(result).toEqual(mockBans)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([
            expect.stringContaining('FROM user_bans'),
            expect.stringContaining('ORDER BY banned_at DESC')
          ])
        })
      )
    })

    it('should return empty array when no active bans exist', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const result = await dbComponent.getActiveBans()

      expect(result).toEqual([])
    })
  })

  describe('when creating a warning', () => {
    it('should insert a warning and return the created entity', async () => {
      const mockWarning = {
        id: 'mock-uuid',
        warnedAddress: '0xabc',
        warnedBy: '0xadmin',
        reason: 'Bad behavior',
        warnedAt: new Date(),
        createdAt: new Date()
      }
      mockPg.query.mockResolvedValueOnce({ rows: [mockWarning], rowCount: 1 })

      const result = await dbComponent.createWarning({
        warnedAddress: '0xABC',
        warnedBy: '0xADMIN',
        reason: 'Bad behavior'
      })

      expect(result).toEqual(mockWarning)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining('INSERT INTO user_warnings')]),
          values: expect.arrayContaining([
            'mock-uuid',
            normalizeAddress('0xABC'),
            normalizeAddress('0xADMIN'),
            'Bad behavior'
          ])
        })
      )
    })

    it('should apply normalizeAddress to address inputs', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 })

      await dbComponent.createWarning({
        warnedAddress: '0xABC',
        warnedBy: '0xADMIN',
        reason: 'test'
      })

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([normalizeAddress('0xABC'), normalizeAddress('0xADMIN')])
        })
      )
    })
  })

  describe('when getting player warnings', () => {
    it('should return warnings for a player ordered by warned_at DESC', async () => {
      const mockWarnings = [
        { id: 'warn-1', warnedAddress: '0xabc', reason: 'First warning' },
        { id: 'warn-2', warnedAddress: '0xabc', reason: 'Second warning' }
      ]
      mockPg.query.mockResolvedValueOnce({ rows: mockWarnings, rowCount: 2 })

      const result = await dbComponent.getPlayerWarnings('0xABC')

      expect(result).toEqual(mockWarnings)
      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([
            expect.stringContaining('FROM user_warnings'),
            expect.stringContaining('ORDER BY warned_at DESC')
          ]),
          values: expect.arrayContaining([normalizeAddress('0xABC')])
        })
      )
    })

    it('should return empty array when no warnings exist', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      const result = await dbComponent.getPlayerWarnings('0xABC')

      expect(result).toEqual([])
    })

    it('should apply normalizeAddress to the address input', async () => {
      mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

      await dbComponent.getPlayerWarnings('0xABC')

      expect(mockPg.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([normalizeAddress('0xABC')])
        })
      )
    })
  })

  describe('when getting ban history', () => {
    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when the player has bans', () => {
      let mockBans: object[]
      let result: Awaited<ReturnType<typeof dbComponent.getBanHistory>>

      beforeEach(async () => {
        mockBans = [
          { id: 'ban-1', bannedAddress: '0xabc', bannedAt: new Date('2024-02-01') },
          { id: 'ban-2', bannedAddress: '0xabc', bannedAt: new Date('2024-01-01'), liftedAt: new Date('2024-01-15') }
        ]
        mockPg.query.mockResolvedValueOnce({ rows: mockBans, rowCount: 2 })
        result = await dbComponent.getBanHistory('0xABC')
      })

      it('should return all bans including active, lifted, and expired', () => {
        expect(result).toEqual(mockBans)
      })

      it('should query user_bans ordered by banned_at DESC', () => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([
              expect.stringContaining('FROM user_bans'),
              expect.stringContaining('ORDER BY banned_at DESC')
            ])
          })
        )
      })

      it('should apply normalizeAddress to the address input', () => {
        expect(mockPg.query).toHaveBeenCalledWith(
          expect.objectContaining({
            values: expect.arrayContaining([normalizeAddress('0xABC')])
          })
        )
      })
    })

    describe('when the player has no bans', () => {
      let result: Awaited<ReturnType<typeof dbComponent.getBanHistory>>

      beforeEach(async () => {
        mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
        result = await dbComponent.getBanHistory('0xABC')
      })

      it('should return an empty array', () => {
        expect(result).toEqual([])
      })
    })
  })
})
