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
 * Unrecognized roles are dropped, which keeps a partially valid filter working: `roles=owner&roles=x`
 * still filters by owner, so the answer is narrower than asked for rather than wider. Dropping *every*
 * value is different — the filter disappears and the listing widens to everything — so that is
 * refused. Empty values are treated as absent, since clients serialize unset fields as `roles=`.
 *
 * @param searchParams - The request's query parameters
 * @param userAddress - The verified caller, if the request carried a valid signature
 * @returns The filters to pass to the listing query
 * @throws NotAuthorizedError when a filter needs an identity the request does not have
 * @throws InvalidRequestError when every supplied role is unrecognized
 */
export function parseMembershipFilters(
  searchParams: URLSearchParams,
  userAddress?: string
): { onlyMemberOf: boolean; roles?: CommunityRole[] } {
  const onlyMemberOf = searchParams.get('onlyMemberOf')?.toLowerCase() === 'true'

  const validRoles = Object.values(CommunityRole)
  const requestedRoles = searchParams.getAll('roles').filter((role) => role.trim().length > 0)
  const roles = requestedRoles.filter((role) => validRoles.includes(role as CommunityRole)) as CommunityRole[]

  if (requestedRoles.length > 0 && roles.length === 0) {
    throw new InvalidRequestError(
      `Unknown community role: ${requestedRoles.join(', ')}. Valid roles are ${validRoles.join(', ')}`
    )
  }

  if (!userAddress && (roles.length > 0 || onlyMemberOf)) {
    throw new NotAuthorizedError('Authentication required to filter communities by your own membership')
  }

  return { onlyMemberOf, roles: roles.length > 0 ? roles : undefined }
}
