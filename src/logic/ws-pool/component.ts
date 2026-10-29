import { WebSocket } from 'uWebSockets.js'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents, WsUserData } from '../../types'
import { isAuthenticated } from '../../utils/wsUserData'
import { normalizeAddress } from '../../utils/address'
import { IWsPoolComponent } from './types'
import { WsPoolFullError, WsAdmissionError } from './errors'

export async function createWsPoolComponent(
  components: Pick<AppComponents, 'metrics' | 'logs' | 'config'>
): Promise<IWsPoolComponent> {
  const { metrics, logs, config } = components
  const logger = logs.getLogger('ws-pool')

  // Optional cap on concurrent connections. Undefined means unlimited (previous behavior).
  const maxConnections = await config.getNumber('WS_MAX_CONCURRENT_CONNECTIONS')

  const maxPerAddress = (await config.getNumber('WS_MAX_CONNECTIONS_PER_ADDRESS')) ?? 8
  const subscriptionRate = (await config.getNumber('WS_SUBSCRIPTIONS_PER_SECOND')) ?? 2
  const subscriptionBurst = (await config.getNumber('WS_SUBSCRIPTION_BURST')) ?? 24
  const addressCapacity = (await config.getNumber('WS_ADDRESS_BUDGET_CAPACITY')) ?? 10000
  if (
    ![maxPerAddress, subscriptionBurst, addressCapacity].every((value) => Number.isSafeInteger(value) && value > 0) ||
    !Number.isFinite(subscriptionRate) ||
    subscriptionRate <= 0
  )
    throw new Error('Invalid WebSocket address admission configuration')
  type Budget = { connections: Set<string>; tokens: number; updatedAt: number }
  const budgets = new Map<string, Budget>()
  const addressesByConnection = new Map<string, string>()
  const protocols = new Map<string, 'rpc' | 'stream'>()
  const protocolCounts = { rpc: 0, stream: 0 }

  function replenish(budget: Budget, now: number): void {
    budget.tokens = Math.min(
      subscriptionBurst,
      budget.tokens + (Math.max(0, now - budget.updatedAt) * subscriptionRate) / 1000
    )
    budget.updatedAt = now
  }

  function reject(connectionId: string, reason: 'connections' | 'subscriptions' | 'capacity'): never {
    metrics.increment('ws_admission_rejections', { protocol: protocols.get(connectionId) ?? 'rpc', reason })
    throw new WsAdmissionError(reason)
  }

  function claimAddress(address: string, connectionId: string): void {
    const normalized = normalizeAddress(address)
    if (addressesByConnection.has(connectionId)) return
    let budget = budgets.get(normalized)
    if (!budget) {
      // Retain depleted budgets across reconnects, and bound state without an unbounded timer per address.
      const now = performance.now()
      if (budgets.size >= addressCapacity) {
        for (const [key, candidate] of budgets) {
          replenish(candidate, now)
          if (!candidate.connections.size && candidate.tokens >= subscriptionBurst) budgets.delete(key)
        }
      }
      if (budgets.size >= addressCapacity) reject(connectionId, 'capacity')
      budget = { connections: new Set(), tokens: subscriptionBurst, updatedAt: now }
      budgets.set(normalized, budget)
    }
    if (budget.connections.size >= maxPerAddress) reject(connectionId, 'connections')
    budget.connections.add(connectionId)
    addressesByConnection.set(connectionId, normalized)
  }

  function admitSubscription(connectionId: string): void {
    const address = addressesByConnection.get(connectionId)
    const budget = address === undefined ? undefined : budgets.get(address)
    if (!budget) reject(connectionId, 'capacity')
    replenish(budget, performance.now())
    if (budget.tokens < 1) reject(connectionId, 'subscriptions')
    budget.tokens -= 1
  }

  const connections = new Map<string, WebSocket<WsUserData>>()

  /**
   * Register a new WebSocket connection by adding it to the connections map.
   * @param ws - The WebSocket instance
   * @throws {WsPoolFullError} When the configured connection limit is reached.
   */
  function registerConnection(ws: WebSocket<WsUserData>, protocol: 'rpc' | 'stream' = 'rpc') {
    if (maxConnections !== undefined && connections.size >= maxConnections) {
      metrics.increment('ws_connections_rejected')
      throw new WsPoolFullError(maxConnections)
    }

    const { wsConnectionId } = ws.getUserData()
    if (connections.has(wsConnectionId)) return
    connections.set(wsConnectionId, ws)
    protocols.set(wsConnectionId, protocol)
    protocolCounts[protocol] += 1
    metrics.observe('ws_active_connections_by_protocol', { protocol }, protocolCounts[protocol])
    logger.debug('Registering connection', { wsConnectionId, totalConnections: connections.size })
    metrics.observe('ws_active_connections', {}, connections.size)
  }

  /**
   * Unregister a WebSocket connection by removing it from the connections map.
   * @param data - The WebSocket user data.
   */
  function unregisterConnection(data: WsUserData) {
    const { wsConnectionId, connectionStartTime } = data
    const protocol = protocols.get(wsConnectionId)
    protocols.delete(wsConnectionId)
    if (protocol) {
      protocolCounts[protocol] -= 1
      metrics.observe('ws_active_connections_by_protocol', { protocol }, protocolCounts[protocol])
    }
    const address = addressesByConnection.get(wsConnectionId)
    if (address !== undefined) budgets.get(address)?.connections.delete(wsConnectionId)
    addressesByConnection.delete(wsConnectionId)
    connections.delete(wsConnectionId)
    metrics.observe('ws_active_connections', {}, connections.size)

    const duration = (Date.now() - connectionStartTime) / 1000

    if (!isNaN(duration) && isFinite(duration)) {
      metrics.observe('ws_connection_duration_seconds', {}, duration)
      if (protocol) metrics.observe('ws_connection_duration_seconds_by_protocol', { protocol }, duration)
    }

    logger.debug('Unregistering connection', {
      wsConnectionId,
      totalConnections: connections.size,
      durationSeconds: duration || 'N/A'
    })
  }

  async function stop() {
    logger.info('Shutting down WebSocket pool')
    for (const connection of connections.values()) {
      // Close each connection independently: getUserData()/end() throw when accessing a socket
      // that is already closing, and one throw must not abort the graceful shutdown of the
      // remaining sockets.
      try {
        logger.info('Shutting down connection', { wsConnectionId: connection.getUserData().wsConnectionId })
        connection.end(1001, 'Server shutting down') // 1001 = Going away
      } catch (error: any) {
        logger.warn('Failed to close connection during shutdown', { error: error?.message ?? String(error) })
      }
    }
  }

  /**
   * Returns the normalized addresses of all currently authenticated WebSocket connections.
   * Used by the reconciliation sweep to identify stale local subscribers.
   */
  function getAuthenticatedAddresses(): string[] {
    const addresses: string[] = []
    for (const ws of connections.values()) {
      try {
        const data = ws.getUserData()
        if (isAuthenticated(data)) {
          addresses.push(normalizeAddress(data.address))
        }
      } catch {
        // getUserData() can throw if the socket was closed — skip it
      }
    }
    return addresses
  }

  /**
   * Returns the wsConnectionIds of all currently registered connections. Used by the
   * reconciliation sweep to identify subscriber state whose socket is gone.
   */
  function getConnectionIds(): string[] {
    return Array.from(connections.keys())
  }

  return {
    registerConnection,
    claimAddress,
    admitSubscription,
    unregisterConnection,
    getAuthenticatedAddresses,
    getConnectionIds,
    [STOP_COMPONENT]: stop
  }
}
