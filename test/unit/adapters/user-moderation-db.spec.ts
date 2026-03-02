// Only error-path behavior is unit-tested here; query correctness and happy paths are covered by integration tests.
import { createUserModerationDBComponent } from '../../../src/adapters/user-moderation-db'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../../src/logic/user-moderation/errors'
import { mockLogs, mockPg } from '../../mocks/components'

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
    describe('and player is already banned', () => {
      it('should throw PlayerAlreadyBannedError', async () => {
        const existingBan = {
          id: 'existing-ban',
          bannedAddress: '0xabc',
          bannedBy: '0xadmin',
          reason: 'Previous violation',
          customMessage: null,
          bannedAt: new Date(),
          expiresAt: null,
          liftedAt: null,
          liftedBy: null,
          createdAt: new Date()
        }
        // isPlayerBanned check returns an active ban
        mockPg.query.mockResolvedValueOnce({ rows: [existingBan], rowCount: 1 })

        await expect(
          dbComponent.createBan({
            bannedAddress: '0xABC',
            bannedBy: '0xADMIN',
            reason: 'Violation'
          })
        ).rejects.toThrow(PlayerAlreadyBannedError)

        // INSERT should never be called
        expect(mockPg.query).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when lifting a ban', () => {
    describe('and no active ban exists', () => {
      it('should throw BanNotFoundError', async () => {
        mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })

        await expect(dbComponent.liftBan('0xABC', '0xADMIN')).rejects.toThrow(BanNotFoundError)
      })
    })
  })
})
