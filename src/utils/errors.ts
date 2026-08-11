export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

export function errorMessageOrDefault(error: unknown, defaultMessage: string = 'Unknown error'): string {
  return isErrorWithMessage(error) ? error.message : defaultMessage
}

/**
 * `@dcl/crypto-middleware` raises a `RequestError` for every failure in `verify()`, and encodes in
 * its status code who is at fault: 4xx when the credentials the client presented are malformed,
 * expired or badly signed; 503 when the catalyst backing EIP-1654 validation is unreachable or
 * answers with something unusable.
 *
 * Only the 4xx side is expected traffic — clients reconnect with stale sessions constantly — so it
 * is the only side worth keeping out of Sentry. The check is structural rather than `instanceof`
 * so it still holds if a second copy of the middleware ends up in the dependency tree.
 */
export function isExpectedAuthRejection(error: unknown): boolean {
  if (!isErrorWithMessage(error) || error.name !== 'RequestError') {
    return false
  }

  const { statusCode } = error as Error & { statusCode?: unknown }

  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}
