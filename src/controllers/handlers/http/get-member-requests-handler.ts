import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { normalizeAddress } from '../../../utils/address'
import { CommunityRequestType, MemberCommunityRequest } from '../../../logic/community/types'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { getPaginationResultProperties } from '../../../utils/pagination'

export async function getMemberRequestsHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityRequests' | 'communities', '/v1/members/:address/requests'>,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse<PaginatedResponse<MemberCommunityRequest>>> {
  const {
    components: { logs, communities, communityRequests },
    params: { address: targetAddress },
    verification,
    url
  } = context

  const logger = logs.getLogger('get-member-requests-handler')

  try {
    const userAddress = verification!.auth.toLowerCase()
    const normalizedTargetAddress = normalizeAddress(targetAddress)

    if (normalizeAddress(userAddress) !== normalizedTargetAddress) {
      throw new NotAuthorizedError('You are not authorized to get requests for this member')
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const typeParam: string | null = url.searchParams.get('type')
    const typeFilter =
      typeParam === CommunityRequestType.Invite || typeParam === CommunityRequestType.RequestToJoin
        ? (typeParam as CommunityRequestType)
        : undefined

    const memberRequests = await communityRequests.getMemberRequests(normalizedTargetAddress, {
      type: typeFilter,
      pagination: paginationParams
    })

    const results = await communityRequests.aggregateRequestsWithCommunities(
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
    logger.error(`Error getting member requests for ${targetAddress}: ${message}`)

    if (error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
