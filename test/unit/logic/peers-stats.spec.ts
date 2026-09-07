import { createPeersStatsComponent } from '../../../src/logic/peers-stats'
import { mockArchipelagoStats, mockPulseStats, mockWorldsStats } from '../../mocks/components'
import { PresenceSource } from '../../../src/utils/peers'

describe('when handling peers stats operations', () => {
  let peersStatsComponent: ReturnType<typeof createPeersStatsComponent>
  let mockPeers: string[]

  function createComponent(presenceSource?: PresenceSource) {
    return createPeersStatsComponent(
      {
        archipelagoStats: mockArchipelagoStats,
        pulseStats: mockPulseStats,
        worldsStats: mockWorldsStats
      },
      presenceSource
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()

    mockPeers = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333'
    ]

    peersStatsComponent = createComponent()
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

  describe('and the presence source selects which getters are read', () => {
    beforeEach(() => {
      mockArchipelagoStats.getPeers.mockResolvedValue(['0xarchipelago'])
      mockWorldsStats.getPeers.mockResolvedValue(['0xworld'])
      mockPulseStats.getPeers.mockResolvedValue(['0xpulse'])
    })

    describe('when the source is archipelago', () => {
      it('should serve the archipelago union and never read pulse', async () => {
        const result = await createComponent(PresenceSource.ARCHIPELAGO).getConnectedPeers()

        expect(result).toEqual(['0xarchipelago', '0xworld'])
        expect(mockPulseStats.getPeers).not.toHaveBeenCalled()
      })
    })

    describe('when the source is both', () => {
      it('should still serve the archipelago union so reads do not change mid-window', async () => {
        const result = await createComponent(PresenceSource.BOTH).getConnectedPeers()

        expect(result).toEqual(['0xarchipelago', '0xworld'])
        expect(mockPulseStats.getPeers).not.toHaveBeenCalled()
      })
    })

    describe('when the source is pulse', () => {
      it('should read the single pulse getter only', async () => {
        const result = await createComponent(PresenceSource.PULSE).getConnectedPeers()

        expect(result).toEqual(['0xpulse'])
        expect(mockArchipelagoStats.getPeers).not.toHaveBeenCalled()
        expect(mockWorldsStats.getPeers).not.toHaveBeenCalled()
      })
    })
  })
})
