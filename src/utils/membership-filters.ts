import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { CommunityRole } from '../types/entities'

/**
 * Reads the membership filters from a community listing request.
 *
 * Both filters describe the *caller's* relationship to a community, so neither can be answered
 * without an identity. The listing routes authenticate optionally, and their anonymous branch has no
 * way to express either filter — so a request carrying one has to be refused rather than answered
 * with an unfiltered listing, which is what a caller asking for "communities I moderate" would
 * otherwise receive.
 *
 * An unrecognized role is refused for the same reason: dropping it silently leaves the request
 * looking filtered while the answer is not.
 *
 * @param searchParams - The request's query parameters
 * @param userAddress - The verified caller, if the request carried a valid signature
 * @returns The filters to pass to the listing query
 * @throws NotAuthorizedError when a filter needs an identity the request does not have
 * @throws InvalidRequestError when a supplied role is not a community role
 */
export function parseMembershipFilters(
  searchParams: URLSearchParams,
  userAddress?: string
): { onlyMemberOf: boolean; roles?: CommunityRole[] } {
  const onlyMemberOf = searchParams.get('onlyMemberOf')?.toLowerCase() === 'true'
  const requestedRoles = searchParams.getAll('roles')

  const validRoles = Object.values(CommunityRole)
  const unknownRoles = requestedRoles.filter((role) => !validRoles.includes(role as CommunityRole))

  if (unknownRoles.length > 0) {
    throw new InvalidRequestError(
      `Unknown community role: ${unknownRoles.join(', ')}. Valid roles are ${validRoles.join(', ')}`
    )
  }

  if (!userAddress && (requestedRoles.length > 0 || onlyMemberOf)) {
    throw new NotAuthorizedError('Authentication required to filter communities by your own membership')
  }

  return {
    onlyMemberOf,
    roles: requestedRoles.length > 0 ? (requestedRoles as CommunityRole[]) : undefined
  }
}
