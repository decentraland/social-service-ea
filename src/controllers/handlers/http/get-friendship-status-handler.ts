import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getFriendshipRequestStatus } from '../../../logic/friends'

export async function getFriendshipStatusHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/users/:address/friendship-status'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<{ status: FriendshipStatus }>> {
  const {
    components: { friends, logs },
    params,
    verification
  } = context

  const logger = logs.getLogger('get-friendship-status-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const otherAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(otherAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    const lastFriendshipAction = await friends.getFriendshipStatus(userAddress, otherAddress)

    return {
      status: 200,
      body: {
        data: {
          // Same numeric status the community endpoints return in `friendshipStatus`.
          status: getFriendshipRequestStatus(lastFriendshipAction, userAddress)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting friendship status between ${userAddress} and ${otherAddress}, error: ${message}`)

    throw error
  }
}
