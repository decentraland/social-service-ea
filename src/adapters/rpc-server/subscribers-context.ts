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

  // One shared in-memory emitter per address. The same address can be connected from
  // multiple places at once (e.g. the website and the in-world client); every connection
  // for the address attaches its own generators as listeners on this single emitter, so a
  // pub/sub fan-out is a single emit that reaches all of them.
  const localSubscribers: Subscribers = {}

  // Active emitterToAsyncGenerator instances per connection, so we can synchronously
  // terminate exactly one connection's streams on disconnect without touching another
  // connection for the same address. Key: wsConnectionId.
  const subscriberGenerators = new Map<string, Set<{ destroy(): void }>>()

  // Active subscriptions per connection, to prevent a single connection from opening the
  // same stream twice (each would allocate another generator + value queue). Scoped per
  // connection so two connections for the same address don't block each other.
  // Key: wsConnectionId, Value: set of event names with an active subscription.
  const activeSubscriptions = new Map<string, Set<string>>()

  // Live connections per address (reference count). The shared emitter and the Redis
  // online entry live as long as at least one connection for the address is open.
  // Key: normalized address, Value: set of wsConnectionIds.
  const connectionsByAddress = new Map<string, Set<string>>()

  let metricsInterval: NodeJS.Timeout | null = null
  let reconciliationInterval: NodeJS.Timeout | null = null

  function ensureEmitter(normalizedAddress: string): Emitter<SubscriptionEventsEmitter> {
    if (!localSubscribers[normalizedAddress]) {
      localSubscribers[normalizedAddress] = mitt<SubscriptionEventsEmitter>()
    }
    return localSubscribers[normalizedAddress]
  }

  function destroyGeneratorsForConnection(wsConnectionId: string): void {
    const generators = subscriberGenerators.get(wsConnectionId)
    if (generators) {
      for (const gen of generators) {
        gen.destroy()
      }
      generators.clear()
      subscriberGenerators.delete(wsConnectionId)
    }
  }

  /**
   * Tear down ALL state for an address (every connection it has). Used by the
   * reconciliation sweep and on shutdown — not on a normal single-connection disconnect.
   * Redis is handled by the callers (reconciliation/stop) so this stays side-effect free.
   */
  function removeLocalSubscriber(address: string): void {
    const normalizedAddress = normalizeAddress(address)

    const connectionIds = connectionsByAddress.get(normalizedAddress)
    if (connectionIds) {
      for (const wsConnectionId of connectionIds) {
        // Destroy generators first so pending next() calls resolve before we clear the
        // emitter handlers (prevents the deadlock).
        destroyGeneratorsForConnection(wsConnectionId)
        activeSubscriptions.delete(wsConnectionId)
      }
      connectionsByAddress.delete(normalizedAddress)
    }

    if (localSubscribers[normalizedAddress]) {
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
   * Reconciliation sweep: removes local subscribers that no longer have any active
   * WebSocket connection. This catches edge cases where the cleanup path in ws-handler
   * failed to call removeConnection (e.g. due to a crash or race condition).
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
     * Get an existing subscriber emitter without creating one if it doesn't exist.
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

    /**
     * Ensure and return the shared per-address emitter. No Redis side effects — the Redis
     * online entry is reference-counted by addConnection/removeConnection.
     */
    getOrAddSubscriber: (address: string): Emitter<SubscriptionEventsEmitter> => {
      return ensureEmitter(normalizeAddress(address))
    },

    /**
     * Register a live connection for an address. Creates the shared emitter if needed and,
     * on the FIRST connection for the address, marks it online in Redis. Supports multiple
     * concurrent connections per address.
     */
    addConnection(address: string, wsConnectionId: string): void {
      const normalizedAddress = normalizeAddress(address)

      ensureEmitter(normalizedAddress)

      let connectionIds = connectionsByAddress.get(normalizedAddress)
      if (!connectionIds) {
        connectionIds = new Set()
        connectionsByAddress.set(normalizedAddress, connectionIds)
      }

      const isFirstConnection = connectionIds.size === 0
      connectionIds.add(wsConnectionId)

      if (isFirstConnection) {
        // Offline -> online transition for this address (fire-and-forget).
        redis.sAdd(SUBSCRIBERS_SET_KEY, normalizedAddress).catch((error: any) => {
          logger.error('Failed to add subscriber to Redis', {
            address: normalizedAddress,
            error: error?.message || error
          })
        })
      }
    },

    /**
     * Remove a connection for an address. Tears down only this connection's generators and
     * active-subscription state — other connections for the same address are untouched.
     * Returns true if this was the LAST connection for the address, in which case the shared
     * emitter is cleared and the address is removed from the Redis online set.
     */
    removeConnection(address: string, wsConnectionId: string): boolean {
      const normalizedAddress = normalizeAddress(address)

      // Always tear down this connection's own streams/dedup state (idempotent).
      destroyGeneratorsForConnection(wsConnectionId)
      activeSubscriptions.delete(wsConnectionId)

      const connectionIds = connectionsByAddress.get(normalizedAddress)
      if (!connectionIds || !connectionIds.has(wsConnectionId)) {
        // Connection already removed (e.g. close fired twice) — not a meaningful transition.
        return false
      }

      connectionIds.delete(wsConnectionId)
      if (connectionIds.size > 0) {
        // Other connections for this address are still alive — keep the emitter & Redis entry.
        return false
      }

      // Last connection for this address: clear the shared emitter and mark offline.
      connectionsByAddress.delete(normalizedAddress)
      if (localSubscribers[normalizedAddress]) {
        localSubscribers[normalizedAddress].all.clear()
        delete localSubscribers[normalizedAddress]
      }
      redis.sRem(SUBSCRIBERS_SET_KEY, normalizedAddress).catch((error: any) => {
        logger.error('Failed to remove subscriber from Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      })

      return true
    },

    // Compatibility/test helpers. Production code uses addConnection/removeConnection for the
    // reference-counted, per-connection lifecycle; these operate at the address level and do
    // not track a connection, so prefer the connection-scoped methods outside of tests.
    async addSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      if (!localSubscribers[normalizedAddress]) {
        localSubscribers[normalizedAddress] = subscriber
      }
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
      removeLocalSubscriber(normalizedAddress)
      try {
        await redis.sRem(SUBSCRIBERS_SET_KEY, normalizedAddress)
      } catch (error: any) {
        logger.error('Failed to remove subscriber from Redis', {
          address: normalizedAddress,
          error: error?.message || error
        })
      }
    },

    registerGenerator(wsConnectionId: string, generator: { destroy(): void }): void {
      let generators = subscriberGenerators.get(wsConnectionId)
      if (!generators) {
        generators = new Set()
        subscriberGenerators.set(wsConnectionId, generators)
      }
      generators.add(generator)
    },

    unregisterGenerator(wsConnectionId: string, generator: { destroy(): void }): void {
      const generators = subscriberGenerators.get(wsConnectionId)
      if (generators) {
        generators.delete(generator)
        if (generators.size === 0) {
          subscriberGenerators.delete(wsConnectionId)
        }
      }
    },

    hasActiveSubscription(wsConnectionId: string, eventName: string): boolean {
      return activeSubscriptions.get(wsConnectionId)?.has(eventName) ?? false
    },

    setActiveSubscription(wsConnectionId: string, eventName: string): void {
      let events = activeSubscriptions.get(wsConnectionId)
      if (!events) {
        events = new Set()
        activeSubscriptions.set(wsConnectionId, events)
      }
      events.add(eventName)
    },

    clearActiveSubscription(wsConnectionId: string, eventName: string): void {
      const events = activeSubscriptions.get(wsConnectionId)
      if (events) {
        events.delete(eventName)
        if (events.size === 0) {
          activeSubscriptions.delete(wsConnectionId)
        }
      }
    }
  }
}
