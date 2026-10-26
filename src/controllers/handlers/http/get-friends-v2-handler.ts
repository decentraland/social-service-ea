import { getPaginationParams } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse, User } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'

/**
 * Returns the caller's friends as addresses only, without any profile information.
 */
export async function getFriendsV2Handler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v2/friends'>, 'components' | 'url' | 'verification'>
): Promise<HTTPResponse<PaginatedResponse<User>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-friends-v2-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const paginationParams = getPaginationParams(url.searchParams)
    const { friends: results, total } = await friends.getFriendsWithoutProfiles(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results,
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting friends of ${userAddress}, error: ${message}`)

    throw error
  }
}
