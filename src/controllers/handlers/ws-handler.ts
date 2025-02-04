import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import {
  IUWebSocketEventMap,
  createUWebSocketTransport,
  WebSocketTransportConfig
} from '../../utils/UWebSocketTransport'
import { isNotAuthenticated } from '../../utils/wsUserData'
import { randomUUID } from 'crypto'

const textDecoder = new TextDecoder()

export async function registerWsHandler(
  components: Pick<AppComponents, 'logs' | 'server' | 'metrics' | 'fetcher' | 'rpcServer' | 'config' | 'wsPool'>
) {
  const { logs, server, metrics, fetcher, rpcServer, config, wsPool } = components
  const logger = logs.getLogger('ws-handler')

  // Get transport configuration from config component
  const maxQueueSize = await config.getNumber('WS_TRANSPORT_MAX_QUEUE_SIZE')
  const queueDrainTimeout = await config.getNumber('WS_TRANSPORT_QUEUE_DRAIN_TIMEOUT')

  const transportConfig: WebSocketTransportConfig = {
    maxQueueSize,
    queueDrainTimeout
  }

  function changeStage(data: WsUserData, newData: Partial<WsUserData>) {
    Object.assign(data, { ...data, ...newData })
  }

  server.app.ws<WsUserData>('/', {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT')) ?? 90, // In seconds
    upgrade: async (res, req, context) => {
      logger.debug('upgrade requested')
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      const clientId = randomUUID()

      try {
        await wsPool.acquireConnection(clientId)
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
      } catch (error: any) {
        logger.error('Failed to acquire connection', { error: error.message, clientId })
        onRequestEnd(metrics, labels, 503, end)
        res.writeStatus('503 Service Unavailable').end()
      }
    },
    open: (ws) => {
      const data = ws.getUserData()
      metrics.increment('ws_connections')
      changeStage(data, { isConnected: true })
      logger.debug('WebSocket opened', { clientId: data.clientId })
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      metrics.increment('ws_messages_received')

      if (data.auth) {
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
      } else if (isNotAuthenticated(data)) {
        try {
          const authChainMessage = textDecoder.decode(message)
          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('address > ', { address, clientId: data.clientId })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          const transport = createUWebSocketTransport(ws, eventEmitter, transportConfig)

          changeStage(data, {
            auth: true,
            address,
            eventEmitter,
            isConnected: true
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
      }
    },
    close: (ws, code, message) => {
      const data = ws.getUserData()
      const { clientId } = data

      logger.debug('WebSocket closing', {
        code,
        message: textDecoder.decode(message),
        clientId,
        ...(data.auth && { address: data.address })
      })

      if (data.auth && data.address) {
        try {
          rpcServer.detachUser(data.address)
          data.eventEmitter.emit('close', code)
          data.eventEmitter.all.clear()
        } catch (error: any) {
          logger.error('Error during connection cleanup', {
            error: error.message,
            address: data.address,
            clientId
          })
        }
        metrics.increment('ws_connections', { address: data.address })
      } else {
        metrics.increment('ws_connections')
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
