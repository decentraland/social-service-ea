import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { Action, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { FriendshipRequestWithoutProfile, parseFriendshipRequestWithoutProfile } from '../../../logic/friends'
import { FriendshipRequestIntention, UpdateFriendshipRequestRequestBody } from './schemas'

const ACTION_BY_INTENTION: Record<FriendshipRequestIntention, Action.ACCEPT | Action.REJECT | Action.CANCEL> = {
  accepted: Action.ACCEPT,
  rejected: Action.REJECT,
  cancelled: Action.CANCEL
}

/**
 * Resolves the pending friendship request between the caller and `:address`: the receiver accepts or
 * rejects it, the sender cancels it. There is at most one pending request per pair of users, so the
 * other user's address identifies it.
 */
export async function updateFriendshipRequestHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/friendship-requests/:address'>,
    'components' | 'params' | 'request' | 'verification'
  >
): Promise<HTTPResponse<FriendshipRequestWithoutProfile>> {
  const {
    components: { friends, logs },
    params,
    request,
    verification
  } = context

  const logger = logs.getLogger('update-friendship-request-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const otherAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(otherAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (otherAddress === userAddress) {
      throw new InvalidRequestError('There is no friendship request with yourself')
    }

    const { intention }: UpdateFriendshipRequestRequestBody = await request.json()

    const friendshipRequest = await friends.upsertFriendshipWithoutProfiles(
      userAddress,
      otherAddress,
      ACTION_BY_INTENTION[intention],
      null
    )

    return {
      status: 200,
      body: {
        data: parseFriendshipRequestWithoutProfile(friendshipRequest)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating friendship request between ${userAddress} and ${otherAddress}, error: ${message}`)

    throw error
  }
}
