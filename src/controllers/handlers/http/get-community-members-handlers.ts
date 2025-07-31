import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityMemberProfile, CommunityNotFoundError, GetCommunityMembersOptions } from '../../../logic/community'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { EthAddress, PaginatedResponse } from '@dcl/schemas'
import { IConfigComponent } from '@well-known-components/interfaces'

export async function getCommunityMembersHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'config' | 'communityMembers', '/v1/communities/:id/members'>,
    'url' | 'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityMemberProfile>>> {
  const {
    components: { communityMembers, logs, config },
    params: { id: communityId },
    verification,
    url,
    request
  } = context
  const logger = logs.getLogger('get-community-members-handler')
  const API_ADMIN_TOKEN = await config.getString('API_ADMIN_TOKEN')

  logger.info(`Getting community members for community: ${communityId}`)

  try {
    const userAddress = verification?.auth?.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const onlyOnline = url.searchParams.get('onlyOnline')?.toLowerCase() === 'true'
    const optionalAuthHeader = request.headers.get('Authorization')

    const options: GetCommunityMembersOptions = { pagination: paginationParams, onlyOnline }

    const { members, totalMembers } = userAddress
      ? await communityMembers.getCommunityMembers(communityId, {
          ...options,
          as: userAddress,
          byPassPrivacy: !!(API_ADMIN_TOKEN && optionalAuthHeader === `Bearer ${API_ADMIN_TOKEN}`)
        })
      : await communityMembers.getCommunityMembers(communityId, options)

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
