import { IPulseStatsComponent } from '../../../src/types'

export const PULSE_URL = 'https://pulse.example.com'

export const mockPulseStats: jest.Mocked<IPulseStatsComponent> = {
  fetchPeers: jest.fn(),
  getPeers: jest.fn()
}
