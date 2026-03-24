import mitt, { Emitter } from 'mitt'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { AppComponents } from '../../types/system'

const SUBSCRIBER_KEY_PREFIX = 'subscriber:'

// Default TTL for subscriber keys in seconds (5 minutes)
const DEFAULT_SUBSCRIBER_TTL_SECONDS = 300
// Default heartbeat interval in milliseconds (2 minutes)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 120_000

export function createSubscribersContext(
  components: Pick<AppComponents, 'redis' | 'logs' | 'config'>
): ISubscribersContext {
  const { redis, logs, config } = components
  const logger = logs.getLogger('subscribers-context')

  // Local in-memory emitters for WebSocket connections on this instance
  const localSubscribers: Subscribers = {}

  // Track active emitterToAsyncGenerator instances per subscriber so we can
  // synchronously terminate them when the subscriber disconnects.
  const subscriberGenerators = new Map<string, Set<{ destroy(): void }>>()

  let subscriberTtlSeconds = DEFAULT_SUBSCRIBER_TTL_SECONDS
  let heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS
  let heartbeatInterval: NodeJS.Timeout | null = null

  function getSubscriberKey(address: string): string {
    return `${SUBSCRIBER_KEY_PREFIX}${address}`
  }

  function addLocalSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>): void {
    const normalizedAddress = normalizeAddress(address)
    if (!localSubscribers[normalizedAddress]) {
      localSubscribers[normalizedAddress] = subscriber
    }
  }

  function destroyGeneratorsForAddress(address: string): void {
    const generators = subscriberGenerators.get(address)
    if (generators) {
      for (const gen of generators) {
        gen.destroy()
      }
      generators.clear()
      subscriberGenerators.delete(address)
    }
  }

  function removeLocalSubscriber(address: string): void {
    const normalizedAddress = normalizeAddress(address)
    if (localSubscribers[normalizedAddress]) {
      // Destroy generators first so pending next() calls resolve before
      // we clear the emitter handlers (prevents the deadlock).
      destroyGeneratorsForAddress(normalizedAddress)
      localSubscribers[normalizedAddress].all.clear()
      delete localSubscribers[normalizedAddress]
    }
  }

  /**
   * Refreshes the TTL for all local subscribers in Redis.
   * This ensures that subscriber keys auto-expire if the instance crashes
   * without running stop().
   */
  async function refreshSubscriberTTLs(): Promise<void> {
    const localAddresses = Object.keys(localSubscribers)
    if (localAddresses.length === 0) return

    let refreshed = 0
    for (const address of localAddresses) {
      try {
        await redis.put(getSubscriberKey(address), '1', { EX: subscriberTtlSeconds })
        refreshed++
      } catch (error: any) {
        logger.error('Failed to refresh subscriber TTL', {
          address,
          error: error?.message || error
        })
      }
    }
    logger.debug(`Refreshed TTL for ${refreshed}/${localAddresses.length} subscribers`)
  }

  return {
    async start() {
      subscriberTtlSeconds =
        (await config.getNumber('SUBSCRIBER_TTL_SECONDS')) || DEFAULT_SUBSCRIBER_TTL_SECONDS
      heartbeatIntervalMs =
        (await config.getNumber('SUBSCRIBER_HEARTBEAT_INTERVAL_MS')) || DEFAULT_HEARTBEAT_INTERVAL_MS

      // Start periodic heartbeat to refresh subscriber TTLs
      heartbeatInterval = setInterval(() => {
        refreshSubscriberTTLs().catch((error: any) => {
          logger.error('Error during subscriber heartbeat', { error: error?.message || error })
        })
      }, heartbeatIntervalMs)

      logger.info('Subscribers context started', {
        subscriberTtlSeconds,
        heartbeatIntervalMs
      })
    },

    async stop() {
      // Stop heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }

      // Clean up all local subscriber keys from Redis on shutdown
      const localAddresses = Object.keys(localSubscribers).map(normalizeAddress)
      if (localAddresses.length > 0) {
        try {
          const keys = localAddresses.map(getSubscriberKey)
          await redis.client.del(keys)
          logger.info(`Removed ${localAddresses.length} subscriber keys from Redis on shutdown`)
        } catch (error: any) {
          logger.error('Failed to remove subscriber keys from Redis on shutdown', {
            error: error?.message || error
          })
        }
      }

      // Destroy all generators and clear local emitters
      for (const address of Object.keys(localSubscribers)) {
        removeLocalSubscriber(address)
      }
    },

    getSubscribers: () => localSubscribers,

    getLocalSubscribersAddresses: () => Object.keys(localSubscribers).map(normalizeAddress),

    /**
     * Get an existing subscriber without creating one if it doesn't exist.
     * Use this in update handlers to avoid creating orphaned emitters.
     */
    getSubscriber: (address: string): Emitter<SubscriptionEventsEmitter> | undefined => {
      const normalizedAddress = normalizeAddress(address)
      return localSubscribers[normalizedAddress]
    },

    async getSubscribersAddresses(): Promise<string[]> {
      try {
        // Use SCAN instead of sMembers on a single SET to avoid loading all keys at once.
        // Each subscriber is stored as a separate key with TTL, so stale entries auto-expire.
        const addresses: string[] = []
        for await (const key of redis.client.scanIterator({
          MATCH: `${SUBSCRIBER_KEY_PREFIX}*`,
          COUNT: 200
        })) {
          addresses.push(normalizeAddress(key.slice(SUBSCRIBER_KEY_PREFIX.length)))
        }
        return addresses
      } catch (error: any) {
        logger.error('Failed to get subscribers from Redis, falling back to local', {
          error: error?.message || error
        })
        // Fallback to local subscribers if Redis fails
        return Object.keys(localSubscribers).map(normalizeAddress)
      }
    },

    getOrAddSubscriber: (address: string): Emitter<SubscriptionEventsEmitter> => {
      const normalizedAddress = normalizeAddress(address)

      if (!localSubscribers[normalizedAddress]) {
        addLocalSubscriber(normalizedAddress, mitt<SubscriptionEventsEmitter>())
        // Also add to Redis for global tracking (fire-and-forget)
        redis
          .put(getSubscriberKey(normalizedAddress), '1', { EX: subscriberTtlSeconds })
          .catch((error: any) => {
            logger.error('Failed to add subscriber key to Redis via getOrAddSubscriber', {
              address: normalizedAddress,
              error: error?.message || error
            })
          })
      }

      return localSubscribers[normalizedAddress]
    },

    async addSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>): Promise<void> {
      const normalizedAddress = normalizeAddress(address)

      // Add to local emitters
      if (!localSubscribers[normalizedAddress]) {
        localSubscribers[normalizedAddress] = subscriber
      }

      // Add subscriber key to Redis with TTL
      try {
        await redis.put(getSubscriberKey(normalizedAddress), '1', { EX: subscriberTtlSeconds })
      } catch (error: any) {
        logger.error('Failed to add subscriber key to Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    },

    async removeSubscriber(address: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)

      // Remove from local emitters
      removeLocalSubscriber(normalizedAddress)

      // Remove subscriber key from Redis
      try {
        await redis.client.del(getSubscriberKey(normalizedAddress))
      } catch (error: any) {
        logger.error('Failed to remove subscriber key from Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    },

    registerGenerator(address: string, generator: { destroy(): void }): void {
      const normalizedAddress = normalizeAddress(address)
      let generators = subscriberGenerators.get(normalizedAddress)
      if (!generators) {
        generators = new Set()
        subscriberGenerators.set(normalizedAddress, generators)
      }
      generators.add(generator)
    },

    unregisterGenerator(address: string, generator: { destroy(): void }): void {
      const normalizedAddress = normalizeAddress(address)
      const generators = subscriberGenerators.get(normalizedAddress)
      if (generators) {
        generators.delete(generator)
        if (generators.size === 0) {
          subscriberGenerators.delete(normalizedAddress)
        }
      }
    }
  }
}
