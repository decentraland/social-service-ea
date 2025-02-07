import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, createUWebSocketTransport } from '../../utils/UWebSocketTransport'
import { isNotAuthenticated } from '../../utils/wsUserData'
import { randomUUID } from 'crypto'

const textDecoder = new TextDecoder()

export async function registerWsHandler(
  components: Pick<AppComponents, 'logs' | 'server' | 'metrics' | 'fetcher' | 'rpcServer' | 'config' | 'wsPool'>
) {
  const { logs, server, metrics, fetcher, rpcServer, config, wsPool } = components
  const logger = logs.getLogger('ws-handler')

  function changeStage(data: WsUserData, newData: Partial<WsUserData>) {
    Object.assign(data, { ...data, ...newData })
  }

  server.app.ws<WsUserData>('/', {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? 90, // In seconds
    upgrade: (res, req, context) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      const clientId = randomUUID()

      res.upgrade(
        {
          isConnected: false,
          auth: false,
          clientId,
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

      try {
        await wsPool.acquireConnection(data.clientId)
        changeStage(data, { isConnected: true })
        logger.debug('WebSocket opened', { clientId: data.clientId })
      } catch (error: any) {
        logger.error('Failed to acquire connection', { error: error.message, clientId: data.clientId })
        ws.end(1013, 'Unable to acquire connection') // 1013 = Try again later
      }
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      metrics.increment('ws_messages_received')

      if (isNotAuthenticated(data)) {
        try {
          const authChainMessage = textDecoder.decode(message)
          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('Authenticated User', { address })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          const transport = await createUWebSocketTransport(ws, eventEmitter, config)

          changeStage(data, {
            auth: true,
            address,
            eventEmitter,
            isConnected: true,
            transport
          })

          rpcServer.attachUser({ transport, address })

          transport.on('close', () => {
            rpcServer.detachUser(address)
          })

          if (data.clientId) {
            wsPool.updateActivity(data.clientId)
          }
        } catch (error: any) {
          logger.error(`Error verifying auth chain: ${error.message}`, {
            clientId: data.clientId
          })
          metrics.increment('ws_auth_errors')
          ws.close()
        }
      } else {
        try {
          if (!data.isConnected) {
            logger.warn('Received message but connection is marked as disconnected', {
              address: data.address,
              clientId: data.clientId
            })
            return
          }

          data.eventEmitter.emit('message', message)
          metrics.increment('ws_messages_sent', { address: data.address })

          if (data.clientId) {
            wsPool.updateActivity(data.clientId)
          }
        } catch (error: any) {
          logger.error('Error emitting message', {
            error,
            address: data.address,
            clientId: data.clientId,
            isConnected: String(data.isConnected),
            hasEventEmitter: String(!!data.eventEmitter)
          })
          metrics.increment('ws_errors', { address: data.address })
          ws.send(JSON.stringify({ error: 'Error processing message', message: error.message }))
        }
      }
    },
    close: (ws, code, message) => {
      const data = ws.getUserData()
      const { clientId } = data
      const messageText = textDecoder.decode(message)

      logger.debug('WebSocket closing', {
        code,
        message: messageText,
        clientId,
        ...(data.auth && { address: data.address })
      })

      if (data.auth && data.address) {
        try {
          data.transport.close()
          rpcServer.detachUser(data.address)
          data.eventEmitter.emit('close', { code, reason: messageText })
          data.eventEmitter.all.clear()
        } catch (error: any) {
          logger.error('Error during connection cleanup', {
            error: error.message,
            address: data.address,
            clientId
          })
        }
      }

      if (clientId) {
        wsPool.releaseConnection(clientId)
      }

      changeStage(data, {
        auth: false,
        isConnected: false
      })

      logger.debug('WebSocket closed', {
        code,
        reason: messageText,
        clientId,
        ...(data.auth && { address: data.address })
      })
    },
    ping: (ws) => {
      const data = ws.getUserData()
      if (data.clientId) {
        wsPool.updateActivity(data.clientId)
      }
    }
  })
}
