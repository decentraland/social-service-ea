import { createHash, timingSafeEqual } from 'crypto'

/**
 * Whether an Authorization header carries the expected bearer token.
 *
 * Both sides are hashed to a fixed length before comparison, so the check neither throws on a
 * length mismatch nor reveals the token's length through timing.
 *
 * @param authorizationHeader - Raw Authorization header value, if any
 * @param expectedToken - The configured token; an unset value never matches
 * @returns Whether the header presents the expected bearer token
 */
export function matchesBearerToken(authorizationHeader: string | null | undefined, expectedToken?: string): boolean {
  if (!authorizationHeader || !expectedToken) return false

  const [scheme, value] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !value) return false

  return digest(value).equals(digest(expectedToken))
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Exposed so the comparison itself stays testable without reaching into crypto. */
export function tokensMatch(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected))
}
