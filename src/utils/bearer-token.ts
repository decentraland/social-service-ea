import { createHash, timingSafeEqual } from 'crypto'

const BEARER_PREFIX = 'Bearer '

/**
 * Whether an Authorization header is exactly `Bearer <expectedToken>`.
 *
 * Both sides are hashed to a fixed length and compared in constant time, so the check neither
 * throws on a length mismatch nor reveals the token's length or contents through timing.
 *
 * @param authorizationHeader - Raw Authorization header value, if any
 * @param expectedToken - The configured token; an unset value never matches
 * @returns Whether the header presents the expected bearer token
 */
export function matchesBearerToken(authorizationHeader: string | null | undefined, expectedToken?: string): boolean {
  if (!authorizationHeader || !expectedToken) return false
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) return false

  // Everything after the scheme is the token, so trailing segments can't be ignored.
  const value = authorizationHeader.slice(BEARER_PREFIX.length)

  return timingSafeEqual(digest(value), digest(expectedToken))
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}
