import { createPeersStatsComponent } from '../../../src/logic/peers-stats'
import { mockPulseStats } from '../../mocks/components'

describe('when handling peers stats operations', () => {
  let peersStatsComponent: ReturnType<typeof createPeersStatsComponent>

  beforeEach(() => {
    jest.clearAllMocks()
    peersStatsComponent = createPeersStatsComponent({ pulseStats: mockPulseStats })
  })

  describe('and getting connected peers', () => {
    describe('when pulse returns peers successfully', () => {
      beforeEach(() => {
        mockPulseStats.getPeers.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
      })

      it('should return the peers pulse reports', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual(
          expect.arrayContaining([
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222'
          ])
        )
        expect(result).toHaveLength(2)
      })

      it('should read the Pulse peer cache', async () => {
        await peersStatsComponent.getConnectedPeers()

        expect(mockPulseStats.getPeers).toHaveBeenCalled()
      })
    })

    describe('when pulse returns duplicate peers', () => {
      beforeEach(() => {
        mockPulseStats.getPeers.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x1111111111111111111111111111111111111111'
        ])
      })

      it('should return unique peers', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual(['0x1111111111111111111111111111111111111111'])
      })
    })

    describe('when pulse fails', () => {
      beforeEach(() => {
        mockPulseStats.getPeers.mockRejectedValue(new Error('Failed to get pulse peers'))
      })

      it('should return an empty array', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual([])
      })

      it('should not throw', async () => {
        await expect(peersStatsComponent.getConnectedPeers()).resolves.not.toThrow()
      })
    })

    describe('when pulse returns an empty array', () => {
      beforeEach(() => {
        mockPulseStats.getPeers.mockResolvedValue([])
      })

      it('should return an empty array', async () => {
        const result = await peersStatsComponent.getConnectedPeers()

        expect(result).toEqual([])
      })
    })
  })
})
