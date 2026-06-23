import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { BannedMemberV2, CommunityNotFoundError } from '../../../logic/community'
import { getPaginationResultProperties } from '../../../utils/pagination'

/**
 * v2 of {@link getBannedMembersHandler}: returns the banned member addresses (and
 * friendship status) only, without any profile information.
 */
export async function getBannedMembersV2Handler(
  context: Pick<
    HandlerContextWithPath<'communityBans' | 'logs', '/v2/communities/:id/bans'>,
    'components' | 'url' | 'verification' | 'params'
  >
): Promise<HTTPResponse<PaginatedResponse<BannedMemberV2>>> {
  const {
    components: { communityBans, logs },
    verification,
    url,
    params: { id: communityId }
  } = context
  const logger = logs.getLogger('get-banned-members-v2-handler')

  logger.info(`Getting banned members (v2) for community ${communityId}`)

  try {
    const userAddress = verification!.auth.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const { members, totalMembers } = await communityBans.getBannedMembersWithoutProfiles(
      communityId,
      userAddress,
      paginationParams
    )

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
    logger.error(`Error getting banned members (v2): ${communityId}, error: ${message}`)

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
