import { WebSocket } from 'uWebSockets.js'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents, WsProtocol, WsUserData } from '../../types'
import { isAuthenticated } from '../../utils/wsUserData'
import { normalizeAddress } from '../../utils/address'
import { IWsPoolComponent } from './types'
import { WsPoolFullError } from './errors'

export async function createWsPoolComponent(
  components: Pick<AppComponents, 'metrics' | 'logs' | 'config'>
): Promise<IWsPoolComponent> {
  const { metrics, logs, config } = components
  const logger = logs.getLogger('ws-pool')

  // Optional cap on concurrent connections. Undefined means unlimited (previous behavior).
  const maxConnections = await config.getNumber('WS_MAX_CONCURRENT_CONNECTIONS')

  const protocolCounts: Record<WsProtocol, number> = { rpc: 0, stream: 0 }

  const connections = new Map<string, WebSocket<WsUserData>>()

  /**
   * Register a new WebSocket connection by adding it to the connections map.
   * @param ws - The WebSocket instance
   * @throws {WsPoolFullError} When the configured connection limit is reached.
   */
  function registerConnection(ws: WebSocket<WsUserData>) {
    if (maxConnections !== undefined && connections.size >= maxConnections) {
      metrics.increment('ws_connections_rejected')
      throw new WsPoolFullError(maxConnections)
    }

    const { wsConnectionId, protocol } = ws.getUserData()
    if (connections.has(wsConnectionId)) return
    connections.set(wsConnectionId, ws)
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
    const { wsConnectionId, connectionStartTime, protocol } = data
    if (connections.delete(wsConnectionId)) {
      protocolCounts[protocol] -= 1
      metrics.observe('ws_active_connections_by_protocol', { protocol }, protocolCounts[protocol])
    }
    metrics.observe('ws_active_connections', {}, connections.size)

    const duration = (Date.now() - connectionStartTime) / 1000

    if (!isNaN(duration) && isFinite(duration)) {
      metrics.observe('ws_connection_duration_seconds', {}, duration)
      metrics.observe('ws_connection_duration_seconds_by_protocol', { protocol }, duration)
    }

    logger.debug('Unregistering connection', {
      wsConnectionId,
      totalConnections: connections.size,
      durationSeconds: duration || 'N/A'
    })
  }

  /** Ends a registered socket of either protocol; its close callback releases it. */
  function endConnection(wsConnectionId: string, code: number, reason: string): void {
    try {
      connections.get(wsConnectionId)?.end(code, reason)
    } catch {
      // end() throws on a socket that is already closing.
    }
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
    endConnection,
    unregisterConnection,
    getAuthenticatedAddresses,
    getConnectionIds,
    [STOP_COMPONENT]: stop
  }
}
