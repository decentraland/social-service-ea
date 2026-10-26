import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { CommunityVoiceChatPermissionError } from '../../../logic/community-voice/errors'
import { rejectSpeakRequestInCommunityVoiceChat } from '../../../logic/community-voice/moderation'

/**
 * Removes a request to speak: on the caller's own address it lowers their hand, on someone else's it
 * is an owner or moderator rejecting the request.
 */
export async function removeCommunityVoiceChatSpeakRequestHandler(
  context: Pick<
    HandlerContextWithPath<
      'communityVoice' | 'commsGatekeeper' | 'communitiesDb' | 'logs',
      '/v1/community-voice-chats/:communityId/speak-requests/:address'
    >,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityVoice, commsGatekeeper, communitiesDb, logs },
    params: { communityId, address },
    verification
  } = context

  const logger = logs.getLogger('remove-community-voice-chat-speak-request-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const targetAddress = normalizeAddress(address)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    if (!EthAddress.validate(targetAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (targetAddress === userAddress) {
      await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, false)
    } else {
      await rejectSpeakRequestInCommunityVoiceChat(
        { commsGatekeeper, communitiesDb, logs },
        communityId,
        userAddress,
        targetAddress
      )
    }

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error removing the speak request of ${targetAddress} in the voice chat of community ${communityId} by ${userAddress}, error: ${message}`
    )

    // A banned user is authenticated but not allowed: 403, not the 401 NotAuthorizedError maps to.
    if (error instanceof NotAuthorizedError) {
      throw new CommunityVoiceChatPermissionError(error.message)
    }

    throw error
  }
}
