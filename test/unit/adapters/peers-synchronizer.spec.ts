import {
  createPeersSynchronizerComponent,
  FIVE_SECS_IN_MS,
  TEN_SECS_IN_MS
} from '../../../src/adapters/peers-synchronizer'
import { mockLogs, mockRedis, mockArchipelagoStats, mockConfig } from '../../mocks/components'
import { IPeersSynchronizer } from '../../../src/types'
import { PEERS_CACHE_KEY } from '../../../src/utils/peers'

describe('peers-synchronizer', () => {
  let scheduler: IPeersSynchronizer

  beforeEach(async () => {
    scheduler = await createPeersSynchronizerComponent({
      logs: mockLogs,
      archipelagoStats: mockArchipelagoStats,
      redis: mockRedis,
      config: mockConfig
    })

    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should sync peers on start', async () => {
    const mockPeers = ['0x123', '0x456']
    mockArchipelagoStats.fetchPeers.mockResolvedValueOnce(mockPeers)

    await scheduler.start({} as any)
    await scheduler.stop()

    expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalled()
    expect(mockRedis.put).toHaveBeenCalledWith(
      PEERS_CACHE_KEY,
      mockPeers,
      expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
    )
  })

  it('should sync peers periodically', async () => {
    const mockPeers = ['0x123']
    mockArchipelagoStats.fetchPeers.mockResolvedValue(mockPeers)

    await scheduler.start({} as any)

    // Advance timer to trigger next sync
    jest.advanceTimersByTime(FIVE_SECS_IN_MS)

    await scheduler.stop()

    expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalledTimes(2)
    expect(mockRedis.put).toHaveBeenCalledTimes(2)
  })

  it('should stop syncing when stopped', async () => {
    mockArchipelagoStats.fetchPeers.mockResolvedValue([])

    await scheduler.start({} as any)
    await scheduler.stop()

    jest.advanceTimersByTime(FIVE_SECS_IN_MS)

    // Should only have the initial sync
    expect(mockArchipelagoStats.fetchPeers).toHaveBeenCalledTimes(1)
  })

  it('should handle errors gracefully', async () => {
    mockArchipelagoStats.fetchPeers.mockRejectedValue(new Error('Network error'))

    await scheduler.start({} as any)
    await scheduler.stop()

    expect(mockLogs.getLogger('scheduler-component').error).toHaveBeenCalled()
  })
})
