import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError, GetCommunityMembersResult } from '../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../utils/pagination'

export async function getCommunityMembersHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'community', '/v1/communities/:id/members'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<GetCommunityMembersResult>> {
  const {
    components: { community, logs },
    params: { id: communityId },
    verification
  } = context
  const logger = logs.getLogger('get-community-members-handler')

  if (!communityId) {
    return {
      status: 400,
      body: {
        message: 'Community ID is required'
      }
    }
  }

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

    if (error instanceof CommunityNotFoundError) {
      throw error
    }

    if (error instanceof NotAuthorizedError) {
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
