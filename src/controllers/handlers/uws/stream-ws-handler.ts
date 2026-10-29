import { randomUUID } from 'crypto'
import { onRequestEnd, onRequestStart } from '@dcl/uws-http-server'
import { AppComponents, WsUserData } from '../../../types'

export const STREAM_WS_PATH = '/v1/stream'

/** Register network callbacks; all session state belongs to the injected WKC component. */
export async function registerStreamWsHandler({
  uwsServer,
  config,
  metrics,
  streamSessions
}: Pick<AppComponents, 'uwsServer' | 'config' | 'metrics' | 'streamSessions'>): Promise<void> {
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
    open: streamSessions.open,
    message: streamSessions.message,
    close: streamSessions.close,
    drain: streamSessions.drain
  })
}
