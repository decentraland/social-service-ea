import { createArchipelagoStatsComponent } from '../../../src/adapters/archipelago-stats'
import { IArchipelagoStatsComponent } from '../../../src/types'
import { mockConfig, mockFetcher, mockLogs, mockRedis } from '../../mocks/components'

describe('ArchipelagoStatsComponent', () => {
  let archipelagoStats: IArchipelagoStatsComponent

  beforeEach(async () => {
    archipelagoStats = await createArchipelagoStatsComponent({
      logs: mockLogs,
      redis: mockRedis,
      config: mockConfig,
      fetcher: mockFetcher
    })
  })

  describe('getPeers', () => {
    it('should return online peers when the fetch is successful', async () => {
      mockFetcher.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          peers: [{ id: '0x123' }, { id: '0x456' }]
        })
      } as any)
      const result = await archipelagoStats.getPeers()
      expect(result).toEqual(['0x123', '0x456'])
    })

    it('should throw an error when fetch response is not ok', async () => {
      mockFetcher.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      } as any)
      await expect(archipelagoStats.getPeers()).rejects.toThrow('Error fetching peers: Not Found')
    })

    it('should throw an error when the fetch fails', async () => {
      mockFetcher.fetch.mockRejectedValue(new Error('Fetch failed'))
      await expect(archipelagoStats.getPeers()).rejects.toThrow('Fetch failed')
    })
  })

  describe('getPeersFromCache', () => {
    it('should return cached peers', async () => {
      mockRedis.get.mockResolvedValue(['0x123', '0x456'])
      const result = await archipelagoStats.getPeersFromCache()
      expect(result).toEqual(['0x123', '0x456'])
    })

    it('should return an empty array when no peers are cached', async () => {
      mockRedis.get.mockResolvedValue(null)
      const result = await archipelagoStats.getPeersFromCache()
      expect(result).toEqual([])
    })
  })
})
