import { randomUUID } from 'crypto'
import { onRequestEnd, onRequestStart } from '@dcl/uws-http-server'
import { AppComponents, WsNotAuthenticatedUserData, WsUserData } from '../../../types'
import { STREAM_WS_PATH } from '../../../adapters/stream-sessions/constants'
import { errorMessageOrDefault, isExpectedAuthRejection } from '../../../utils/errors'
import { AUTH_HEADER_PREFIX, AuthChainHeaders } from '../../../utils/ws-auth'

/** Copies the `x-identity-*` headers; uWS invalidates the request once the handler returns or awaits. */
function readAuthChainHeaders(req: {
  forEach(cb: (key: string, value: string) => void): void
}): AuthChainHeaders | undefined {
  const headers: Record<string, string> = {}
  req.forEach((key, value) => {
    if (key.startsWith(AUTH_HEADER_PREFIX)) headers[key] = value
  })
  return Object.keys(headers).length > 0 ? headers : undefined
}

/** Register network callbacks; all session state belongs to the injected WKC component. */
export async function registerStreamWsHandler({
  logs,
  uwsServer,
  config,
  metrics,
  streamSessions
}: Pick<AppComponents, 'logs' | 'uwsServer' | 'config' | 'metrics' | 'streamSessions'>): Promise<void> {
  const logger = logs.getLogger('stream-ws-handler')
  const maxPayloadLength = (await config.getNumber('STREAM_WS_MAX_PAYLOAD_LENGTH')) ?? 16 * 1024
  if (!Number.isSafeInteger(maxPayloadLength) || maxPayloadLength < 1)
    throw new Error('STREAM_WS_MAX_PAYLOAD_LENGTH must be a positive integer')
  uwsServer.app.ws<WsUserData>(STREAM_WS_PATH, {
    idleTimeout: (await config.getNumber('WS_IDLE_TIMEOUT_IN_SECONDS')) ?? 300,
    sendPingsAutomatically: true,
    maxPayloadLength: maxPayloadLength,
    maxBackpressure: (await config.getNumber('WS_MAX_BACKPRESSURE')) ?? 128 * 1024,
    upgrade: (res, req, context) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), STREAM_WS_PATH)
      const secWebSocketKey = req.getHeader('sec-websocket-key')
      const secWebSocketProtocol = req.getHeader('sec-websocket-protocol')
      const secWebSocketExtensions = req.getHeader('sec-websocket-extensions')
      const authHeaders = readAuthChainHeaders(req)
      const userData: WsNotAuthenticatedUserData = {
        isConnected: false,
        auth: false,
        authenticating: false,
        wsConnectionId: randomUUID(),
        protocol: 'stream',
        connectionStartTime: 0
      }

      // No auth headers: the client authenticates with its first frame (browsers cannot set upgrade headers).
      if (!authHeaders) {
        res.upgrade(userData, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
        onRequestEnd(metrics, labels, 101, end)
        return
      }

      let aborted = false
      res.onAborted(() => {
        aborted = true
      })

      streamSessions
        .verifyUpgrade(authHeaders)
        .then(
          (address) => {
            if (aborted) return
            res.cork(() => {
              res.upgrade(
                { ...userData, verifiedAddress: address },
                secWebSocketKey,
                secWebSocketProtocol,
                secWebSocketExtensions,
                context
              )
            })
            onRequestEnd(metrics, labels, 101, end)
          },
          (error: unknown) => {
            if (aborted) return
            const unauthorized = isExpectedAuthRejection(error)
            res.cork(() => {
              res.writeStatus(unauthorized ? '401 Unauthorized' : '503 Service Unavailable').end()
            })
            onRequestEnd(metrics, labels, unauthorized ? 401 : 503, end)
          }
        )
        .catch((error: unknown) => {
          logger.error('Failed to answer a stream upgrade', { error: errorMessageOrDefault(error) })
        })
    },
    open: streamSessions.open,
    message: streamSessions.message,
    close: streamSessions.close,
    drain: streamSessions.drain
  })
}
