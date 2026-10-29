import { Emitter } from 'mitt'
import { WebSocket } from '@dcl/uws-http-server'
import { IUWebSocketEventMap } from '../utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'

export type WsProtocol = 'rpc' | 'stream'

type WsBaseUserData = {
  isConnected: boolean
  auth: boolean
  authenticating: boolean
  wsConnectionId: string
  connectionStartTime: number
  /** Set at upgrade from the path the client connected to. */
  protocol: WsProtocol
}

export type WsAuthenticatedUserData = WsBaseUserData & {
  protocol: 'rpc'
  eventEmitter: Emitter<IUWebSocketEventMap>
  address: string
  transport: Transport
}

/**
 * User data of an authenticated socket of the plain-JSON stream protocol (`/v1/stream`). It has
 * no RPC transport; it shares the pool and the address-level fan-out with the RPC sockets.
 */
export type WsStreamAuthenticatedUserData = WsBaseUserData & {
  protocol: 'stream'
  address: string
}

export type WsNotAuthenticatedUserData = WsBaseUserData & {
  timeout?: NodeJS.Timeout
  /** Set by a stream upgrade whose request headers carried a verified auth chain; consumed on open. */
  verifiedAddress?: string
}

export type WsUserData = WsAuthenticatedUserData | WsStreamAuthenticatedUserData | WsNotAuthenticatedUserData

export type InternalWebSocket = WebSocket<WsUserData>
