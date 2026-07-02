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
