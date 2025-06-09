import { IPeersStatsComponent } from '../../../src/logic/peers-stats'

export function createMockPeersStatsComponent({
  getConnectedPeers = jest.fn().mockResolvedValue([])
}: Partial<jest.Mocked<IPeersStatsComponent>> = {}): jest.Mocked<IPeersStatsComponent> {
  return {
    getConnectedPeers
  }
}
