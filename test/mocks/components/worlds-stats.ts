import { IWorldsStatsComponent } from '../../../src/types'

export const mockWorldsStats: jest.Mocked<IWorldsStatsComponent> = {
  onPeerConnect: jest.fn(),
  onPeerDisconnect: jest.fn(),
  getPeers: jest.fn()
}
