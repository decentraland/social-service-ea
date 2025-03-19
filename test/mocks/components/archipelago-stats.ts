import { IArchipelagoStatsComponent } from '../../../src/types'

export const ARCHIPELAGO_STATS_URL = 'https://archipelago-ea-stats.decentraland.zone'

export const mockArchipelagoStats: jest.Mocked<IArchipelagoStatsComponent> = {
  fetchPeers: jest.fn(),
  getPeers: jest.fn()
}
