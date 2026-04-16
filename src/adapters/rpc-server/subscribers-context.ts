import mitt, { Emitter } from 'mitt'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { AppComponents } from '../../types/system'
import { IWsPoolComponent } from '../../logic/ws-pool/types'

const SUBSCRIBERS_SET_KEY = 'online_subscribers'

const METRICS_INTERVAL_MS = 30_000
const DEFAULT_RECONCILIATION_INTERVAL_MS = 300_000 // 5 minutes
const SUBSCRIBERS_COUNT_WARNING_THRESHOLD = 10_000

export function createSubscribersContext(
  components: Pick<AppComponents, 'redis' | 'logs' | 'metrics' | 'config'>,
  wsPool: IWsPoolComponent
): ISubscribersContext {
  const { redis, logs, metrics, config } = components
  const logger = logs.getLogger('subscribers-context')

  // Local in-memory emitters for WebSocket connections on this instance
  const localSubscribers: Subscribers = {}

  // Track active emitterToAsyncGenerator instances per subscriber so we can
  // synchronously terminate them when the subscriber disconnects.
  const subscriberGenerators = new Map<string, Set<{ destroy(): void }>>()

  // Track active subscriptions per address to prevent duplicate stream subscriptions.
  // Key: address, Value: set of event names with an active subscription.
  const activeSubscriptions = new Map<string, Set<string>>()

  let metricsInterval: NodeJS.Timeout | null = null
  let reconciliationInterval: NodeJS.Timeout | null = null

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
      activeSubscriptions.delete(normalizedAddress)
      localSubscribers[normalizedAddress].all.clear()
      delete localSubscribers[normalizedAddress]
    }
  }

  function getGeneratorsCount(): number {
    let count = 0
    for (const generators of subscriberGenerators.values()) {
      count += generators.size
    }
    return count
  }

  async function reportMetrics(): Promise<void> {
    try {
      const localCount = Object.keys(localSubscribers).length
      const generatorsCount = getGeneratorsCount()

      metrics.observe('subscribers_local_count', {}, localCount)
      metrics.observe('subscribers_generators_count', {}, generatorsCount)

      // SCARD is O(1) — safe to call frequently
      const redisCount = await redis.sCard(SUBSCRIBERS_SET_KEY)
      metrics.observe('subscribers_redis_set_size', {}, redisCount)
    } catch (error: any) {
      logger.error('Failed to report subscriber metrics', { error: error?.message || error })
    }
  }

  /**
   * Reconciliation sweep: removes local subscribers that no longer have an active
   * WebSocket connection. This catches edge cases where the cleanup path in
   * ws-handler failed to call removeSubscriber (e.g. due to a crash or race condition).
   */
  async function reconcileStaleSubscribers(): Promise<void> {
    try {
      const activeAddresses = new Set(wsPool.getAuthenticatedAddresses())
      const localAddresses = Object.keys(localSubscribers).map(normalizeAddress)

      const staleAddresses = localAddresses.filter((address) => !activeAddresses.has(address))

      if (staleAddresses.length === 0) {
        return
      }

      logger.warn('Reconciliation found stale subscribers, removing', {
        count: staleAddresses.length,
        addresses: staleAddresses.slice(0, 5).join(', ') + (staleAddresses.length > 5 ? '...' : '')
      })

      for (const address of staleAddresses) {
        removeLocalSubscriber(address)
        try {
          await redis.sRem(SUBSCRIBERS_SET_KEY, address)
        } catch (error: any) {
          logger.error('Failed to remove stale subscriber from Redis', {
            address,
            error: error?.message || error
          })
        }
      }

      metrics.increment('subscribers_stale_cleaned', {}, staleAddresses.length)
    } catch (error: any) {
      logger.error('Failed to reconcile stale subscribers', { error: error?.message || error })
    }
  }

  return {
    async start() {
      const reconciliationIntervalMs =
        (await config.getNumber('SUBSCRIBER_RECONCILIATION_INTERVAL_MS')) ?? DEFAULT_RECONCILIATION_INTERVAL_MS

      metricsInterval = setInterval(() => {
        reportMetrics().catch(() => {})
      }, METRICS_INTERVAL_MS)

      reconciliationInterval = setInterval(() => {
        reconcileStaleSubscribers().catch(() => {})
      }, reconciliationIntervalMs)

      logger.info('Subscribers context started', {
        metricsIntervalMs: METRICS_INTERVAL_MS,
        reconciliationIntervalMs
      })
    },

    async stop() {
      if (metricsInterval) {
        clearInterval(metricsInterval)
        metricsInterval = null
      }

      if (reconciliationInterval) {
        clearInterval(reconciliationInterval)
        reconciliationInterval = null
      }

      // Clean up all local subscribers from Redis on shutdown
      const localAddresses = Object.keys(localSubscribers).map(normalizeAddress)
      if (localAddresses.length > 0) {
        try {
          await redis.sRem(SUBSCRIBERS_SET_KEY, localAddresses)
          logger.info(`Removed ${localAddresses.length} subscribers from Redis on shutdown`)
        } catch (error: any) {
          logger.error('Failed to remove subscribers from Redis on shutdown', { error: error?.message || error })
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
        // Use SSCAN instead of SMEMBERS to avoid loading the entire set at once,
        // which can spike memory if the set has accumulated stale entries.
        const addresses: string[] = []
        for await (const member of redis.client.sScanIterator(SUBSCRIBERS_SET_KEY, { COUNT: 100 })) {
          addresses.push(member)
        }

        if (addresses.length > SUBSCRIBERS_COUNT_WARNING_THRESHOLD) {
          logger.warn('Redis subscribers set is unusually large', {
            count: addresses.length,
            threshold: SUBSCRIBERS_COUNT_WARNING_THRESHOLD
          })
        }

        return addresses.map(normalizeAddress)
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
        redis.sAdd(SUBSCRIBERS_SET_KEY, normalizedAddress).catch((error: any) => {
          logger.error('Failed to add subscriber to Redis via getOrAddSubscriber', {
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

      // Add to Redis set for global tracking
      try {
        await redis.sAdd(SUBSCRIBERS_SET_KEY, normalizedAddress)
      } catch (error: any) {
        logger.error('Failed to add subscriber to Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    },

    async removeSubscriber(address: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)

      // Remove from local emitters
      removeLocalSubscriber(normalizedAddress)

      // Remove from Redis set
      try {
        await redis.sRem(SUBSCRIBERS_SET_KEY, normalizedAddress)
      } catch (error: any) {
        logger.error('Failed to remove subscriber from Redis', {
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
    },

    hasActiveSubscription(address: string, eventName: string): boolean {
      const normalizedAddress = normalizeAddress(address)
      return activeSubscriptions.get(normalizedAddress)?.has(eventName) ?? false
    },

    setActiveSubscription(address: string, eventName: string): void {
      const normalizedAddress = normalizeAddress(address)
      let events = activeSubscriptions.get(normalizedAddress)
      if (!events) {
        events = new Set()
        activeSubscriptions.set(normalizedAddress, events)
      }
      events.add(eventName)
    },

    clearActiveSubscription(address: string, eventName: string): void {
      const normalizedAddress = normalizeAddress(address)
      const events = activeSubscriptions.get(normalizedAddress)
      if (events) {
        events.delete(eventName)
        if (events.size === 0) {
          activeSubscriptions.delete(normalizedAddress)
        }
      }
    }
  }
}
