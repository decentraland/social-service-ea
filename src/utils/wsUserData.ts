import { WsNotAuthenticatedUserData, WsUserData } from '../types'

export function isNotAuthenticated(data: WsUserData): data is WsNotAuthenticatedUserData {
  return !data.auth
}
