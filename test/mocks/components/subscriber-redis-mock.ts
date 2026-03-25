import { ICacheComponent, IRedisComponent } from '../../../src/types'

const SUBSCRIBER_KEY_PREFIX = 'subscriber:'

/**
 * Sets up Redis mock to simulate TTL-based subscriber key tracking.
 * Mocks `put`, `client.del`, and `client.scanIterator` to maintain
 * an in-memory set of subscriber addresses.
 */
export function setupSubscriberRedisMock(mockRedis: jest.Mocked<IRedisComponent & ICacheComponent>): void {
  const subscriberKeys = new Set<string>()

  // Track subscriber keys via put (called by addSubscriber/getOrAddSubscriber)
  const originalPut = mockRedis.put
  mockRedis.put.mockImplementation(async (key: string, value: any, options?: any) => {
    if (key.startsWith(SUBSCRIBER_KEY_PREFIX)) {
      subscriberKeys.add(key)
    }
    // Call through for non-subscriber keys if needed
  })

  // Track subscriber key removals via client.del
  ;(mockRedis.client.del as jest.Mock).mockImplementation(async (keys: string | string[]) => {
    const keysArray = Array.isArray(keys) ? keys : [keys]
    keysArray.forEach((key) => subscriberKeys.delete(key))
    return keysArray.length
  })

  // Return subscriber keys via scanIterator
  ;(mockRedis.client.scanIterator as jest.Mock).mockImplementation((options?: { MATCH?: string }) => {
    const match = options?.MATCH || '*'
    const prefix = match.replace('*', '')

    return (async function* () {
      for (const key of subscriberKeys) {
        if (key.startsWith(prefix)) {
          yield key
        }
      }
    })()
  })
}
