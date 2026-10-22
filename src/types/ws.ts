import { Emitter } from 'mitt'
import { WebSocket } from '@dcl/uws-http-server'
import { IUWebSocketEventMap } from '../utils/UWebSocketTransport'
import { Transport } from '@dcl/rpc'

type WsBaseUserData = {
  isConnected: boolean
  auth: boolean
  authenticating: boolean
  wsConnectionId: string
  connectionStartTime: number
}

export type WsAuthenticatedUserData = WsBaseUserData & {
  eventEmitter: Emitter<IUWebSocketEventMap>
  address: string
  transport: Transport
}

/**
 * User data of an authenticated socket of the plain-JSON stream protocol (`/v1/stream`). It has
 * no RPC transport; it shares the pool and the address-level fan-out with the RPC sockets.
 */
export type WsStreamAuthenticatedUserData = WsBaseUserData & {
  address: string
}

export type WsNotAuthenticatedUserData = WsBaseUserData & {
  timeout?: NodeJS.Timeout
}

export type WsUserData = WsAuthenticatedUserData | WsStreamAuthenticatedUserData | WsNotAuthenticatedUserData

export type InternalWebSocket = WebSocket<WsUserData>
