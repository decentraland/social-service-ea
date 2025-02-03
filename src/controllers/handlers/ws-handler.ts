import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsAuthenticatedUserData, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, UWebSocketTransport } from '../../utils/UWebSocketTransport'
import { isNotAuthenticated } from '../../utils/wsUserData'

const textDecoder = new TextDecoder()

const CONNECTION_TIMEOUT_MS = 30000
const HEARTBEAT_INTERVAL_MS = 30000
const HEARTBEAT_TIMEOUT_MS = 5000
const RECONNECT_INTERVAL_MS = 1000
const MAX_RECONNECT_ATTEMPTS = 5

export async function registerWsHandler(
  components: Pick<AppComponents, 'logs' | 'server' | 'metrics' | 'fetcher' | 'rpcServer'>
) {
  const { logs, server, metrics, fetcher, rpcServer } = components
  const logger = logs.getLogger('ws-handler')

  function changeStage(data: WsUserData, newData: WsUserData) {
    Object.assign(data, newData)
  }

  function setupHeartbeat(ws: any, data: WsAuthenticatedUserData) {
    if (data.heartbeatInterval) {
      clearInterval(data.heartbeatInterval)
    }

    data.heartbeatInterval = setInterval(async () => {
      if (!data.isConnected) {
        clearInterval(data.heartbeatInterval)
        return
      }

      if (data.lastHeartbeat && Date.now() - data.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        logger.warn('Heartbeat timeout', { address: data.address })
        metrics.increment('ws_heartbeats_missed', { address: data.address })

        data.isConnected = false
        startReconnection(ws, data)
        return
      }

      try {
        ws.send(JSON.stringify({ type: 'heartbeat' }))
      } catch (error: any) {
        logger.error('Error sending heartbeat', { error, address: data.address })
        metrics.increment('ws_errors', { address: data.address })
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function startReconnection(ws: any, data: WsAuthenticatedUserData) {
    if (data.reconnectTimeout) {
      clearTimeout(data.reconnectTimeout)
    }

    data.reconnectAttempts = 0
    attemptReconnection(ws, data)
  }

  function attemptReconnection(ws: any, data: WsAuthenticatedUserData) {
    if (data.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached', { address: data.address })
      ws.close()
      return
    }

    try {
      data.eventEmitter.all.clear()

      const transport = UWebSocketTransport(ws, data.eventEmitter)

      rpcServer.attachUser({ transport, address: data.address })

      data.reconnectAttempts = 0
      data.lastHeartbeat = Date.now()
      data.isConnected = true

      setupHeartbeat(ws, data)

      logger.info('Successfully reconnected', { address: data.address })
    } catch (error: any) {
      logger.error('Reconnection failed', { error, address: data.address })
      metrics.increment('ws_errors', { address: data.address })

      data.reconnectAttempts++

      data.reconnectTimeout = setTimeout(() => {
        attemptReconnection(ws, data)
      }, RECONNECT_INTERVAL_MS)
    }
  }

  server.app.ws<WsUserData>('/', {
    idleTimeout: 0,
    upgrade: (res, req, context) => {
      logger.debug('upgrade requested')
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      res.upgrade(
        {
          isConnected: false,
          auth: false
        },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      )
      onRequestEnd(metrics, labels, 101, end)
    },
    open: (ws) => {
      const data = ws.getUserData()
      metrics.increment('ws_connections')

      if (isNotAuthenticated(data)) {
        data.timeout = setTimeout(() => {
          try {
            logger.error('Closing connection, no auth chain received')
            ws.end()
          } catch (error: any) {
            logger.error('Error closing connection, no auth chain received', error)
            metrics.increment('ws_errors')
          }
        }, CONNECTION_TIMEOUT_MS)
      }

      data.isConnected = true
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      metrics.increment('ws_messages_received')

      if (data.auth) {
        if (message.toString() === 'heartbeat') {
          data.lastHeartbeat = Date.now()
          return
        }

        try {
          if (!data.isConnected) {
            logger.warn('Received message but connection is marked as disconnected', { address: data.address })
            return
          }

          data.eventEmitter.emit('message', message)
          metrics.increment('ws_messages_sent', { address: data.address })
        } catch (error: any) {
          logger.error('Error emitting message', {
            error,
            address: data.address,
            isConnected: String(data.isConnected),
            hasEventEmitter: String(!!data.eventEmitter)
          })
          metrics.increment('ws_errors', { address: data.address })
          ws.send(JSON.stringify({ error: 'Error processing message', message: error.message }))
        }
      } else if (isNotAuthenticated(data)) {
        clearTimeout(data.timeout)
        data.timeout = undefined

        try {
          const authChainMessage = textDecoder.decode(message)

          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('address > ', { address })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          changeStage(data, {
            auth: true,
            address,
            eventEmitter,
            isConnected: true,
            lastHeartbeat: Date.now(),
            heartbeatInterval: undefined,
            reconnectAttempts: 0,
            reconnectTimeout: undefined
          })

          const transport = UWebSocketTransport(ws, eventEmitter)

          rpcServer.attachUser({ transport, address })

          if (data.auth) {
            setupHeartbeat(ws, data)
          }

          transport.on('error', (err) => {
            if (err && err.message) {
              logger.error(err)
            }
          })
        } catch (error: any) {
          logger.error(`Error verifying auth chain: ${error.message}`)
          ws.close()
        }
      }
    },
    close: (ws, code, _message) => {
      logger.debug(`Websocket closed ${code}`)
      const data = ws.getUserData()

      if (data.auth) {
        data.eventEmitter.emit('close', code)
        clearInterval(data.heartbeatInterval)
        clearTimeout(data.reconnectTimeout)

        metrics.increment('ws_connections', { address: data.address })
      } else {
        clearTimeout(data.timeout)
        metrics.increment('ws_connections')
      }

      data.isConnected = false
      changeStage(data, { auth: false, isConnected: false, timeout: undefined })
    }
  })
}
