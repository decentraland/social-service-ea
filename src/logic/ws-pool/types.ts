import { IBaseComponent } from '@well-known-components/interfaces'
import { WebSocket } from 'uWebSockets.js'
import { WsUserData } from '../../types'

export interface IWsPoolComponent extends IBaseComponent {
  /**
   * Registers a new WebSocket connection.
   * @throws {WsPoolFullError} When the configured connection limit is reached.
   */
  registerConnection: (ws: WebSocket<WsUserData>, protocol?: 'rpc' | 'stream') => void
  /** Reserve one authenticated address slot shared by RPC and JSON sockets. */
  claimAddress: (address: string, connectionId: string) => void
  /** Charge subscription starts across all sockets of the address, including reconnects. */
  admitSubscription: (connectionId: string) => void
  unregisterConnection: (data: WsUserData) => void
  getAuthenticatedAddresses: () => string[]
  /**
   * Returns the wsConnectionIds of all currently registered connections. Used by the
   * reconciliation sweep to detect subscriber state whose socket is gone.
   */
  getConnectionIds: () => string[]
}
