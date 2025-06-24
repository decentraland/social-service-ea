import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { errorMessageOrDefault } from '../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { BannedMemberProfile, CommunityNotFoundError } from '../../logic/community'
import { getPaginationResultProperties } from '../../utils/pagination'

export async function getBannedMembersHandler(
  context: Pick<
    HandlerContextWithPath<'communityBans' | 'logs', '/v1/communities/:id/bans'>,
    'components' | 'url' | 'verification' | 'params'
  >
): Promise<HTTPResponse<PaginatedResponse<BannedMemberProfile>>> {
  const {
    components: { communityBans, logs },
    verification,
    url,
    params: { id: communityId }
  } = context
  const logger = logs.getLogger('get-banned-members-handler')

  logger.info(`Getting banned members for community ${communityId}`)

  try {
    const userAddress = verification!.auth.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const { members, totalMembers } = await communityBans.getBannedMembers(communityId, userAddress, paginationParams)

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
    logger.error(`Error getting banned members: ${communityId}, error: ${message}`)

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
