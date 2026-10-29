import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { CommunityVoiceChatPermissionError } from '../../../logic/community-voice/errors'

/** Raises the caller's hand to ask to speak. */
export async function createCommunityVoiceChatSpeakRequestHandler(
  context: Pick<
    HandlerContextWithPath<'communityVoice' | 'logs', '/v1/community-voice-chats/:communityId/speak-requests'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityVoice, logs },
    params: { communityId },
    verification
  } = context

  const logger = logs.getLogger('create-community-voice-chat-speak-request-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error requesting to speak in the voice chat of community ${communityId} by ${userAddress}, error: ${message}`
    )

    // A banned user is authenticated but not allowed: 403, not the 401 NotAuthorizedError maps to.
    if (error instanceof NotAuthorizedError) {
      throw new CommunityVoiceChatPermissionError(error.message)
    }

    throw error
  }
}
