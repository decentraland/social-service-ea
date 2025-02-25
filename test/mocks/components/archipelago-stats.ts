import { IArchipelagoStatsComponent } from '../../../src/types'

export const mockArchipelagoStats: jest.Mocked<IArchipelagoStatsComponent> = {
  fetchPeers: jest.fn(),
  getPeers: jest.fn()
}
