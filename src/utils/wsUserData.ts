import {
  WsAuthenticatedUserData,
  WsStreamAuthenticatedUserData,
  WsNotAuthenticatedUserData,
  WsUserData
} from '../types'

export function isAuthenticated(data: WsUserData): data is WsAuthenticatedUserData | WsStreamAuthenticatedUserData {
  return data.auth && !data.authenticating
}

export function isNotAuthenticated(data: WsUserData): data is WsNotAuthenticatedUserData {
  return data.authenticating || !data.auth
}

export function isRpcAuthenticated(data: WsUserData): data is WsAuthenticatedUserData {
  return isAuthenticated(data) && data.protocol === 'rpc'
}

export function isStreamAuthenticated(data: WsUserData): data is WsStreamAuthenticatedUserData {
  return isAuthenticated(data) && data.protocol === 'stream'
}
