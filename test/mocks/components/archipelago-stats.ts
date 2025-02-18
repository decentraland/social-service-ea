import { IArchipelagoStatsComponent } from '../../../src/types'

export const ARCHIPELAGO_STATS_URL = 'http://archipelago-ea-stats.decentraland.test'

export const mockArchipelagoStats: jest.Mocked<IArchipelagoStatsComponent> = {
  getPeers: jest.fn(),
  getPeersFromCache: jest.fn()
}
