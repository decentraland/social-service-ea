// Only error-path behavior is unit-tested here; query correctness and happy paths are covered by integration tests.
import { createUserModerationDBComponent } from '../../../src/adapters/user-moderation-db'
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

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when lifting a ban', () => {
    describe('and no active ban exists', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      })

      it('should return false', async () => {
        const result = await dbComponent.liftBan('0xabc', '0xadmin')

        expect(result).toBe(false)
      })
    })

    describe('and an active ban exists', () => {
      beforeEach(() => {
        mockPg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 })
      })

      it('should return true', async () => {
        const result = await dbComponent.liftBan('0xabc', '0xadmin')

        expect(result).toBe(true)
      })
    })
  })
})
