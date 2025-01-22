import { IArchipelagoStatsComponent } from '../../../src/types'

export const mockArchipelagoStats: jest.Mocked<IArchipelagoStatsComponent> = {
  getPeers: jest.fn(),
  getPeersFromCache: jest.fn()
}
