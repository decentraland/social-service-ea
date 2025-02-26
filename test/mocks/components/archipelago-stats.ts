import { IArchipelagoStatsComponent } from '../../../src/types'

export const ARCHIPELAGO_STATS_URL = 'http://archipelago-ea-stats.decentraland.test'

export const mockArchipelagoStats: jest.Mocked<IArchipelagoStatsComponent> = {
  fetchPeers: jest.fn(),
  getPeers: jest.fn()
}
