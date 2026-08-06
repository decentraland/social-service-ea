import { createVoiceDBComponent } from '../../../src/adapters/voice-db'
import { IVoiceDatabaseComponent } from '../../../src/types'

describe('when creating a pending private voice chat atomically', () => {
  let voiceDb: IVoiceDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let callerAddress: string
  let calleeAddress: string

  beforeEach(async () => {
    callerAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    calleeAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    voiceDb = await createVoiceDBComponent({
      pg: { withTransaction } as any,
      config: { requireNumber: jest.fn().mockResolvedValue(60_000) } as any
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and neither participant has another pending call', () => {
    let result: string | null

    beforeEach(async () => {
      transactionQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: 'call-id' }], rowCount: 1 })
      result = await voiceDb.createPrivateVoiceChat(callerAddress, calleeAddress)
    })

    it('should create the pending call', () => {
      expect(result).toBe('call-id')
    })

    it('should lock participants in canonical address order', () => {
      expect(transactionQuery.mock.calls.slice(0, 2).map((call) => call[1][0])).toEqual([
        `private-voice:${calleeAddress}`,
        `private-voice:${callerAddress}`
      ])
    })
  })

  describe('and either participant already has a pending call', () => {
    let result: string | null

    beforeEach(async () => {
      transactionQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 })
      result = await voiceDb.createPrivateVoiceChat(callerAddress, calleeAddress)
    })

    it('should reject the competing call without inserting it', () => {
      expect(result).toBeNull()
    })

    it('should stop after checking the locked participant state', () => {
      expect(transactionQuery).toHaveBeenCalledTimes(3)
    })
  })
})
