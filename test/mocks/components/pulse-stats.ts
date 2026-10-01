import { IPulseStatsComponent } from '../../../src/types'

export const mockPulseStats: jest.Mocked<IPulseStatsComponent> = {
  fetchPeers: jest.fn(),
  getPeers: jest.fn()
}
