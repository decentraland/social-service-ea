import { getPaginationParams, InvalidRequestError } from '@dcl/http-commons'
import { EthAddress, PaginatedResponse } from '@dcl/schemas'
import { FriendProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseProfilesToFriends } from '../../../logic/friends'

export async function getMutualFriendsHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/users/:address/mutual-friends'>,
    'components' | 'url' | 'params' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<FriendProfile>>> {
  const {
    components: { friends, logs },
    url,
    params,
    verification
  } = context

  const logger = logs.getLogger('get-mutual-friends-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const otherAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(otherAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const { friendsProfiles, total } = await friends.getMutualFriendsProfiles(
      userAddress,
      otherAddress,
      paginationParams
    )

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
    logger.error(`Error getting mutual friends of ${userAddress} and ${otherAddress}, error: ${message}`)

    throw error
  }
}
