import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { Action, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { FriendshipRequestWithoutProfile, parseFriendshipRequestWithoutProfile } from '../../../logic/friends'
import { CreateFriendshipRequestRequestBody } from './schemas'

export async function createFriendshipRequestHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/friendship-requests'>,
    'components' | 'request' | 'verification'
  >
): Promise<HTTPResponse<FriendshipRequestWithoutProfile>> {
  const {
    components: { friends, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('create-friendship-request-handler')
  const senderAddress = normalizeAddress(verification!.auth)
  let receiverAddress: string | undefined

  try {
    const body: CreateFriendshipRequestRequestBody = await request.json()
    receiverAddress = normalizeAddress(body.address)

    if (!EthAddress.validate(receiverAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (receiverAddress === senderAddress) {
      throw new InvalidRequestError('You cannot send a friendship request to yourself')
    }

    const friendshipRequest = await friends.upsertFriendshipWithoutProfiles(
      senderAddress,
      receiverAddress,
      Action.REQUEST,
      body.message ? { message: body.message } : null
    )

    return {
      status: 201,
      body: {
        data: parseFriendshipRequestWithoutProfile(friendshipRequest)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error sending friendship request from ${senderAddress} to ${receiverAddress}, error: ${message}`)

    throw error
  }
}
