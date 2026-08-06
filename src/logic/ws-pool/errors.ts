/**
 * Thrown by registerConnection when the configured connection limit
 * (WS_MAX_CONCURRENT_CONNECTIONS) has been reached.
 */
export class WsAdmissionError extends Error {}

export class WsPoolFullError extends WsAdmissionError {
  constructor(maxConnections: number) {
    super(`WebSocket pool is full (limit: ${maxConnections})`)
    this.name = 'WsPoolFullError'
  }
}

export class WsUnauthenticatedLimitError extends WsAdmissionError {
  constructor(scope: 'global' | 'client', limit: number) {
    super(`Unauthenticated WebSocket ${scope} limit reached (limit: ${limit})`)
    this.name = 'WsUnauthenticatedLimitError'
  }
}

export class WsConnectionRateLimitError extends WsAdmissionError {
  constructor(limit: number, windowSeconds: number) {
    super(`WebSocket connection rate limit reached (limit: ${limit} per ${windowSeconds}s)`)
    this.name = 'WsConnectionRateLimitError'
  }
}
