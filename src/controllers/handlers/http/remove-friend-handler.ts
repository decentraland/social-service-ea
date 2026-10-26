import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { Action, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function removeFriendHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/friends/:address'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { friends, logs },
    params,
    verification
  } = context

  const logger = logs.getLogger('remove-friend-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const friendAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(friendAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (friendAddress === userAddress) {
      throw new InvalidRequestError('You cannot remove yourself as a friend')
    }

    await friends.upsertFriendshipWithoutProfiles(userAddress, friendAddress, Action.DELETE, null)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error removing friend ${friendAddress} of ${userAddress}, error: ${message}`)

    throw error
  }
}
