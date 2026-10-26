import { getPaginationParams } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { BlockedUserWithoutProfile, parseBlockedUserWithoutProfile } from '../../../logic/friends'

/**
 * Returns the users the caller blocked, as addresses with the time they were blocked.
 */
export async function getBlockedUsersV2Handler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v2/blocks'>, 'components' | 'url' | 'verification'>
): Promise<HTTPResponse<PaginatedResponse<BlockedUserWithoutProfile>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-blocked-users-v2-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const paginationParams = getPaginationParams(url.searchParams)
    const { blockedUsers, total } = await friends.getBlockedUsersWithoutProfiles(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results: blockedUsers.map(({ address, blocked_at }) => parseBlockedUserWithoutProfile(address, blocked_at)),
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
