import { WsAuthenticatedUserData, WsNotAuthenticatedUserData, WsUserData } from '../types'

export function isAuthenticated(data: WsUserData): data is WsAuthenticatedUserData {
  return data.auth
}

export function isNotAuthenticated(data: WsUserData): data is WsNotAuthenticatedUserData {
  return !data.auth
}
