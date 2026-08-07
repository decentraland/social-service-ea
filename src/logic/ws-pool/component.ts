import { WebSocket } from 'uWebSockets.js'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents, WsUserData } from '../../types'
import { isAuthenticated } from '../../utils/wsUserData'
import { normalizeAddress } from '../../utils/address'
import { IWsPoolComponent } from './types'
import { WsConnectionRateLimitError, WsPoolFullError, WsUnauthenticatedLimitError } from './errors'

export async function createWsPoolComponent(
  components: Pick<AppComponents, 'metrics' | 'logs' | 'config'>
): Promise<IWsPoolComponent> {
  const { metrics, logs, config } = components
  const logger = logs.getLogger('ws-pool')

  const maxConnections = (await config.getNumber('WS_MAX_CONCURRENT_CONNECTIONS')) ?? 10000
  const maxUnauthenticatedConnections = (await config.getNumber('WS_MAX_UNAUTHENTICATED_CONNECTIONS')) ?? 1000
  // Per-IP caps are opt-in: they are only meaningful when the connecting address can be
  // attributed to one client, and a wrong attribution throttles every user behind the edge.
  const maxUnauthenticatedConnectionsPerIp = await config.getNumber('WS_MAX_UNAUTHENTICATED_CONNECTIONS_PER_IP')
  const maxConnectionAttemptsPerIp = await config.getNumber('WS_MAX_CONNECTION_ATTEMPTS_PER_IP')
  const connectionAttemptWindowSeconds = (await config.getNumber('WS_CONNECTION_ATTEMPT_WINDOW_IN_SECONDS')) ?? 60

  if (maxUnauthenticatedConnectionsPerIp || maxConnectionAttemptsPerIp) {
    logger.warn(
      'Per-IP WebSocket limits are enabled. They key on the TCP peer address, so behind a shared L7 proxy they throttle every user at once. Only enable them when this instance sees real client addresses.'
    )
  }

  const connections = new Map<string, WebSocket<WsUserData>>()
  const unauthenticatedConnectionIds = new Set<string>()
  const unauthenticatedConnectionsByIp = new Map<string, number>()
  const maxTrackedConnectionAttemptIps = (await config.getNumber('WS_MAX_TRACKED_CONNECTION_ATTEMPT_IPS')) ?? 100000
  const connectionAttemptsByIp = new Map<string, { count: number; windowStartedAt: number }>()
  let lastConnectionAttemptSweepAt = Date.now()

  /**
   * Drops attempt buckets whose window has closed, and — if the map is still at its cap —
   * the oldest remaining ones. Bounded by size as well as by time, since the number of
   * distinct source addresses seen within one window is not.
   */
  function sweepConnectionAttempts(now: number, attemptWindowMs: number) {
    for (const [ip, attempt] of connectionAttemptsByIp) {
      if (now - attempt.windowStartedAt >= attemptWindowMs) connectionAttemptsByIp.delete(ip)
    }
    lastConnectionAttemptSweepAt = now

    if (connectionAttemptsByIp.size < maxTrackedConnectionAttemptIps) return

    const targetSize = Math.floor(maxTrackedConnectionAttemptIps * 0.9)
    const oldestFirst = Array.from(connectionAttemptsByIp).sort(([, a], [, b]) => a.windowStartedAt - b.windowStartedAt)
    for (const [ip] of oldestFirst) {
      if (connectionAttemptsByIp.size <= targetSize) break
      connectionAttemptsByIp.delete(ip)
    }
    metrics.increment('ws_connection_attempt_tracking_evictions')
  }

  /**
   * Register a new WebSocket connection by adding it to the connections map.
   * @param ws - The WebSocket instance
   * @throws {WsPoolFullError} When the configured connection limit is reached.
   */
  function registerConnection(ws: WebSocket<WsUserData>) {
    if (connections.size >= maxConnections) {
      metrics.increment('ws_connections_rejected')
      throw new WsPoolFullError(maxConnections)
    }

    const { wsConnectionId, clientIp } = ws.getUserData()
    const now = Date.now()
    const attemptWindowMs = connectionAttemptWindowSeconds * 1000

    if (clientIp && maxConnectionAttemptsPerIp) {
      if (
        now - lastConnectionAttemptSweepAt >= attemptWindowMs ||
        connectionAttemptsByIp.size >= maxTrackedConnectionAttemptIps
      ) {
        sweepConnectionAttempts(now, attemptWindowMs)
      }
      const attempts = connectionAttemptsByIp.get(clientIp)
      const currentAttempts = !attempts || now - attempts.windowStartedAt >= attemptWindowMs ? 0 : attempts.count
      if (currentAttempts >= maxConnectionAttemptsPerIp) {
        metrics.increment('ws_unauthenticated_connections_rejected', { scope: 'client-rate' })
        throw new WsConnectionRateLimitError(maxConnectionAttemptsPerIp, connectionAttemptWindowSeconds)
      }
      connectionAttemptsByIp.set(clientIp, {
        count: currentAttempts + 1,
        windowStartedAt: currentAttempts === 0 ? now : attempts!.windowStartedAt
      })
    }

    if (unauthenticatedConnectionIds.size >= maxUnauthenticatedConnections) {
      metrics.increment('ws_unauthenticated_connections_rejected', { scope: 'global' })
      throw new WsUnauthenticatedLimitError('global', maxUnauthenticatedConnections)
    }

    if (
      clientIp &&
      maxUnauthenticatedConnectionsPerIp &&
      (unauthenticatedConnectionsByIp.get(clientIp) ?? 0) >= maxUnauthenticatedConnectionsPerIp
    ) {
      metrics.increment('ws_unauthenticated_connections_rejected', { scope: 'client' })
      throw new WsUnauthenticatedLimitError('client', maxUnauthenticatedConnectionsPerIp)
    }

    connections.set(wsConnectionId, ws)
    unauthenticatedConnectionIds.add(wsConnectionId)
    if (clientIp) {
      unauthenticatedConnectionsByIp.set(clientIp, (unauthenticatedConnectionsByIp.get(clientIp) ?? 0) + 1)
    }
    logger.debug('Registering connection', { wsConnectionId, totalConnections: connections.size })
    metrics.observe('ws_active_connections', {}, connections.size)
  }

  function markAuthenticated(data: WsUserData) {
    releaseUnauthenticatedSlot(data)
  }

  function releaseUnauthenticatedSlot(data: WsUserData) {
    if (!unauthenticatedConnectionIds.delete(data.wsConnectionId)) return

    const { clientIp } = data
    if (!clientIp) return

    const remaining = (unauthenticatedConnectionsByIp.get(clientIp) ?? 1) - 1
    if (remaining > 0) unauthenticatedConnectionsByIp.set(clientIp, remaining)
    else unauthenticatedConnectionsByIp.delete(clientIp)
  }

  /**
   * Unregister a WebSocket connection by removing it from the connections map.
   * @param data - The WebSocket user data.
   */
  function unregisterConnection(data: WsUserData) {
    const { wsConnectionId, connectionStartTime } = data
    connections.delete(wsConnectionId)
    releaseUnauthenticatedSlot(data)
    metrics.observe('ws_active_connections', {}, connections.size)

    const duration = (Date.now() - connectionStartTime) / 1000

    if (!isNaN(duration) && isFinite(duration)) {
      metrics.observe('ws_connection_duration_seconds', {}, duration)
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
    markAuthenticated,
    unregisterConnection,
    getAuthenticatedAddresses,
    getConnectionIds,
    [STOP_COMPONENT]: stop
  }
}
