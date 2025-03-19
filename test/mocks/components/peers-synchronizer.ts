import { IPeersSynchronizer } from '../../../src/types'

export const mockPeersSynchronizer: jest.Mocked<IPeersSynchronizer> = {
  syncPeers: jest.fn()
}
