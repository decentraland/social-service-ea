import {
  createPeersSynchronizerComponent,
  FIVE_SECS_IN_MS,
  TEN_SECS_IN_MS
} from '../../../src/adapters/peers-synchronizer'
import { createMockConfigComponent, mockLogs, mockRedis, mockPulseStats } from '../../mocks/components'
import { IPeersSynchronizer } from '../../../src/types'
import { PEERS_CACHE_KEY } from '../../../src/utils/peers'

describe('peers-synchronizer', () => {
  let scheduler: IPeersSynchronizer

  function buildConfig() {
    return createMockConfigComponent({
      getNumber: jest.fn(async (_key: string) => undefined)
    })
  }

  async function createScheduler() {
    return createPeersSynchronizerComponent({
      logs: mockLogs,
      pulseStats: mockPulseStats,
      redis: mockRedis,
      config: buildConfig()
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    scheduler = await createScheduler()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should fill the shared peers cache key from Pulse', async () => {
    const mockPeers = ['0x123', '0x456']
    mockPulseStats.fetchPeers.mockResolvedValueOnce(mockPeers)

    await scheduler.syncPeers()

    expect(mockPulseStats.fetchPeers).toHaveBeenCalled()
    expect(mockRedis.put).toHaveBeenCalledWith(
      PEERS_CACHE_KEY,
      mockPeers,
      expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
    )
  })

  it('should sync peers periodically', async () => {
    const mockPeers = ['0x123']
    mockPulseStats.fetchPeers.mockResolvedValue(mockPeers)

    await scheduler.syncPeers()

    // Advance timer to trigger next sync
    await jest.advanceTimersByTimeAsync(FIVE_SECS_IN_MS)

    await scheduler.stop()

    expect(mockPulseStats.fetchPeers).toHaveBeenCalledTimes(2)
    expect(mockRedis.put).toHaveBeenCalledTimes(2)
  })

  it('should stop syncing when stopped', async () => {
    mockPulseStats.fetchPeers.mockResolvedValue([])

    await scheduler.syncPeers()
    await scheduler.stop()

    jest.advanceTimersByTime(FIVE_SECS_IN_MS)

    // Should only have the initial sync
    expect(mockPulseStats.fetchPeers).toHaveBeenCalledTimes(1)
  })

  it('should preserve the cached peers when fetching Pulse fails', async () => {
    mockPulseStats.fetchPeers.mockRejectedValue(new Error('Network error'))

    await scheduler.syncPeers()
    await scheduler.stop()

    expect(mockRedis.put).not.toHaveBeenCalled()
    expect(mockLogs.getLogger('peers-synchronizer-component').error).toHaveBeenCalled()
  })
})
