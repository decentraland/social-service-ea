import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityMemberProfile, CommunityNotFoundError, GetCommunityMembersOptions } from '../../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { PaginatedResponse } from '@dcl/schemas'

export async function getCommunityMembersHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityMembers', '/v1/communities/:id/members'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityMemberProfile>>> {
  const {
    components: { communityMembers, logs },
    params: { id: communityId },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-community-members-handler')

  logger.info(`Getting community members for community: ${communityId}`)

  try {
    const userAddress = verification?.auth?.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const onlyOnline = url.searchParams.get('onlyOnline')?.toLowerCase() === 'true'

    const options: GetCommunityMembersOptions = { pagination: paginationParams, onlyOnline }

    const { members, totalMembers } = userAddress
      ? await communityMembers.getCommunityMembers(communityId, userAddress, options)
      : await communityMembers.getMembersFromPublicCommunity(communityId, options)

    return {
      status: 200,
      body: {
        data: {
          results: members,
          total: totalMembers,
          ...getPaginationResultProperties(totalMembers, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community members: ${communityId}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
