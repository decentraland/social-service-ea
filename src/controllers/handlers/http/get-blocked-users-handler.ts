import { getPaginationParams } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { BlockedUserProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseProfilesToBlockedUsers } from '../../../logic/friends'

export async function getBlockedUsersHandler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v1/blocks'>, 'components' | 'url' | 'verification'>
): Promise<HTTPResponse<PaginatedResponse<BlockedUserProfile>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-blocked-users-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const paginationParams = getPaginationParams(url.searchParams)
    const { blockedUsers, blockedProfiles, total } = await friends.getBlockedUsers(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results: parseProfilesToBlockedUsers(blockedProfiles, blockedUsers),
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting users blocked by ${userAddress}, error: ${message}`)

    throw error
  }
}
