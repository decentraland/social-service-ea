import mitt, { Emitter } from 'mitt'
import {
  SubscriptionStreamClosed,
  SubscriptionStreamClosedReason
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { AppComponents } from '../../types/system'
import { IWsPoolComponent } from '../../logic/ws-pool/types'

const METRICS_INTERVAL_MS = 30_000
const DEFAULT_RECONCILIATION_INTERVAL_MS = 300_000 // 5 minutes

// Fan-out is derived per-instance from the local subscribers (every update is broadcast to
// every instance via pub/sub, and delivery is local-only), which is crash-safe and avoids
// cross-instance presence drift — so this component holds no shared/Redis state.
export function createSubscribersContext(
  components: Pick<AppComponents, 'logs' | 'metrics' | 'config'>,
  wsPool: IWsPoolComponent
): ISubscribersContext {
  const { logs, metrics, config } = components
  const logger = logs.getLogger('subscribers-context')

  // One shared in-memory emitter per address. The same address can be connected from
  // multiple places at once (e.g. the website and the in-world client); every connection
  // for the address attaches its own generators as listeners on this single emitter, so a
  // pub/sub fan-out is a single emit that reaches all of them.
  const localSubscribers: Subscribers = {}

  // Active emitterToAsyncGenerator instances per connection, so we can synchronously
  // terminate exactly one connection's streams on disconnect without touching another
  // connection for the same address. Key: wsConnectionId.
  const subscriberGenerators = new Map<string, Set<{ destroy(closeReason?: SubscriptionStreamClosed): void }>>()

  // Active subscriptions per connection, to prevent a single connection from opening the
  // same stream twice (each would allocate another generator + value queue). Scoped per
  // connection so two connections for the same address don't block each other.
  // Key: wsConnectionId, Value: set of event names with an active subscription.
  const activeSubscriptions = new Map<string, Set<string>>()

  // Live connections per address (reference count). The shared emitter lives as long as at
  // least one connection for the address is open.
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

  // The optional closeReason is recorded by each generator so its consumer can send the
  // client a final "stream closed" message. Best-effort: it is only deliverable while the
  // connection is still alive (e.g. shutdown drain); teardowns triggered by the socket
  // already being gone can't inform anyone.
  function destroyGeneratorsForConnection(wsConnectionId: string, closeReason?: SubscriptionStreamClosed): void {
    const generators = subscriberGenerators.get(wsConnectionId)
    if (generators) {
      for (const gen of generators) {
        gen.destroy(closeReason)
      }
      generators.clear()
      subscriberGenerators.delete(wsConnectionId)
    }
  }

  // Clear and drop the shared per-address emitter. Callers must destroy the address's
  // generators first so pending next() calls resolve before the handlers are cleared
  // (prevents the deadlock).
  function clearAddressEmitter(normalizedAddress: string): void {
    const emitter = localSubscribers[normalizedAddress]
    if (emitter) {
      emitter.all.clear()
      delete localSubscribers[normalizedAddress]
    }
  }

  /**
   * Tear down ALL state for an address (every connection it has). Used by the
   * reconciliation sweep and on shutdown — not on a normal single-connection disconnect.
   */
  function removeLocalSubscriber(address: string, closeReason?: SubscriptionStreamClosed): void {
    const normalizedAddress = normalizeAddress(address)

    const connectionIds = connectionsByAddress.get(normalizedAddress)
    if (connectionIds) {
      for (const wsConnectionId of connectionIds) {
        // Destroy generators first so pending next() calls resolve before we clear the
        // emitter handlers (prevents the deadlock).
        destroyGeneratorsForConnection(wsConnectionId, closeReason)
        activeSubscriptions.delete(wsConnectionId)
      }
      connectionsByAddress.delete(normalizedAddress)
    }

    clearAddressEmitter(normalizedAddress)
  }

  function getGeneratorsCount(): number {
    let count = 0
    for (const generators of subscriberGenerators.values()) {
      count += generators.size
    }
    return count
  }

  function reportMetrics(): void {
    try {
      metrics.observe('subscribers_local_count', {}, Object.keys(localSubscribers).length)
      metrics.observe('subscribers_generators_count', {}, getGeneratorsCount())
    } catch (error: any) {
      logger.error('Failed to report subscriber metrics', { error: error?.message || error })
    }
  }

  /**
   * Reconciliation sweep: removes local subscribers that no longer have any active
   * WebSocket connection. This catches edge cases where the cleanup path in ws-handler
   * failed to call removeConnection (e.g. due to a crash or race condition).
   */
  function reconcileStaleSubscribers(): void {
    try {
      const activeAddresses = new Set(wsPool.getAuthenticatedAddresses())
      const localAddresses = Object.keys(localSubscribers).map(normalizeAddress)

      const staleAddresses = localAddresses.filter((address) => !activeAddresses.has(address))

      if (staleAddresses.length > 0) {
        logger.warn('Reconciliation found stale subscribers, removing', {
          count: staleAddresses.length,
          addresses: staleAddresses.slice(0, 5).join(', ') + (staleAddresses.length > 5 ? '...' : '')
        })

        for (const address of staleAddresses) {
          removeLocalSubscriber(address, { reason: SubscriptionStreamClosedReason.STREAM_CLOSED_STALE_SUBSCRIPTION })
        }

        metrics.increment('subscribers_stale_cleaned', {}, staleAddresses.length)
      }

      reconcileStaleConnections()
    } catch (error: any) {
      logger.error('Failed to reconcile stale subscribers', { error: error?.message || error })
    }
  }

  /**
   * Removes tracked connections whose WebSocket is gone while the address still has other
   * live connections (the address-level sweep above can't see those). Without this, a leaked
   * wsConnectionId under a still-active address keeps the address "connected" forever:
   * removeConnection never reports the last connection, so the user is never marked offline
   * and the shared emitter never freed once the real connections close.
   */
  function reconcileStaleConnections(): void {
    const liveConnectionIds = new Set(wsPool.getConnectionIds())
    let staleConnectionsCount = 0

    for (const [address, connectionIds] of connectionsByAddress) {
      for (const wsConnectionId of Array.from(connectionIds)) {
        if (liveConnectionIds.has(wsConnectionId)) {
          continue
        }

        // Same teardown as removeConnection: generators first so pending next() calls
        // resolve before any emitter handlers are cleared.
        destroyGeneratorsForConnection(wsConnectionId, {
          reason: SubscriptionStreamClosedReason.STREAM_CLOSED_STALE_SUBSCRIPTION
        })
        activeSubscriptions.delete(wsConnectionId)
        connectionIds.delete(wsConnectionId)
        staleConnectionsCount++
      }

      if (connectionIds.size === 0) {
        connectionsByAddress.delete(address)
        clearAddressEmitter(address)
      }
    }

    if (staleConnectionsCount > 0) {
      logger.warn('Reconciliation found stale connections, removing', { count: staleConnectionsCount })
      metrics.increment('subscribers_stale_connections_cleaned', {}, staleConnectionsCount)
    }
  }

  return {
    async start() {
      const reconciliationIntervalMs =
        (await config.getNumber('SUBSCRIBER_RECONCILIATION_INTERVAL_MS')) ?? DEFAULT_RECONCILIATION_INTERVAL_MS

      metricsInterval = setInterval(reportMetrics, METRICS_INTERVAL_MS)
      reconciliationInterval = setInterval(reconcileStaleSubscribers, reconciliationIntervalMs)

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

      // Destroy all generators and clear local emitters. The reason lets streams whose
      // connection is still draining tell the client the server is going away.
      for (const address of Object.keys(localSubscribers)) {
        removeLocalSubscriber(address, {
          reason: SubscriptionStreamClosedReason.STREAM_CLOSED_SERVER_SHUTTING_DOWN
        })
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

    /**
     * Register a live connection for an address, creating the shared emitter if needed.
     * Supports multiple concurrent connections per address.
     */
    addConnection(address: string, wsConnectionId: string): void {
      const normalizedAddress = normalizeAddress(address)

      ensureEmitter(normalizedAddress)

      let connectionIds = connectionsByAddress.get(normalizedAddress)
      if (!connectionIds) {
        connectionIds = new Set()
        connectionsByAddress.set(normalizedAddress, connectionIds)
      }
      connectionIds.add(wsConnectionId)
    },

    /**
     * Remove a connection for an address. Tears down only this connection's generators and
     * active-subscription state — other connections for the same address are untouched.
     * Returns true if this was the LAST connection for the address, in which case the shared
     * emitter is cleared.
     */
    removeConnection(address: string, wsConnectionId: string, closeReason?: SubscriptionStreamClosed): boolean {
      const normalizedAddress = normalizeAddress(address)

      const connectionIds = connectionsByAddress.get(normalizedAddress)
      if (!connectionIds || !connectionIds.has(wsConnectionId)) {
        // Connection isn't tracked (e.g. close fired twice) — nothing to tear down.
        return false
      }

      // Tear down only this connection's streams/dedup state. Each generator's destroy()
      // calls emitter.off for its own handler, so sibling connections are untouched.
      destroyGeneratorsForConnection(wsConnectionId, closeReason)
      activeSubscriptions.delete(wsConnectionId)
      connectionIds.delete(wsConnectionId)

      if (connectionIds.size > 0) {
        // Other connections for this address are still alive — keep the emitter.
        return false
      }

      // Last connection for this address: clear the shared emitter.
      connectionsByAddress.delete(normalizedAddress)
      clearAddressEmitter(normalizedAddress)

      return true
    },

    registerGenerator(wsConnectionId: string, generator: { destroy(closeReason?: SubscriptionStreamClosed): void }): void {
      let generators = subscriberGenerators.get(wsConnectionId)
      if (!generators) {
        generators = new Set()
        subscriberGenerators.set(wsConnectionId, generators)
      }
      generators.add(generator)
    },

    unregisterGenerator(
      wsConnectionId: string,
      generator: { destroy(closeReason?: SubscriptionStreamClosed): void }
    ): void {
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
