import { IPeersStatsComponent } from '../../../src/logic/peers-stats'

export function createMockPeersStatsComponent(): jest.Mocked<IPeersStatsComponent> {
  return {
    getConnectedPeers: jest.fn().mockResolvedValue([])
  }
}
