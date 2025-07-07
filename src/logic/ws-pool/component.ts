import { WebSocket } from 'uWebSockets.js'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents, WsUserData } from '../../types'
import { IWsPoolComponent } from './types'

export function createWsPoolComponent(components: Pick<AppComponents, 'metrics' | 'logs'>): IWsPoolComponent {
  const { metrics, logs } = components
  const logger = logs.getLogger('ws-pool')

  const connections = new Map<string, WebSocket<WsUserData>>()

  /**
   * Register a new WebSocket connection by adding it to the connections map.
   * @param ws - The WebSocket instance
   */
  function registerConnection(ws: WebSocket<WsUserData>) {
    const { wsConnectionId } = ws.getUserData()
    connections.set(wsConnectionId, ws)
    logger.debug('Registering connection', { wsConnectionId, totalConnections: connections.size })
    metrics.observe('ws_active_connections', {}, connections.size)
  }

  /**
   * Unregister a WebSocket connection by removing it from the connections map.
   * @param data - The WebSocket user data.
   */
  function unregisterConnection(data: WsUserData) {
    const { wsConnectionId, connectionStartTime } = data
    connections.delete(wsConnectionId)
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
      logger.info('Shutting down connection', { wsConnectionId: connection.getUserData().wsConnectionId })
      connection.end(1001, 'Server shutting down') // 1001 = Going away
    }
  }

  return {
    registerConnection,
    unregisterConnection,
    [STOP_COMPONENT]: stop
  }
}
