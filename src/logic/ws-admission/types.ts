import { IBaseComponent } from '@well-known-components/interfaces'

export type WsProtocol = 'rpc' | 'stream'

export type ConnectionClaim = {
  /** The address's oldest connection, displaced to stay within the per-address cap; the caller ends it. */
  evictedConnectionId?: string
}

export interface IWsAdmissionComponent extends IBaseComponent {
  /**
   * Counts an authenticated connection against its address, shared by RPC and JSON sockets. Over the cap the
   * oldest connection is displaced rather than the new one refused, so dead or replayed sockets cannot lock
   * the owner out.
   */
  claimConnection: (address: string, connectionId: string, protocol: WsProtocol) => ConnectionClaim
  /**
   * Charges one subscription start to the connection's address.
   * @throws {SubscriptionRateLimitedError} When the address has no tokens left.
   */
  admitSubscription: (connectionId: string) => void
  /** Releases the connection's slot; idempotent. */
  releaseConnection: (connectionId: string) => void
}
