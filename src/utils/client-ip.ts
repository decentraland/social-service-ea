import { isIP } from 'net'

/**
 * Resolves the client IP from the edge's forwarding headers.
 *
 * The value is only as reliable as the deployment's edge. Use it for anti-fraud heuristics and
 * rate-limit bucketing, not as an authorization or authentication input.
 *
 * @param headers - The incoming request's headers
 * @returns The forwarded client IP, or null when absent or malformed
 */
export function resolveClientIp(headers: Headers): string | null {
  const forwardedIp =
    emptyToNull(headers.get('cf-connecting-ip')) ??
    lastForwardedFor(headers.get('x-forwarded-for')) ??
    emptyToNull(headers.get('x-real-ip'))

  return forwardedIp && isIP(forwardedIp) !== 0 ? forwardedIp : null
}

/**
 * Returns the rightmost `x-forwarded-for` entry — the address observed by the closest proxy.
 * Entries to its left are client-supplied, so the rightmost is the one to key state on.
 */
function lastForwardedFor(header: string | null): string | null {
  if (!header) return null
  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length > 0 ? entries[entries.length - 1] : null
}

function emptyToNull(value: string | null): string | null {
  return value ? value : null
}
