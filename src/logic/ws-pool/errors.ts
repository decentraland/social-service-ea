/**
 * Thrown by registerConnection when the configured connection limit
 * (WS_MAX_CONCURRENT_CONNECTIONS) has been reached.
 */
export class WsPoolFullError extends Error {
  constructor(maxConnections: number) {
    super(`WebSocket pool is full (limit: ${maxConnections})`)
    this.name = 'WsPoolFullError'
  }
}

/** Expected rejection by the shared per-address admission policy. */
export class WsAdmissionError extends Error {
  constructor(public readonly reason: 'connections' | 'subscriptions' | 'capacity') {
    super(
      reason === 'connections'
        ? 'Too many WebSocket connections for this address'
        : reason === 'subscriptions'
          ? 'Subscription rate exceeded; retry with backoff'
          : 'WebSocket admission capacity reached; retry later'
    )
    this.name = 'WsAdmissionError'
  }
}
