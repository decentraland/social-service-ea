import mitt from 'mitt'
import { randomUUID } from 'crypto'
import { WebSocket } from 'uWebSockets.js'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { IUWebSocketEventMap, createUWebSocketTransport } from '../../../utils/UWebSocketTransport'
import { isAuthenticated, isNotAuthenticated } from '../../../utils/wsUserData'

const textDecoder = new TextDecoder()

export const FIVE_MINUTES_IN_SECONDS = 300
export const THREE_MINUTES_IN_MS = 180000

const getAddress = (data: WsUserData) => {
  return isAuthenticated(data) ? data.address : 'Not authenticated'
}

export async function registerWsHandler(
  components: Pick<
    AppComponents,
    'logs' | 'uwsServer' | 'metrics' | 'fetcher' | 'rpcServer' | 'config' | 'tracing' | 'wsPool'
  >
) {
  const { logs, uwsServer, metrics, fetcher, rpcServer, config, tracing, wsPool } = components
  const logger = logs.getLogger('ws-handler')

  const authTimeoutInMs = (await config.getNumber('WS_AUTH_TIMEOUT_IN_SECONDS')) ?? 180000 // 3 minutes in ms

  function changeStage(data: WsUserData, newData: Partial<WsUserData>) {
    Object.assign(data, { ...data, ...newData })
  }

  function cleanupConnection(data: WsUserData, code: number, messageText: string) {
    const { wsConnectionId } = data

    if (isAuthenticated(data)) {
      try {
        data.transport.close()
        rpcServer.detachUser(data.address)
        data.eventEmitter.emit('close', { code, reason: messageText })
        data.eventEmitter.all.clear()
      } catch (error: any) {
        tracing.captureException(error as Error, {
          address: getAddress(data),
          wsConnectionId
        })
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

    wsPool.unregisterConnection(data)

    metrics.increment('ws_close_codes', { code })

    changeStage(data, {
      auth: false,
      isConnected: false,
      authenticating: false
    })
  }

  async function authenticateUser(ws: WebSocket<WsUserData>, data: WsNotAuthenticatedUserData, message: ArrayBuffer) {
    try {
      changeStage(data, { authenticating: true })

      const authChainMessage = textDecoder.decode(message)

      const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
        fetcher
      })
      const address = normalizeAddress(verifyResult.auth)

      logger.debug('Authenticated User', { address, wsConnectionId: data.wsConnectionId })

      const eventEmitter = mitt<IUWebSocketEventMap>()
      const transport = await createUWebSocketTransport(ws, eventEmitter, components)

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
    } catch (error: any) {
      logger.error(`Error verifying auth chain: ${error.message}`, {
        wsConnectionId: data.wsConnectionId
      })
      metrics.increment('ws_auth_errors')
      tracing.captureException(error as Error, {
        address: getAddress(data),
        wsConnectionId: data.wsConnectionId
      })
      ws.close()
    } finally {
      changeStage(data, { authenticating: false })
    }
  }

  function forwardMessage(ws: WebSocket<WsUserData>, data: WsAuthenticatedUserData, message: ArrayBuffer) {
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
      tracing.captureException(error as Error, {
        address: getAddress(data),
        wsConnectionId: data.wsConnectionId
      })
    }
  }

  uwsServer.app.ws<WsUserData>('/', {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? FIVE_MINUTES_IN_SECONDS,
    sendPingsAutomatically: true,
    maxBackpressure: (await config.getNumber('WS_MAX_BACKPRESSURE')) ?? 128 * 1024, // should be adjusted based on metrics
    drain: (ws) => {
      const data = ws.getUserData()
      const address = getAddress(data)
      const bufferedAmount = ws.getBufferedAmount()

      logger.debug('WebSocket drain event', {
        wsConnectionId: data.wsConnectionId,
        bufferedAmount,
        address
      })

      metrics.increment('ws_drain_events')
    },
    upgrade: (res, req, context) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      const wsConnectionId = randomUUID()

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

      logger.debug('Opening connection', {
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        auth: String(data.auth),
        address: getAddress(data)
      })

      try {
        wsPool.registerConnection(ws)

        logger.debug('Connection acquired', {
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
          }, authTimeoutInMs)
        }

        changeStage(data, { isConnected: true, connectionStartTime: Date.now() })
        logger.debug('WebSocket opened', { wsConnectionId: data.wsConnectionId })
      } catch (error: any) {
        logger.debug('Failed to acquire connection', {
          wsConnectionId: data.wsConnectionId,
          error: error.message
        })
        tracing.captureException(error as Error, {
          address: getAddress(data),
          wsConnectionId: data.wsConnectionId
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
        address: getAddress(data),
        authenticating: String(data.authenticating)
      })

      if (data.authenticating) {
        logger.warn('Authentication already in progress', {
          wsConnectionId: data.wsConnectionId
        })
        ws.send(JSON.stringify({ error: 'Authentication already in progress, please try again later' }))
        return
      }

      metrics.increment('ws_messages_received')

      if (isNotAuthenticated(data)) {
        await authenticateUser(ws, data, message)
      } else {
        forwardMessage(ws, data, message)
      }
    },
    close: (ws, code, message) => {
      const data = ws.getUserData()
      const { wsConnectionId, isConnected, auth } = data
      const messageText = textDecoder.decode(message)

      logger.debug('[DEBUGGING CONNECTION] Connection closing', {
        wsConnectionId: wsConnectionId,
        code,
        message: messageText,
        isConnected: String(isConnected),
        auth: String(auth)
      })

      cleanupConnection(data, code, messageText)

      logger.debug('WebSocket closed', {
        code,
        reason: messageText,
        wsConnectionId,
        ...(isAuthenticated(data) && { address: data.address })
      })
    }
  })
}
