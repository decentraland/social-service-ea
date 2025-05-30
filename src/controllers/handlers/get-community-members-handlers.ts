import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityMemberProfile, CommunityNotFoundError } from '../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../utils/pagination'
import { PaginatedResponse } from '@dcl/schemas'

export async function getCommunityMembersHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'community', '/v1/communities/:id/members'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityMemberProfile>>> {
  const {
    components: { community, logs },
    params: { id: communityId },
    verification
  } = context
  const logger = logs.getLogger('get-community-members-handler')

  logger.info(`Getting community members for community: ${communityId}`)

  try {
    const userAddress = verification!.auth.toLowerCase()
    const paginationParams = getPaginationParams(context.url.searchParams)

    const { members, totalMembers } = await community.getCommunityMembers(communityId, userAddress, paginationParams)

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
