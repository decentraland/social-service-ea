import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { normalizeAddress } from '../../../utils/address'
import { MemberCommunityRequestV2 } from '../../../logic/community/types'
import { getPaginationParams, NotAuthorizedError } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseRequestTypeFilter } from '../../../logic/community/utils'

/**
 * v2 of {@link getMemberRequestsHandler}: returns each request's community with the owner
 * address and mutual-friend addresses only, without any profile information.
 */
export async function getMemberRequestsV2Handler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityRequests', '/v2/members/:address/requests'>,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse<PaginatedResponse<MemberCommunityRequestV2>>> {
  const {
    components: { logs, communityRequests },
    params: { address: targetAddress },
    verification,
    url
  } = context

  const logger = logs.getLogger('get-member-requests-v2-handler')

  try {
    const userAddress = verification!.auth.toLowerCase()
    const normalizedTargetAddress = normalizeAddress(targetAddress)

    if (normalizeAddress(userAddress) !== normalizedTargetAddress) {
      throw new NotAuthorizedError('You are not authorized to get requests for this member')
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const typeFilter = parseRequestTypeFilter(url.searchParams)

    const memberRequests = await communityRequests.getMemberRequests(normalizedTargetAddress, {
      type: typeFilter,
      pagination: paginationParams
    })

    const results = await communityRequests.aggregateRequestsWithCommunitiesWithoutProfiles(
      normalizedTargetAddress,
      memberRequests.requests
    )

    return {
      status: 200,
      body: {
        data: {
          results,
          total: memberRequests.total,
          ...getPaginationResultProperties(memberRequests.total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting member requests (v2) for ${targetAddress}: ${message}`)

    if (error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
