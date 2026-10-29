import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { CommunityVoiceChatPermissionError } from '../../../logic/community-voice/errors'

export async function joinCommunityVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'communityVoice' | 'logs', '/v1/community-voice-chats/:communityId/participants'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<{ connectionUrl: string }>> {
  const {
    components: { communityVoice, logs },
    params: { communityId },
    verification
  } = context

  const logger = logs.getLogger('join-community-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    const { connectionUrl } = await communityVoice.joinCommunityVoiceChat(communityId, userAddress, {
      includeProfile: false
    })

    return {
      status: 201,
      body: {
        data: { connectionUrl }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error joining the voice chat of community ${communityId} by ${userAddress}, error: ${message}`)

    // A banned user is authenticated but not allowed: 403, not the 401 NotAuthorizedError maps to.
    if (error instanceof NotAuthorizedError) {
      throw new CommunityVoiceChatPermissionError(error.message)
    }

    throw error
  }
}
