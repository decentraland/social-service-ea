import { createPeersStatsComponent } from '../../../src/logic/peers-stats'
import { mockArchipelagoStats, mockWorldsStats, mockLogs } from '../../mocks/components'

describe('when handling peers stats operations', () => {
  let peersStatsComponent: ReturnType<typeof createPeersStatsComponent>
  let mockPeers: string[]

  beforeEach(() => {
    mockPeers = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333'
    ]

    peersStatsComponent = createPeersStatsComponent({
      archipelagoStats: mockArchipelagoStats,
      worldsStats: mockWorldsStats,
      logs: mockLogs
    })
  })

  describe('and getting connected peers', () => {
    describe('when all stats components return peers successfully', () => {
      beforeEach(() => {
        mockArchipelagoStats.getPeers.mockResolvedValue([mockPeers[0], mockPeers[1]])
        mockWorldsStats.getPeers.mockResolvedValue([mockPeers[1], mockPeers[2]])
      })

      it('should return unique peers from all components', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual(expect.arrayContaining(mockPeers))
        expect(result).toHaveLength(3) // Should deduplicate mockPeers[1]
      })

      it('should call getPeers on all stats components', async () => {
        await peersStatsComponent.getConnectedPeers()

        expect(mockArchipelagoStats.getPeers).toHaveBeenCalled()
        expect(mockWorldsStats.getPeers).toHaveBeenCalled()
      })

      it('should prioritize worlds stats over archipelago stats', async () => {
        // Simulate archipelago stats having stale data (missing a peer that exists in worlds stats)
        mockArchipelagoStats.getPeers.mockResolvedValue([mockPeers[0], mockPeers[1]])
        mockWorldsStats.getPeers.mockResolvedValue([mockPeers[1], mockPeers[2], mockPeers[3]])

        const result = await peersStatsComponent.getConnectedPeers()

        // Should include all peers from worlds stats, even if archipelago stats is missing some
        expect(result).toContain(mockPeers[3]) // This peer only exists in worlds stats
        expect(result).toHaveLength(4) // All unique peers
      })
    })

    describe('when some stats components fail', () => {
      beforeEach(() => {
        mockArchipelagoStats.getPeers.mockRejectedValue(new Error('Failed to get archipelago peers'))
        mockWorldsStats.getPeers.mockResolvedValue([mockPeers[0], mockPeers[1]])
      })

      it('should return peers from successful components', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual(expect.arrayContaining([mockPeers[0], mockPeers[1]]))
        expect(result).toHaveLength(2)
      })

      it('should not throw when a component fails', async () => {
        await expect(peersStatsComponent.getConnectedPeers()).resolves.not.toThrow()
      })
    })

    describe('when all stats components fail', () => {
      beforeEach(() => {
        mockArchipelagoStats.getPeers.mockRejectedValue(new Error('Failed to get archipelago peers'))
        mockWorldsStats.getPeers.mockRejectedValue(new Error('Failed to get worlds peers'))
      })

      it('should return an empty array', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual([])
      })

      it('should not throw when all components fail', async () => {
        await expect(peersStatsComponent.getConnectedPeers()).resolves.not.toThrow()
      })
    })

    describe('when stats components return empty arrays', () => {
      beforeEach(() => {
        mockArchipelagoStats.getPeers.mockResolvedValue([])
        mockWorldsStats.getPeers.mockResolvedValue([])
      })

      it('should return an empty array', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual([])
      })
    })

    describe('when stats components return duplicate peers', () => {
      beforeEach(() => {
        mockArchipelagoStats.getPeers.mockResolvedValue([mockPeers[0], mockPeers[0]])
        mockWorldsStats.getPeers.mockResolvedValue([mockPeers[0], mockPeers[1]])
      })

      it('should return unique peers', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual(expect.arrayContaining([mockPeers[0], mockPeers[1]]))
        expect(result).toHaveLength(2) // Should deduplicate mockPeers[0]
      })
    })
  })
})
