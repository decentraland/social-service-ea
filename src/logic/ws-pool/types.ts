import { IBaseComponent } from '@well-known-components/interfaces'
import { WebSocket } from 'uWebSockets.js'
import { WsUserData } from '../../types'

export interface IWsPoolComponent extends IBaseComponent {
  registerConnection: (ws: WebSocket<WsUserData>) => void
  unregisterConnection: (data: WsUserData) => void
}
