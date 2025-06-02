import { Emitter } from 'mitt'
import { WebSocket } from '@well-known-components/uws-http-server'
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

export type WsNotAuthenticatedUserData = WsBaseUserData & {
  timeout?: NodeJS.Timeout
}

export type WsUserData = WsAuthenticatedUserData | WsNotAuthenticatedUserData

export type InternalWebSocket = WebSocket<WsUserData>
