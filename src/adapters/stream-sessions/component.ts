import { STOP_COMPONENT } from '@well-known-components/interfaces'
import {
  AppComponents,
  ISubscribersContext,
  IStreamSessionsComponent,
  WsStreamAuthenticatedUserData,
  WsUserData
} from '../../types'
import { StreamDefinition } from '../../types/subscriptions'
import { InternalWebSocket } from '../../types/ws'
import { normalizeAddress } from '../../utils/address'
import { isAuthenticated, isNotAuthenticated } from '../../utils/wsUserData'
import { isErrorWithMessage, isExpectedAuthRejection, errorMessageOrDefault } from '../../utils/errors'
import { WsPoolFullError } from '../../logic/ws-pool'
import { detachSubscriptionConnection } from '../../logic/subscriptions/lifecycle'
import { getWsAuthSettings, verifyWsIdentity } from '../../utils/ws-session'
import { parseStreamMessage, StreamClientMessage } from './messages'

const SEND_DROPPED = 2
type Subscription = { id: string; stream: string; cancelled: boolean; unsubscribed: boolean; destroy: () => void }

/**
 * Own JSON socket authentication, subscription lifetime and backpressure/rate policies.
 * @param components Explicit shared infrastructure and domain dependencies.
 * @param streams Transport-specific event serializers and subscription factories.
 * @returns Session callbacks plus shutdown cleanup, owned by the WKC lifecycle.
 */
export async function createStreamSessionsComponent(
  {
    logs,
    metrics,
    fetcher,
    voice,
    config,
    tracing,
    wsPool,
    subscribersContext
  }: Pick<
    AppComponents,
    'logs' | 'metrics' | 'fetcher' | 'voice' | 'config' | 'tracing' | 'wsPool' | 'subscribersContext'
  >,
  streams: Record<string, StreamDefinition>
): Promise<IStreamSessionsComponent> {
  const logger = logs.getLogger('stream-sessions')
  const { authTimeoutInMs, authSignatureExpirationInMs } = await getWsAuthSettings({ config })
  const sockets = new Map<string, InternalWebSocket>()
  const cleanedConnections = new WeakSet<WsUserData>()
  const messagesPerSecond = (await config.getNumber('STREAM_WS_MESSAGES_PER_SECOND')) ?? 20
  const messageBurst = (await config.getNumber('STREAM_WS_MESSAGE_BURST')) ?? 40
  if (
    !Number.isFinite(messagesPerSecond) ||
    messagesPerSecond <= 0 ||
    !Number.isInteger(messageBurst) ||
    messageBurst < 1
  ) {
    throw new Error('Stream WebSocket message rate must be positive and burst must be a positive integer')
  }
  const messageBudgets = new WeakMap<WsUserData, { tokens: number; updatedAt: number }>()

  function consumeMessageBudget(data: WsUserData): boolean {
    const now = performance.now()
    const budget = messageBudgets.get(data) ?? { tokens: messageBurst, updatedAt: now }
    budget.tokens = Math.min(
      messageBurst,
      budget.tokens + (Math.max(0, now - budget.updatedAt) * messagesPerSecond) / 1000
    )
    budget.updatedAt = now
    messageBudgets.set(data, budget)
    if (budget.tokens < 1) return false
    budget.tokens -= 1
    return true
  }

  function closeForPolicy(ws: InternalWebSocket, type: string, reason: string): void {
    const data = ws.getUserData()
    if (!data.isConnected) return
    data.isConnected = false
    metrics.increment('stream_ws_errors', { type })
    try {
      destroySubscriptions(data.wsConnectionId)
    } finally {
      endSocket(ws, 1008, reason)
    }
  }

  // Active subscriptions per connection. Kept out of the socket's user data so the pool and the
  // reconciliation sweep keep seeing the same shape for every socket.
  const subscriptionsByConnection = new Map<string, Map<string, Subscription>>()

  function safeSend(ws: InternalWebSocket, message: Record<string, unknown>): boolean {
    try {
      const result = ws.send(JSON.stringify(message))
      if (result === SEND_DROPPED) {
        // The client is not draining its socket: a dropped update cannot be replayed, so end the
        // connection and let the client resync on reconnect instead of silently missing events.
        closeForPolicy(ws, 'slow_consumer', 'Slow consumer')
        return false
      }
      return true
    } catch {
      // ws.send throws on an already-closed socket.
      return false
    }
  }

  function sendError(ws: InternalWebSocket, code: string, message: string, id?: string) {
    metrics.increment('stream_ws_errors', { type: code })
    safeSend(ws, { type: 'error', ...(id !== undefined && { id }), code, message })
  }

  function endSocket(ws: InternalWebSocket, code: number, reason: string) {
    try {
      ws.end(code, reason)
    } catch {}
  }

  function destroySubscriptions(wsConnectionId: string) {
    const subscriptions = subscriptionsByConnection.get(wsConnectionId)
    if (!subscriptions) return
    for (const subscription of subscriptions.values()) {
      subscription.cancelled = true
      try {
        subscription.destroy()
      } catch (error) {
        logger.error('Error destroying subscription', {
          wsConnectionId,
          stream: subscription.stream,
          error: errorMessageOrDefault(error)
        })
      }
    }
    subscriptionsByConnection.delete(wsConnectionId)
  }

  function cleanupConnection(data: WsUserData, code: number) {
    if (cleanedConnections.has(data)) return
    cleanedConnections.add(data)
    const { wsConnectionId } = data

    data.isConnected = false

    if (isAuthenticated(data)) {
      // Each step is independent, a failure in one must not skip the others.
      try {
        destroySubscriptions(wsConnectionId)
      } catch (error) {
        logger.error('Error destroying subscriptions during cleanup', {
          error: errorMessageOrDefault(error),
          wsConnectionId
        })
      }
      try {
        detachSubscriptionConnection({ subscribersContext, voice }, data.address, wsConnectionId)
      } catch (error) {
        logger.error('Error detaching user during cleanup', { error: errorMessageOrDefault(error), wsConnectionId })
        tracing.captureException(error, { address: data.address, wsConnectionId })
      }
    }

    if ('timeout' in data && data.timeout) {
      clearTimeout(data.timeout)
      delete data.timeout
    }

    subscriptionsByConnection.delete(wsConnectionId)
    wsPool.unregisterConnection(data)
    metrics.increment('stream_ws_close_codes', { code })

    Object.assign(data, { auth: false, isConnected: false, authenticating: false })
  }

  async function authenticateUser(ws: InternalWebSocket, data: WsUserData, message: ArrayBuffer) {
    try {
      Object.assign(data, { authenticating: true })

      const verifyResult = await verifyWsIdentity({ fetcher }, message, authSignatureExpirationInMs)

      if ('timeout' in data && data.timeout) {
        clearTimeout(data.timeout)
        delete data.timeout
      }

      const address = normalizeAddress(verifyResult.auth)

      // The socket may have closed while verify() was in flight.
      if (!data.isConnected) {
        metrics.increment('ws_auth_race_condition_aborted')
        return
      }

      Object.assign(data, { auth: true, address, authenticating: false })

      // Same registration the RPC sockets do on attach: the address-level fan-out starts here.
      subscribersContext.addConnection(address, data.wsConnectionId)

      logger.debug('Authenticated stream user', { address, wsConnectionId: data.wsConnectionId })
      safeSend(ws, { type: 'ready' })
    } catch (error) {
      const expectedRejection = isExpectedAuthRejection(error)

      if (isExpectedAuthRejection(error)) {
        logger.warn(`Rejected auth chain: ${errorMessageOrDefault(error)}`, {
          statusCode: error.statusCode,
          wsConnectionId: data.wsConnectionId
        })
      } else {
        logger.error(`Error verifying auth chain: ${errorMessageOrDefault(error)}`, {
          wsConnectionId: data.wsConnectionId
        })
        tracing.captureException(error, { wsConnectionId: data.wsConnectionId })
      }

      metrics.increment('ws_auth_errors', { type: expectedRejection ? 'client_rejected' : 'server_error' })
      endSocket(ws, 3003, 'Unauthorized')
    } finally {
      Object.assign(data, { authenticating: false })
    }
  }

  async function runSubscription(
    ws: InternalWebSocket,
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
        subscribersContext: scopedContext,
        onSubscriptionOverflow: () =>
          closeForPolicy(ws, 'subscription_overflow', 'Subscription overflow; reconnect and resync')
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
    } catch (error) {
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

  function handleSubscribe(
    ws: InternalWebSocket,
    data: WsStreamAuthenticatedUserData,
    message: Extract<StreamClientMessage, { type: 'subscribe' }>
  ) {
    const { id, stream } = message

    if (!Object.prototype.hasOwnProperty.call(streams, stream)) {
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

    if (!safeSend(ws, { type: 'subscribed', id })) return

    // Runs for the life of the subscription; every failure is handled inside.
    void runSubscription(ws, data, subscription, streams[stream])
  }

  function handleUnsubscribe(
    ws: InternalWebSocket,
    data: WsStreamAuthenticatedUserData,
    message: Extract<StreamClientMessage, { type: 'unsubscribe' }>
  ) {
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

  function handleMessage(ws: InternalWebSocket, data: WsStreamAuthenticatedUserData, rawMessage: ArrayBuffer) {
    const parsed = parseStreamMessage(rawMessage)
    if (parsed.ok === false) {
      metrics.increment('stream_ws_messages_received', { type: parsed.receivedType })
      return sendError(ws, parsed.code, parsed.message, parsed.id)
    }
    const message = parsed.message
    metrics.increment('stream_ws_messages_received', { type: message.type })
    switch (message.type) {
      case 'subscribe':
        return handleSubscribe(ws, data, message)
      case 'unsubscribe':
        return handleUnsubscribe(ws, data, message)
      case 'ping':
        safeSend(ws, { type: 'pong' })
        return
    }
  }

  return {
    open: (ws) => {
      const data = ws.getUserData()

      try {
        wsPool.registerConnection(ws)
        sockets.set(data.wsConnectionId, ws)
        Object.assign(data, {
          timeout: setTimeout(() => {
            logger.warn('Closing stream connection, no auth chain received', { wsConnectionId: data.wsConnectionId })
            endSocket(ws, 3004, 'Authorization timeout')
          }, authTimeoutInMs)
        })

        Object.assign(data, { isConnected: true, connectionStartTime: Date.now() })
      } catch (error) {
        if (error instanceof WsPoolFullError) {
          logger.warn('Rejected stream connection: WebSocket pool is full', { wsConnectionId: data.wsConnectionId })
        } else {
          logger.error('Failed to register stream connection', { error: errorMessageOrDefault(error) })
          tracing.captureException(error, { wsConnectionId: data.wsConnectionId })
        }
        endSocket(ws, 1013, 'Unable to acquire connection')
      }
    },
    message: async (ws, message) => {
      const data = ws.getUserData()

      if (!data.isConnected) return
      if (!consumeMessageBudget(data)) {
        closeForPolicy(ws, 'rate_limited', 'Message rate exceeded; reconnect with backoff')
        return
      }

      if (data.authenticating) {
        safeSend(ws, { type: 'error', code: 'auth_in_progress', message: 'Authentication already in progress' })
        return
      }

      if (isNotAuthenticated(data)) {
        await authenticateUser(ws, data, message)
        return
      }

      if (isAuthenticated(data)) handleMessage(ws, data, message)
    },
    close: (ws, code) => {
      sockets.delete(ws.getUserData().wsConnectionId)
      cleanupConnection(ws.getUserData(), code)
    },
    [STOP_COMPONENT]: async () => {
      for (const ws of sockets.values()) {
        try {
          cleanupConnection(ws.getUserData(), 1001)
        } catch (error) {
          logger.warn('Error cleaning up stream socket during shutdown', { error: errorMessageOrDefault(error) })
        } finally {
          endSocket(ws, 1001, 'Server shutting down')
        }
      }
      sockets.clear()
    }
  }
}
