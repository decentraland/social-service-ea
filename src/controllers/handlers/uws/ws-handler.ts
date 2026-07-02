import mitt from 'mitt'
import { randomUUID } from 'crypto'
import { WebSocket } from 'uWebSockets.js'
import { onRequestEnd, onRequestStart } from '@dcl/uws-http-server'
import { verify } from '@dcl/crypto-middleware'
import { AppComponents, WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { IUWebSocketEventMap, createUWebSocketTransport } from '../../../utils/UWebSocketTransport'
import { isAuthenticated, isNotAuthenticated } from '../../../utils/wsUserData'
import { isErrorWithMessage } from '../../../utils/errors'

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

  const authTimeoutInMs = (await config.getNumber('WS_AUTH_TIMEOUT_IN_MS')) ?? 300000 // 3 minutes in ms
  const authSignatureExpirationInMs = (await config.getNumber('WS_AUTH_SIGNATURE_EXPIRATION_IN_MS')) ?? 300000 // 3 minutes in ms

  function changeStage(data: WsUserData, newData: Partial<WsUserData>) {
    Object.assign(data, { ...data, ...newData })
  }

  function safeCloseTransport(data: WsAuthenticatedUserData, wsConnectionId: string) {
    try {
      data.transport.close()
    } catch (error: any) {
      logger.error('Error closing transport during cleanup', {
        error: error.message,
        address: data.address,
        wsConnectionId
      })
      tracing.captureException(error as Error, { address: data.address, wsConnectionId })
    }
  }

  function safeDetachUser(address: string, wsConnectionId: string) {
    try {
      rpcServer.detachUser(address, wsConnectionId)
    } catch (error: any) {
      logger.error('Error detaching user during cleanup', {
        error: error.message,
        address,
        wsConnectionId
      })
      tracing.captureException(error as Error, { address, wsConnectionId })
    }
  }

  function safeClearEmitter(data: WsAuthenticatedUserData, wsConnectionId: string) {
    try {
      data.eventEmitter.all.clear()
    } catch (error: any) {
      logger.error('Error clearing event emitter during cleanup', {
        error: error.message,
        address: data.address,
        wsConnectionId
      })
    }
  }

  function cleanupConnection(data: WsUserData, code: number) {
    const { wsConnectionId } = data

    // Mark the socket disconnected BEFORE closing the transport. safeCloseTransport()
    // synchronously fires the transport 'close' listener, which ends the socket only when
    // data.isConnected is still true (the RPC-initiated close path, where the socket is
    // alive). Clearing the flag first makes that guard precise on this socket-initiated
    // path — otherwise it would rely on ws.end() throwing on the already-closing socket.
    data.isConnected = false

    if (isAuthenticated(data)) {
      // Each step is independent — a failure in one must not prevent the others.
      // Previously these were in a single try/catch, so a throw in transport.close()
      // would skip detachUser() and emitter.clear(), permanently leaking the subscriber.
      safeCloseTransport(data, wsConnectionId)
      safeDetachUser(data.address, wsConnectionId)
      safeClearEmitter(data, wsConnectionId)
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
        fetcher,
        expiration: authSignatureExpirationInMs
      })

      if (data.timeout) {
        clearTimeout(data.timeout)
        delete data.timeout
      }

      const address = normalizeAddress(verifyResult.auth)

      // Check if connection was closed during authentication (race condition protection)
      // The close handler sets isConnected to false, so if it's false here, the socket is already closed
      if (!data.isConnected) {
        logger.warn('WebSocket closed during authentication, aborting user attachment', {
          address,
          wsConnectionId: data.wsConnectionId
        })
        metrics.increment('ws_auth_race_condition_aborted')
        return
      }

      logger.debug('Authenticated User', { address, wsConnectionId: data.wsConnectionId })

      const eventEmitter = mitt<IUWebSocketEventMap>()
      const transport = await createUWebSocketTransport(ws, eventEmitter, components)

      // Re-check after the await above: if the socket closed while the transport was being
      // created, attaching now would register a connection for a dead socket that the
      // (address-level) cleanup paths would never tear down.
      if (!data.isConnected) {
        logger.warn('WebSocket closed during transport creation, aborting user attachment', {
          address,
          wsConnectionId: data.wsConnectionId
        })
        metrics.increment('ws_auth_race_condition_aborted')
        transport.close()
        return
      }

      changeStage(data, {
        auth: true,
        address,
        eventEmitter,
        isConnected: true,
        transport
      })

      transport.on('close', () => {
        logger.debug('Transport close event received', {
          wsConnectionId: data.wsConnectionId,
          address
        })
        rpcServer.detachUser(address, data.wsConnectionId)

        // The transport can also be closed by the RPC layer (e.g. on a transport error such
        // as a queue overflow) while the socket is still open. Without ending the socket the
        // client would keep a live, ping-alive connection whose messages go nowhere. On the
        // normal path (socket closed first) end() throws on the already-closed socket and is
        // swallowed here.
        if (data.isConnected) {
          try {
            ws.end(1011, 'RPC transport closed')
          } catch (err) {}
        }
      })

      transport.on('error', (error: unknown) => {
        metrics.increment('ws_transport_errors')
        logger.error('Transport error event received', {
          address,
          error: isErrorWithMessage(error) ? error.message : 'Unknown error'
        })
      })

      rpcServer.attachUser({ transport, address, wsConnectionId: data.wsConnectionId })
    } catch (error: any) {
      logger.error(`Error verifying auth chain: ${error.message}`, {
        wsConnectionId: data.wsConnectionId
      })
      metrics.increment('ws_auth_errors')
      tracing.captureException(error as Error, {
        address: getAddress(data),
        wsConnectionId: data.wsConnectionId
      })
      // The client may have disconnected while verify() was in flight; end() on an
      // already-closed socket throws and would escape the async message handler as an
      // unhandled rejection.
      try {
        ws.end(3003, 'Unauthorized')
      } catch (err) {}
    } finally {
      changeStage(data, { authenticating: false })
    }
  }

  function forwardMessage(ws: WebSocket<WsUserData>, data: WsAuthenticatedUserData, message: ArrayBuffer) {
    try {
      if (!data.isConnected) {
        logger.warn('Received message but connection is marked as disconnected', {
          address: getAddress(data),
          wsConnectionId: data.wsConnectionId
        })
        return
      }

      data.eventEmitter.emit('message', message)
    } catch (error: any) {
      logger.error('Error emitting message', {
        error,
        address: getAddress(data),
        wsConnectionId: data.wsConnectionId,
        isConnected: String(data.isConnected),
        hasEventEmitter: String(!!data.eventEmitter)
      })
      metrics.increment('ws_errors')
      // Do not leak internal error details to the client.
      ws.send(JSON.stringify({ error: 'Error processing message' }))
      tracing.captureException(error as Error, {
        address: getAddress(data),
        wsConnectionId: data.wsConnectionId
      })
    }
  }

  uwsServer.app.ws<WsUserData>('/', {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? FIVE_MINUTES_IN_SECONDS,
    sendPingsAutomatically: true,
    // Bound inbound frame size so a client can't force large per-message buffering (uWS default is 16 MB).
    maxPayloadLength: (await config.getNumber('WS_MAX_PAYLOAD_LENGTH')) ?? 1024 * 1024,
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

      // Let the transport retry queued messages now that the socket drained, instead of
      // waiting for its backoff timer.
      if (isAuthenticated(data)) {
        data.eventEmitter.emit('drain')
      }
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
              ws.end(3004, 'Authorization timeout')
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
      const { wsConnectionId } = data
      const messageText = textDecoder.decode(message)
      // Captured before cleanup: cleanupConnection resets the auth flag, so the type guard
      // never matches afterwards.
      const address = isAuthenticated(data) ? data.address : undefined

      cleanupConnection(data, code)

      logger.debug('WebSocket closed', {
        code,
        reason: messageText,
        wsConnectionId,
        ...(address && { address })
      })
    }
  })
}
