import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityMemberV2, CommunityNotFoundError, GetCommunityMembersOptions } from '../../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/http-commons'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { PaginatedResponse } from '@dcl/schemas'

/**
 * v2 of {@link getCommunityMembersHandler}: returns the member addresses (and friendship
 * status) only, without any profile information.
 */
export async function getCommunityMembersV2Handler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'config' | 'communityMembers', '/v2/communities/:id/members'>,
    'url' | 'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityMemberV2>>> {
  const {
    components: { communityMembers, logs, config },
    params: { id: communityId },
    verification,
    url,
    request
  } = context
  const logger = logs.getLogger('get-community-members-v2-handler')
  const API_ADMIN_TOKEN = await config.getString('API_ADMIN_TOKEN')

  logger.info(`Getting community members (v2) for community: ${communityId}`)

  try {
    const userAddress = verification?.auth?.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const onlyOnline = url.searchParams.get('onlyOnline')?.toLowerCase() === 'true'
    const optionalAuthHeader = request.headers.get('Authorization')

    const options: GetCommunityMembersOptions = { pagination: paginationParams, onlyOnline }

    const { members, totalMembers } = await communityMembers.getCommunityMembersWithoutProfiles(communityId, {
      ...options,
      as: userAddress,
      byPassPrivacy: !!(API_ADMIN_TOKEN && optionalAuthHeader === `Bearer ${API_ADMIN_TOKEN}`)
    })

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
    logger.error(`Error getting community members (v2): ${communityId}, error: ${message}`)

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
