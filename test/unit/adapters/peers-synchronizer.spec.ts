import {
  createPeersSynchronizerComponent,
  FIVE_SECS_IN_MS,
  TEN_SECS_IN_MS
} from '../../../src/adapters/peers-synchronizer'
import {
  createMockConfigComponent,
  mockLogs,
  mockRedis,
  mockArchipelagoStats,
  mockPulseStats
} from '../../mocks/components'
import { IPeersSynchronizer } from '../../../src/types'
import { PEERS_CACHE_KEY, PEERS_CACHE_KEY_PULSE } from '../../../src/utils/peers'

describe('peers-synchronizer', () => {
  let scheduler: IPeersSynchronizer

  function buildConfig(presenceSource?: string) {
    return createMockConfigComponent({
      getString: jest.fn(async (key: string) => (key === 'PRESENCE_SOURCE' ? presenceSource : undefined)),
      getNumber: jest.fn(async (_key: string) => undefined)
    })
  }

  async function createScheduler(presenceSource?: string) {
    return createPeersSynchronizerComponent({
      logs: mockLogs,
      archipelagoStats: mockArchipelagoStats,
      pulseStats: mockPulseStats,
      redis: mockRedis,
      config: buildConfig(presenceSource)
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('when PRESENCE_SOURCE is not set', () => {
    beforeEach(async () => {
      scheduler = await createScheduler(undefined)
    })

    it('should sync peers correctly', async () => {
      const mockPeers = ['0x123', '0x456']
      mockArchipelagoStats.fetchPeers.mockResolvedValueOnce(mockPeers)

      await scheduler.syncPeers()

      expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalled()
      expect(mockRedis.put).toHaveBeenCalledWith(
        PEERS_CACHE_KEY,
        mockPeers,
        expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
      )
    })

    it('should not touch the pulse source', async () => {
      mockArchipelagoStats.fetchPeers.mockResolvedValue([])

      await scheduler.syncPeers()
      await scheduler.stop()

      expect(mockPulseStats.fetchPeers).not.toHaveBeenCalled()
      expect(mockRedis.put).not.toHaveBeenCalledWith(PEERS_CACHE_KEY_PULSE, expect.anything(), expect.anything())
    })

    it('should sync peers periodically', async () => {
      const mockPeers = ['0x123']
      mockArchipelagoStats.fetchPeers.mockResolvedValue(mockPeers)

      await scheduler.syncPeers()

      // Advance timer to trigger next sync
      await jest.advanceTimersByTimeAsync(FIVE_SECS_IN_MS)

      await scheduler.stop()

      expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalledTimes(2)
      expect(mockRedis.put).toHaveBeenCalledTimes(2)
    })

    it('should stop syncing when stopped', async () => {
      mockArchipelagoStats.fetchPeers.mockResolvedValue([])

      await scheduler.syncPeers()
      await scheduler.stop()

      jest.advanceTimersByTime(FIVE_SECS_IN_MS)

      // Should only have the initial sync
      expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalledTimes(1)
    })

    it('should handle errors gracefully', async () => {
      mockArchipelagoStats.fetchPeers.mockRejectedValue(new Error('Network error'))

      await scheduler.syncPeers()
      await scheduler.stop()

      expect(mockLogs.getLogger('peers-synchronizer-component').error).toHaveBeenCalled()
    })
  })

  describe('when PRESENCE_SOURCE is pulse', () => {
    beforeEach(async () => {
      scheduler = await createScheduler('pulse')
    })

    it('should fill the pulse cache key from the pulse all-realms endpoint only', async () => {
      const mockPeers = ['0x123', '0x456']
      mockPulseStats.fetchPeers.mockResolvedValue(mockPeers)

      await scheduler.syncPeers()
      await scheduler.stop()

      expect(mockPulseStats.fetchPeers).toHaveBeenCalled()
      expect(mockArchipelagoStats.fetchPeers).not.toHaveBeenCalled()
      expect(mockRedis.put).toHaveBeenCalledWith(
        PEERS_CACHE_KEY_PULSE,
        mockPeers,
        expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
      )
      expect(mockRedis.put).not.toHaveBeenCalledWith(PEERS_CACHE_KEY, expect.anything(), expect.anything())
    })
  })

  describe('when PRESENCE_SOURCE is both', () => {
    beforeEach(async () => {
      scheduler = await createScheduler('both')
    })

    it('should fill both cache keys, each from its own source', async () => {
      mockArchipelagoStats.fetchPeers.mockResolvedValue(['0xarchipelago'])
      mockPulseStats.fetchPeers.mockResolvedValue(['0xpulse'])

      await scheduler.syncPeers()
      await scheduler.stop()

      expect(mockRedis.put).toHaveBeenCalledWith(
        PEERS_CACHE_KEY,
        ['0xarchipelago'],
        expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
      )
      expect(mockRedis.put).toHaveBeenCalledWith(
        PEERS_CACHE_KEY_PULSE,
        ['0xpulse'],
        expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
      )
    })

    it('should keep filling one cache key when the other source fails', async () => {
      mockArchipelagoStats.fetchPeers.mockRejectedValue(new Error('Network error'))
      mockPulseStats.fetchPeers.mockResolvedValue(['0xpulse'])

      await scheduler.syncPeers()
      await scheduler.stop()

      expect(mockRedis.put).toHaveBeenCalledWith(PEERS_CACHE_KEY_PULSE, ['0xpulse'], expect.anything())
      expect(mockRedis.put).not.toHaveBeenCalledWith(PEERS_CACHE_KEY, expect.anything(), expect.anything())
      expect(mockLogs.getLogger('peers-synchronizer-component').error).toHaveBeenCalled()
    })
  })
})
