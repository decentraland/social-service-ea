import { createSchedulerComponent, FIVE_SECS_IN_MS, TEN_SECS_IN_MS } from '../../../src/adapters/scheduler'
import { mockLogs, mockRedis, mockArchipelagoStats, mockConfig } from '../../mocks/components'
import { AppComponents, ISchedulerComponent } from '../../../src/types'
import { PEERS_CACHE_KEY } from '../../../src/utils/peers'

describe('scheduler', () => {
  let scheduler: ISchedulerComponent

  beforeEach(async () => {
    scheduler = await createSchedulerComponent({
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
    const mockPeers = { '0x123': true, '0x456': true }
    mockArchipelagoStats.getPeers.mockResolvedValueOnce(mockPeers)

    await scheduler.start({} as any)
    await scheduler.stop()

    expect(mockArchipelagoStats.getPeers).toHaveBeenCalled()
    expect(mockRedis.put).toHaveBeenCalledWith(
      PEERS_CACHE_KEY,
      JSON.stringify(mockPeers),
      expect.objectContaining({ EX: TEN_SECS_IN_MS / 1000 })
    )
  })

  it('should sync peers periodically', async () => {
    const mockPeers = { '0x123': true }
    mockArchipelagoStats.getPeers.mockResolvedValue(mockPeers)

    await scheduler.start({} as any)

    // Advance timer to trigger next sync
    jest.advanceTimersByTime(FIVE_SECS_IN_MS)

    await scheduler.stop()

    expect(mockArchipelagoStats.getPeers).toHaveBeenCalledTimes(2)
    expect(mockRedis.put).toHaveBeenCalledTimes(2)
  })

  it('should stop syncing when stopped', async () => {
    mockArchipelagoStats.getPeers.mockResolvedValue({})

    await scheduler.start({} as any)
    await scheduler.stop()

    jest.advanceTimersByTime(FIVE_SECS_IN_MS)

    // Should only have the initial sync
    expect(mockArchipelagoStats.getPeers).toHaveBeenCalledTimes(1)
  })

  it('should handle errors gracefully', async () => {
    mockArchipelagoStats.getPeers.mockRejectedValue(new Error('Network error'))

    await scheduler.start({} as any)
    await scheduler.stop()

    expect(mockLogs.getLogger('scheduler-component').error).toHaveBeenCalled()
  })
})
