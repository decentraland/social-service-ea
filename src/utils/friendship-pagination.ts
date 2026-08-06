import type { Pagination } from '../types'

// Per-call maximums, each set from the largest page a shipping client actually requests.
// They must never sit below that: clients compute their next offset from the page size they
// ASKED for, not the number of rows returned, so a lower cap makes them skip rows rather
// than re-page.
//
// Unity Explorer pages friendship requests at 100; 200 leaves headroom for a client bump.
export const FRIENDSHIP_REQUESTS_DEFAULT_LIMIT = 100
export const FRIENDSHIP_REQUESTS_MAX_LIMIT = 200
// Unity Explorer's friends-cache prewarm asks for 1000 in one shot; godot-explorer asks for
// 1000 mutual friends. Capping either at a lower value truncates those lists silently.
export const FRIENDS_DEFAULT_LIMIT = 1000
export const FRIENDS_MAX_LIMIT = 1000
// Only Unity Explorer reads this, at a page size of 50.
export const BLOCKED_USERS_DEFAULT_LIMIT = 200
export const BLOCKED_USERS_MAX_LIMIT = 200
// No client can reach this: every one bounds its offset by the total the server reports.
export const MAX_PAGINATION_OFFSET = 100_000

/**
 * Returns bounded pagination for a list read.
 *
 * Missing, zero, negative, fractional and non-finite values are normalized to safe defaults,
 * so an omitted or oversized page size cannot turn into an unbounded query and an unbounded
 * downstream profile lookup.
 *
 * @param pagination - Optional pagination supplied by an RPC or internal caller
 * @param bounds - The default and maximum limit for this particular call
 * @returns A positive bounded limit and a nonnegative bounded offset
 */
export function normalizePagination(
  pagination: Pagination | undefined,
  bounds: { defaultLimit: number; maxLimit: number }
): Pagination {
  const requestedLimit = pagination?.limit
  const requestedOffset = pagination?.offset

  const limit =
    typeof requestedLimit === 'number' && Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), bounds.maxLimit)
      : bounds.defaultLimit
  const offset =
    typeof requestedOffset === 'number' && Number.isFinite(requestedOffset) && requestedOffset >= 0
      ? Math.min(Math.floor(requestedOffset), MAX_PAGINATION_OFFSET)
      : 0

  return { limit, offset }
}

/** Bounded pagination for the pending/sent friendship-request reads. */
export function normalizeFriendshipRequestsPagination(pagination?: Pagination): Pagination {
  return normalizePagination(pagination, {
    defaultLimit: FRIENDSHIP_REQUESTS_DEFAULT_LIMIT,
    maxLimit: FRIENDSHIP_REQUESTS_MAX_LIMIT
  })
}

/** Bounded pagination for the friends and mutual-friends reads. */
export function normalizeFriendsPagination(pagination?: Pagination): Pagination {
  return normalizePagination(pagination, { defaultLimit: FRIENDS_DEFAULT_LIMIT, maxLimit: FRIENDS_MAX_LIMIT })
}

/** Bounded pagination for the blocked-users read. */
export function normalizeBlockedUsersPagination(pagination?: Pagination): Pagination {
  return normalizePagination(pagination, {
    defaultLimit: BLOCKED_USERS_DEFAULT_LIMIT,
    maxLimit: BLOCKED_USERS_MAX_LIMIT
  })
}
