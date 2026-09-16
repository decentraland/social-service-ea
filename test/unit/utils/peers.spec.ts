import { PEERS_CACHE_KEY } from '../../../src/utils/peers'

describe('presence source', () => {
  it('should expose the shared reconciled-peers cache key', () => {
    expect(PEERS_CACHE_KEY).toBe('connected-peers')
  })
})
