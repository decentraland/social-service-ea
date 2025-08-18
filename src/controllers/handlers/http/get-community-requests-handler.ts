import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityMemberProfile } from '../../../logic/community/types'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseRequestTypeFilter } from '../../../logic/community/utils'

export async function getCommunityRequestsHandler(
  context: Pick<
    HandlerContextWithPath<
      'logs' | 'communityRequests' | 'communityRoles' | 'communityMembers',
      '/v1/communities/:id/requests'
    >,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityMemberProfile>>> {
  const {
    components: { logs, communityRoles, communityRequests, communityMembers },
    params: { id: communityId },
    verification,
    url
  } = context

  const logger = logs.getLogger('get-community-requests-handler')

  try {
    const userAddress = verification!.auth.toLowerCase()

    await communityRoles.validatePermissionToViewRequests(communityId, userAddress)

    const paginationParams = getPaginationParams(url.searchParams)
    const typeFilter = parseRequestTypeFilter(url.searchParams)

    const { requests, total } = await communityRequests.getCommunityRequests(communityId, {
      pagination: paginationParams,
      type: typeFilter
    })

    const requestsWithProfiles = await communityMembers.aggregateWithProfiles(userAddress, requests)

    return {
      status: 200,
      body: {
        data: {
          results: requestsWithProfiles,
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community requests for ${communityId}: ${message}`)

    if (error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
