import { InvalidRequestError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'

export async function endCommunityVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'communityVoice' | 'logs', '/v1/community-voice-chats/:communityId'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityVoice, logs },
    params: { communityId },
    verification
  } = context

  const logger = logs.getLogger('end-community-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    await communityVoice.endCommunityVoiceChat(communityId, userAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error ending the voice chat of community ${communityId} by ${userAddress}, error: ${message}`)

    throw error
  }
}
