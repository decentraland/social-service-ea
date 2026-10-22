import { randomUUID } from 'crypto'
import { WebSocket } from 'uWebSockets.js'
import { onRequestEnd, onRequestStart } from '@dcl/uws-http-server'
import { verify } from '@dcl/crypto-middleware'
import {
  AppComponents,
  ISubscribersContext,
  WsNotAuthenticatedUserData,
  WsStreamAuthenticatedUserData,
  WsUserData
} from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { isAuthenticated, isNotAuthenticated } from '../../../utils/wsUserData'
import { isErrorWithMessage, isExpectedAuthRejection } from '../../../utils/errors'
import { WsPoolFullError } from '../../../logic/ws-pool'
import { rejectSceneSigner } from '../../../utils/auth-metadata'
import { parseAuthChainHeaders } from '../../../utils/ws-auth'
import { StreamDefinition } from './stream-registry'

/**
 * Plain WebSocket protocol for the real-time streams, served next to the RPC socket (`/`) on the
 * same uWS app. Everything is JSON text frames.
 *
 * The first client frame is the auth chain (a JSON object of `x-identity-*` headers), exactly like
 * the RPC socket. The server answers `{ "type": "ready" }`, after which:
 *
 *   client -> server  { "type": "subscribe", "id": "<client chosen>", "stream": "<name>" }
 *                     { "type": "unsubscribe", "id": "<id>" }
 *                     { "type": "ping" }
 *   server -> client  { "type": "subscribed", "id" }
 *                     { "type": "event", "id", "stream", "data": <the stream's JSON event> }
 *                     { "type": "end", "id", "reason": "completed" | "unsubscribed" }
 *                     { "type": "error", "id"?, "code", "message" }
 *                     { "type": "pong" }
 *
 * Connections register in the same pool and the same per-address fan-out as RPC sockets, so a user
 * connected on both protocols receives every update on both, and is only treated as gone (voice
 * chat cleanup) when the last connection of either kind closes.
 */
export const STREAM_WS_PATH = '/v1/stream'

const SUBSCRIPTION_ID_MAX_LENGTH = 64

// uWS `send` result codes (not exported as an enum by the library).
const SEND_DROPPED = 2

const textDecoder = new TextDecoder()

type Subscription = {
  id: string
  stream: string
  cancelled: boolean
  unsubscribed: boolean
  destroy: () => void
}

type StreamHandlerComponents = Pick<
  AppComponents,
  'logs' | 'uwsServer' | 'metrics' | 'fetcher' | 'rpcServer' | 'config' | 'tracing' | 'wsPool' | 'subscribersContext'
>

export async function registerStreamWsHandler(
  components: StreamHandlerComponents,
  streams: Record<string, StreamDefinition>
) {
  const { logs, uwsServer, metrics, fetcher, rpcServer, config, tracing, wsPool, subscribersContext } = components
  const logger = logs.getLogger('stream-ws-handler')

  const authTimeoutInMs = (await config.getNumber('WS_AUTH_TIMEOUT_IN_MS')) ?? 300000
  const authSignatureExpirationInMs = (await config.getNumber('WS_AUTH_SIGNATURE_EXPIRATION_IN_MS')) ?? 300000

  // Active subscriptions per connection. Kept out of the socket's user data so the pool and the
  // reconciliation sweep keep seeing the same shape for every socket.
  const subscriptionsByConnection = new Map<string, Map<string, Subscription>>()

  function safeSend(ws: WebSocket<WsUserData>, message: Record<string, unknown>): boolean {
    try {
      const result = ws.send(JSON.stringify(message))
      if (result === SEND_DROPPED) {
        // The client is not draining its socket: a dropped update cannot be replayed, so end the
        // connection and let the client resync on reconnect instead of silently missing events.
        metrics.increment('stream_ws_errors', { type: 'slow_consumer' })
        // Nothing else may be written to a socket that is being ended (the close handler resets this again).
        ws.getUserData().isConnected = false
        endSocket(ws, 1008, 'Slow consumer')
        return false
      }
      return true
    } catch {
      // ws.send throws on an already-closed socket.
      return false
    }
  }

  function sendError(ws: WebSocket<WsUserData>, code: string, message: string, id?: string) {
    metrics.increment('stream_ws_errors', { type: code })
    safeSend(ws, { type: 'error', ...(id !== undefined && { id }), code, message })
  }

  function endSocket(ws: WebSocket<WsUserData>, code: number, reason: string) {
    try {
      ws.end(code, reason)
    } catch {}
  }

  function destroySubscriptions(wsConnectionId: string) {
    const subscriptions = subscriptionsByConnection.get(wsConnectionId)
    if (!subscriptions) return
    for (const subscription of subscriptions.values()) {
      subscription.cancelled = true
      subscription.destroy()
    }
    subscriptionsByConnection.delete(wsConnectionId)
  }

  function cleanupConnection(data: WsUserData, code: number) {
    const { wsConnectionId } = data

    data.isConnected = false

    if (isAuthenticated(data)) {
      // Each step is independent, a failure in one must not skip the others.
      try {
        destroySubscriptions(wsConnectionId)
      } catch (error: any) {
        logger.error('Error destroying subscriptions during cleanup', { error: error.message, wsConnectionId })
      }
      try {
        rpcServer.detachUser(data.address, wsConnectionId)
      } catch (error: any) {
        logger.error('Error detaching user during cleanup', { error: error.message, wsConnectionId })
        tracing.captureException(error, { address: data.address, wsConnectionId })
      }
    }

    if (isNotAuthenticated(data) && (data as WsNotAuthenticatedUserData).timeout) {
      clearTimeout((data as WsNotAuthenticatedUserData).timeout)
      delete (data as WsNotAuthenticatedUserData).timeout
    }

    subscriptionsByConnection.delete(wsConnectionId)
    wsPool.unregisterConnection(data)
    metrics.increment('stream_ws_close_codes', { code })

    Object.assign(data, { auth: false, isConnected: false, authenticating: false })
  }

  async function authenticateUser(ws: WebSocket<WsUserData>, data: WsUserData, message: ArrayBuffer) {
    try {
      Object.assign(data, { authenticating: true })

      const verifyResult = await verify('get', '/', parseAuthChainHeaders(textDecoder.decode(message)), {
        fetcher,
        expiration: authSignatureExpirationInMs,
        metadataValidator: rejectSceneSigner
      })

      if ((data as WsNotAuthenticatedUserData).timeout) {
        clearTimeout((data as WsNotAuthenticatedUserData).timeout)
        delete (data as WsNotAuthenticatedUserData).timeout
      }

      const address = normalizeAddress(verifyResult.auth)

      // The socket may have closed while verify() was in flight.
      if (!data.isConnected) {
        metrics.increment('ws_auth_race_condition_aborted')
        return
      }

      Object.assign(data, { auth: true, address })

      // Same registration the RPC sockets do on attach: the address-level fan-out starts here.
      subscribersContext.addConnection(address, data.wsConnectionId)

      logger.debug('Authenticated stream user', { address, wsConnectionId: data.wsConnectionId })
      safeSend(ws, { type: 'ready' })
    } catch (error: any) {
      const expectedRejection = isExpectedAuthRejection(error)

      if (expectedRejection) {
        logger.warn(`Rejected auth chain: ${error.message}`, {
          statusCode: error.statusCode,
          wsConnectionId: data.wsConnectionId
        })
      } else {
        logger.error(`Error verifying auth chain: ${error.message}`, { wsConnectionId: data.wsConnectionId })
        tracing.captureException(error, { wsConnectionId: data.wsConnectionId })
      }

      metrics.increment('ws_auth_errors', { type: expectedRejection ? 'client_rejected' : 'server_error' })
      endSocket(ws, 3003, 'Unauthorized')
    } finally {
      Object.assign(data, { authenticating: false })
    }
  }

  async function runSubscription(
    ws: WebSocket<WsUserData>,
    data: WsStreamAuthenticatedUserData,
    subscription: Subscription,
    definition: StreamDefinition
  ) {
    const { id, stream } = subscription
    const subscriptions = subscriptionsByConnection.get(data.wsConnectionId)

    // Gives the stream a handle to destroy only this subscription: the generator registers itself
    // with the subscribers context, and the connection-level teardown is otherwise all-or-nothing.
    const scopedContext: ISubscribersContext = {
      ...subscribersContext,
      registerGenerator: (wsConnectionId, generator) => {
        subscription.destroy = () => generator.destroy()
        if (subscription.cancelled) {
          generator.destroy()
        }
        subscribersContext.registerGenerator(wsConnectionId, generator)
      }
    }

    try {
      const generator = definition.open({
        address: data.address,
        wsConnectionId: data.wsConnectionId,
        subscribersContext: scopedContext
      })

      for await (const update of generator) {
        if (!data.isConnected) break

        const sent = safeSend(ws, { type: 'event', id, stream, data: update })
        if (!sent) break

        metrics.increment('stream_ws_updates_sent', { event: stream })
      }

      if (data.isConnected) {
        safeSend(ws, { type: 'end', id, reason: subscription.unsubscribed ? 'unsubscribed' : 'completed' })
      }
    } catch (error: any) {
      logger.error(`Error in ${stream} subscription: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`, {
        wsConnectionId: data.wsConnectionId,
        address: data.address
      })
      if (data.isConnected) {
        sendError(ws, 'stream_error', 'The subscription ended unexpectedly', id)
      }
    } finally {
      subscriptions?.delete(id)
    }
  }

  function handleSubscribe(ws: WebSocket<WsUserData>, data: WsStreamAuthenticatedUserData, message: any) {
    const { id, stream } = message

    if (typeof id !== 'string' || id.length === 0 || id.length > SUBSCRIPTION_ID_MAX_LENGTH) {
      return sendError(ws, 'invalid_message', `id must be a string of 1 to ${SUBSCRIPTION_ID_MAX_LENGTH} characters`)
    }

    if (typeof stream !== 'string' || !Object.prototype.hasOwnProperty.call(streams, stream)) {
      return sendError(ws, 'unknown_stream', 'Unknown stream', id)
    }

    let subscriptions = subscriptionsByConnection.get(data.wsConnectionId)
    if (!subscriptions) {
      subscriptions = new Map()
      subscriptionsByConnection.set(data.wsConnectionId, subscriptions)
    }

    if (subscriptions.has(id)) {
      return sendError(ws, 'duplicate_subscription', 'A subscription with this id already exists', id)
    }

    for (const existing of subscriptions.values()) {
      if (existing.stream === stream) {
        return sendError(ws, 'duplicate_subscription', 'Already subscribed to this stream on this connection', id)
      }
    }

    const subscription: Subscription = { id, stream, cancelled: false, unsubscribed: false, destroy: () => {} }
    subscriptions.set(id, subscription)

    safeSend(ws, { type: 'subscribed', id })

    // Runs for the life of the subscription; every failure is handled inside.
    void runSubscription(ws, data, subscription, streams[stream])
  }

  function handleUnsubscribe(ws: WebSocket<WsUserData>, data: WsStreamAuthenticatedUserData, message: any) {
    const { id } = message
    const subscription =
      typeof id === 'string' ? subscriptionsByConnection.get(data.wsConnectionId)?.get(id) : undefined

    if (!subscription) {
      return sendError(
        ws,
        'unknown_subscription',
        'No subscription with this id',
        typeof id === 'string' ? id : undefined
      )
    }

    subscription.cancelled = true
    subscription.unsubscribed = true
    subscription.destroy()
  }

  function handleMessage(ws: WebSocket<WsUserData>, data: WsStreamAuthenticatedUserData, rawMessage: ArrayBuffer) {
    let message: any
    try {
      message = JSON.parse(textDecoder.decode(rawMessage))
    } catch {
      metrics.increment('stream_ws_messages_received', { type: 'invalid' })
      return sendError(ws, 'invalid_message', 'Messages must be valid JSON')
    }

    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      metrics.increment('stream_ws_messages_received', { type: 'invalid' })
      return sendError(ws, 'invalid_message', 'Messages must be JSON objects')
    }

    switch (message.type) {
      case 'subscribe':
        metrics.increment('stream_ws_messages_received', { type: 'subscribe' })
        return handleSubscribe(ws, data, message)
      case 'unsubscribe':
        metrics.increment('stream_ws_messages_received', { type: 'unsubscribe' })
        return handleUnsubscribe(ws, data, message)
      case 'ping':
        metrics.increment('stream_ws_messages_received', { type: 'ping' })
        safeSend(ws, { type: 'pong' })
        return
      default:
        metrics.increment('stream_ws_messages_received', { type: 'invalid' })
        return sendError(ws, 'invalid_message', 'Unknown message type')
    }
  }

  uwsServer.app.ws<WsUserData>(STREAM_WS_PATH, {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? 300,
    sendPingsAutomatically: true,
    maxPayloadLength: (await config.getNumber('WS_MAX_PAYLOAD_LENGTH')) ?? 1024 * 1024,
    maxBackpressure: (await config.getNumber('WS_MAX_BACKPRESSURE')) ?? 128 * 1024,
    upgrade: (res, req, context) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), STREAM_WS_PATH)

      res.upgrade(
        {
          isConnected: false,
          auth: false,
          authenticating: false,
          wsConnectionId: randomUUID()
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

      try {
        wsPool.registerConnection(ws)
        ;(data as WsNotAuthenticatedUserData).timeout = setTimeout(() => {
          logger.warn('Closing stream connection, no auth chain received', { wsConnectionId: data.wsConnectionId })
          endSocket(ws, 3004, 'Authorization timeout')
        }, authTimeoutInMs)

        Object.assign(data, { isConnected: true, connectionStartTime: Date.now() })
      } catch (error: any) {
        if (error instanceof WsPoolFullError) {
          logger.warn('Rejected stream connection: WebSocket pool is full', { wsConnectionId: data.wsConnectionId })
        } else {
          logger.error('Failed to register stream connection', { error: error.message })
          tracing.captureException(error, { wsConnectionId: data.wsConnectionId })
        }
        endSocket(ws, 1013, 'Unable to acquire connection')
      }
    },
    message: async (ws, message) => {
      const data = ws.getUserData()

      if (data.authenticating) {
        safeSend(ws, { type: 'error', code: 'auth_in_progress', message: 'Authentication already in progress' })
        return
      }

      if (isNotAuthenticated(data)) {
        await authenticateUser(ws, data, message)
        return
      }

      handleMessage(ws, data as WsStreamAuthenticatedUserData, message)
    },
    close: (ws, code) => {
      cleanupConnection(ws.getUserData(), code)
    }
  })
}
