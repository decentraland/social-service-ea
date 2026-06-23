import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { MemberRequest, WithFriendshipStatus } from '../../../logic/community/types'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseRequestTypeFilter } from '../../../logic/community/utils'

/**
 * v2 of {@link getCommunityRequestsHandler}: returns the requesting member addresses (and
 * friendship status) only, without any profile information.
 */
export async function getCommunityRequestsV2Handler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityRequests' | 'communityMembers', '/v2/communities/:id/requests'>,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse<PaginatedResponse<WithFriendshipStatus<MemberRequest>>>> {
  const {
    components: { logs, communityRequests, communityMembers },
    params: { id: communityId },
    verification,
    url
  } = context

  const logger = logs.getLogger('get-community-requests-v2-handler')

  try {
    const userAddress = verification!.auth.toLowerCase()

    const paginationParams = getPaginationParams(url.searchParams)
    const typeFilter = parseRequestTypeFilter(url.searchParams)

    const { requests, total } = await communityRequests.getCommunityRequests(communityId, {
      pagination: paginationParams,
      type: typeFilter,
      callerAddress: userAddress
    })

    const requestsWithFriendshipStatus = communityMembers.aggregateWithFriendshipStatus(userAddress, requests)

    return {
      status: 200,
      body: {
        data: {
          results: requestsWithFriendshipStatus,
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community requests (v2) for ${communityId}: ${message}`)

    if (error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
