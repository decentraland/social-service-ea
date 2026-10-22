import { RequestError, verify } from '@dcl/crypto-middleware'

export type AuthChainHeaders = Parameters<typeof verify>[2]

// Shared by the auth chain, timestamp and metadata headers (`x-identity-auth-chain-N`, ...).
const AUTH_HEADER_PREFIX = 'x-identity-'

/**
 * Parses the client's first frame into the auth chain headers `verify()` expects. A frame that is
 * not JSON, is not a plain object, or carries an auth header value that is neither a string nor an
 * array of strings is the client's fault, like any other malformed chain. Left to `verify()`, some of
 * these crash it instead (`null` as a TypeError, a numeric timestamp inside `createPayload`) and
 * would be reported as server errors. So each is raised as the 400 `RequestError` the middleware
 * uses for a malformed chain, and leaves through the caller's catch as an expected rejection. The
 * messages are fixed and never echo the frame back into the logs.
 */
export function parseAuthChainHeaders(authChainMessage: string): AuthChainHeaders {
  let parsed: unknown
  try {
    parsed = JSON.parse(authChainMessage)
  } catch {
    throw new RequestError('Invalid auth chain payload: not valid JSON', 400)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError('Invalid auth chain payload: expected an object', 400)
  }

  // Every `x-identity-*` key (case-insensitive) must carry a string or string[]; any other field is left alone, as before.
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.toLowerCase().startsWith(AUTH_HEADER_PREFIX)) continue
    const isHeaderValue =
      typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    if (!isHeaderValue) {
      throw new RequestError('Invalid auth chain payload: header values must be strings', 400)
    }
  }

  return parsed as AuthChainHeaders
}
