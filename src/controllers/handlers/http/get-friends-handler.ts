import { getPaginationParams } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseProfilesToFriends } from '../../../logic/friends'

export async function getFriendsHandler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v1/friends'>, 'components' | 'url' | 'verification'>
): Promise<HTTPResponse<PaginatedResponse<FriendProfile>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-friends-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const paginationParams = getPaginationParams(url.searchParams)
    const { friendsProfiles, total } = await friends.getFriendsProfiles(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results: parseProfilesToFriends(friendsProfiles),
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
