import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, createUWebSocketTransport } from '../../utils/UWebSocketTransport'
import { isNotAuthenticated } from '../../utils/wsUserData'
import { randomUUID } from 'crypto'

const textDecoder = new TextDecoder()

const FIVE_MINUTES_IN_SECONDS = 300
const THREE_MINUTES_IN_MS = 180000

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
        address: data.auth ? data.address : 'Not authenticated'
      })

      try {
        await wsPool.acquireConnection(data.wsConnectionId)
        logger.debug('[DEBUGGING CONNECTION] Connection acquired', {
          wsConnectionId: data.wsConnectionId,
          address: data.auth ? data.address : 'Not authenticated'
        })

        const eventEmitter = mitt<IUWebSocketEventMap>()
        const transport = await createUWebSocketTransport(ws, eventEmitter, config, logs)

        if (isNotAuthenticated(data)) {
          data.timeout = setTimeout(() => {
            try {
              logger.error('Closing connection, no auth chain received', {
                wsConnectionId: data.wsConnectionId
              })
              transport.close(4001, 'No auth chain received')
            } catch (err) {}
          }, 5000)
        }

        changeStage(data, { isConnected: true, eventEmitter, transport })
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
        address: data.auth ? data.address : 'Not authenticated'
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

          changeStage(data, {
            auth: true,
            address
          })

          if (data.timeout) {
            clearTimeout(data.timeout)
            delete data.timeout
          }

          const { transport } = data

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
            address: data.auth ? data.address : 'Not authenticated'
          })

          if (!data.isConnected) {
            logger.warn('Received message but connection is marked as disconnected', {
              address: data.address,
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
            address: data.address,
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

      data.transport.close(code, messageText)
      data.eventEmitter.emit('close', { code, reason: messageText })
      data.eventEmitter.all.clear()

      if (data.auth && data.address) {
        try {
          rpcServer.detachUser(data.address)
        } catch (error: any) {
          logger.error('Error during connection cleanup', {
            error: error.message,
            address: data.address,
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
        ...(data.auth && { address: data.address })
      })
    },
    ping: (ws) => {
      const data = ws.getUserData()
      logger.debug('[DEBUGGING CONNECTION] Ping received', {
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        address: data.auth ? data.address : 'Not authenticated'
      })
      if (data.wsConnectionId) {
        wsPool.updateActivity(data.wsConnectionId)
      }
    }
  })
}
