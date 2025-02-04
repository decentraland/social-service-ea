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
  const maxQueueSize = await config.getNumber('ws.transport.maxQueueSize')
  const queueDrainTimeout = await config.getNumber('ws.transport.queueDrainTimeout')

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
            clientId
          },
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
        onRequestEnd(metrics, labels, 101, end)
      } catch (error: any) {
        logger.error('Failed to acquire connection', { error, clientId })
        onRequestEnd(metrics, labels, 503, end)
        res.writeStatus('503 Service Unavailable').end()
      }
    },
    open: (ws) => {
      const data = ws.getUserData()
      metrics.increment('ws_connections')
      changeStage(data, { isConnected: true })
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      metrics.increment('ws_messages_received')

      if (data.auth) {
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

          // Create transport first
          const transport = createUWebSocketTransport(ws, eventEmitter, transportConfig)

          // Wait for transport to be ready
          await new Promise<void>((resolve) => {
            transport.on('connect', () => {
              changeStage(data, {
                auth: true,
                address,
                eventEmitter,
                isConnected: true
              })

              // Only attach user after transport is ready and state is updated
              rpcServer.attachUser({ transport, address })
              resolve()
            })
          })

          transport.on('error', (err) => {
            if (err && err.message) {
              logger.error(`Error on transport: ${err.message}`)
              metrics.increment('ws_transport_errors', { address })
            }
          })
        } catch (error: any) {
          logger.error(`Error verifying auth chain: ${error.message}`)
          metrics.increment('ws_auth_errors')
          ws.close()
        }
      }
    },
    close: (ws, code, _message) => {
      logger.debug(`Websocket closed ${code}`)
      const data = ws.getUserData()
      const { clientId } = data

      if (data.auth) {
        if (data.address) {
          rpcServer.detachUser(data.address)
        }
        data.eventEmitter.emit('close', code)
        data.eventEmitter.all.clear()
        metrics.increment('ws_connections', { address: data.address })
      } else if (isNotAuthenticated(data)) {
        clearTimeout(data.timeout)
        data.timeout = undefined
        metrics.increment('ws_connections')
      }

      if (clientId) {
        wsPool.releaseConnection(clientId)
      }

      changeStage(data, {
        auth: false,
        isConnected: false,
        timeout: undefined
      })
    }
  })
}
