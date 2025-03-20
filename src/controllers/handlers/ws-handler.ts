import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, createUWebSocketTransport } from '../../utils/UWebSocketTransport'
import { isAuthenticated, isNotAuthenticated } from '../../utils/wsUserData'
import { randomUUID } from 'crypto'

const textDecoder = new TextDecoder()

export const FIVE_MINUTES_IN_SECONDS = 300
export const THREE_MINUTES_IN_MS = 180000

const getAddress = (data: WsUserData) => {
  return isAuthenticated(data) ? data.address : 'Not authenticated'
}

export async function registerWsHandler(
  components: Pick<AppComponents, 'logs' | 'server' | 'metrics' | 'fetcher' | 'rpcServer' | 'config' | 'wsPool'>
) {
  const { logs, server, metrics, fetcher, rpcServer, config, wsPool } = components
  const logger = logs.getLogger('ws-handler')

  function changeStage(data: WsUserData, newData: Partial<WsUserData>) {
    Object.assign(data, { ...data, ...newData })
  }

  server.app.ws<WsUserData>('/', {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? FIVE_MINUTES_IN_SECONDS, // In seconds
    sendPingsAutomatically: true,
    upgrade: (res, req, context) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      const wsConnectionId = randomUUID()

      logger.debug('[DEBUGGING CONNECTION] Upgrade requested', {
        wsConnectionId,
        ip: req.getHeader('x-forwarded-for'),
        protocol: req.getHeader('sec-websocket-protocol')
      })

      res.upgrade(
        {
          isConnected: false,
          auth: false,
          wsConnectionId,
          transport: null
        },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      )

      onRequestEnd(metrics, labels, 101, end)
    },
    open: async (ws) => {
      const data = ws.getUserData()

      logger.debug('[DEBUGGING CONNECTION] Opening connection', {
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        auth: String(data.auth),
        address: getAddress(data)
      })

      try {
        await wsPool.acquireConnection(data.wsConnectionId)
        logger.debug('[DEBUGGING CONNECTION] Connection acquired', {
          wsConnectionId: data.wsConnectionId,
          address: getAddress(data)
        })

        if (isNotAuthenticated(data)) {
          data.timeout = setTimeout(() => {
            try {
              logger.error('Closing connection, no auth chain received', {
                wsConnectionId: data.wsConnectionId
              })
              ws.end()
            } catch (err) {}
          }, THREE_MINUTES_IN_MS)
        }

        changeStage(data, { isConnected: true, connectionStartTime: Date.now() })
        logger.debug('WebSocket opened', { wsConnectionId: data.wsConnectionId })
      } catch (error: any) {
        logger.debug('[DEBUGGING CONNECTION] Failed to acquire connection', {
          wsConnectionId: data.wsConnectionId,
          error: error.message
        })
        ws.end(1013, 'Unable to acquire connection') // 1013 = Try again later
      }
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      logger.debug('[DEBUGGING CONNECTION] Message received', {
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        auth: String(data.auth),
        messageSize: message.byteLength,
        address: getAddress(data)
      })
      metrics.increment('ws_messages_received')

      if (isNotAuthenticated(data)) {
        try {
          const authChainMessage = textDecoder.decode(message)

          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('Authenticated User', { address, wsConnectionId: data.wsConnectionId })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          const transport = await createUWebSocketTransport(ws, eventEmitter, config, logs)

          changeStage(data, {
            auth: true,
            address,
            eventEmitter,
            isConnected: true,
            transport
          })

          if (data.timeout) {
            clearTimeout(data.timeout)
            delete data.timeout
          }

          rpcServer.attachUser({ transport, address })

          transport.on('close', () => {
            logger.debug('[DEBUGGING CONNECTION] Transport close event received', {
              wsConnectionId: data.wsConnectionId,
              address
            })
            rpcServer.detachUser(address)
          })

          if (data.wsConnectionId) {
            wsPool.updateActivity(data.wsConnectionId)
          }
        } catch (error: any) {
          logger.error(`Error verifying auth chain: ${error.message}`, {
            wsConnectionId: data.wsConnectionId
          })
          metrics.increment('ws_auth_errors')
          ws.close()
        }
      } else {
        try {
          logger.info('Received message', {
            wsConnectionId: data.wsConnectionId,
            address: getAddress(data)
          })

          if (!data.isConnected) {
            logger.warn('Received message but connection is marked as disconnected', {
              address: getAddress(data),
              wsConnectionId: data.wsConnectionId
            })
            return
          }

          data.eventEmitter.emit('message', message)
          metrics.increment('ws_messages_sent')

          if (data.wsConnectionId) {
            wsPool.updateActivity(data.wsConnectionId)
          }
        } catch (error: any) {
          logger.error('Error emitting message', {
            error,
            address: getAddress(data),
            wsConnectionId: data.wsConnectionId,
            isConnected: String(data.isConnected),
            hasEventEmitter: String(!!data.eventEmitter)
          })
          metrics.increment('ws_errors')
          ws.send(JSON.stringify({ error: 'Error processing message', message: error.message }))
        }
      }
    },
    close: (ws, code, message) => {
      const data = ws.getUserData()
      const { wsConnectionId } = data
      const messageText = textDecoder.decode(message)

      logger.debug('[DEBUGGING CONNECTION] Connection closing', {
        wsConnectionId,
        code,
        message: messageText,
        isConnected: String(data.isConnected),
        auth: String(data.auth)
      })

      if (isAuthenticated(data)) {
        try {
          data.transport.close()
          rpcServer.detachUser(data.address)
          data.eventEmitter.emit('close', { code, reason: messageText })
          data.eventEmitter.all.clear()
        } catch (error: any) {
          logger.error('Error during connection cleanup', {
            error: error.message,
            address: getAddress(data),
            wsConnectionId
          })
        }
      }

      if (isNotAuthenticated(data) && data.timeout) {
        clearTimeout(data.timeout)
        delete data.timeout
      }

      if (wsConnectionId) {
        wsPool.releaseConnection(wsConnectionId)
      }

      changeStage(data, {
        auth: false,
        isConnected: false
      })

      logger.debug('[DEBUGGING CONNECTION] Connection cleanup completed', {
        wsConnectionId,
        code
      })

      logger.debug('WebSocket closed', {
        code,
        reason: messageText,
        wsConnectionId,
        ...(isAuthenticated(data) && { address: data.address })
      })

      // Calculate and record connection duration
      const duration = (Date.now() - data.connectionStartTime) / 1000 // Convert to seconds
      metrics.observe('ws_connection_duration_seconds', {}, duration)

      logger.debug('WebSocket connection closed, duration tracked', {
        wsConnectionId: data.wsConnectionId,
        durationSeconds: duration
      })
    },
    ping: (ws) => {
      const data = ws.getUserData()
      logger.debug('[DEBUGGING CONNECTION] Ping received', {
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        address: getAddress(data)
      })
      if (data.wsConnectionId) {
        wsPool.updateActivity(data.wsConnectionId)
      }
    }
  })
}
