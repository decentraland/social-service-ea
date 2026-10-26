import { InvalidRequestError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'

export async function endPrivateVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'voice' | 'logs', '/v1/private-voice-chats/:callId'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { voice, logs },
    params: { callId },
    verification
  } = context

  const logger = logs.getLogger('end-private-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    if (!isValidUUID(callId)) {
      throw new InvalidRequestError('Invalid callId')
    }

    await voice.endPrivateVoiceChat(callId, userAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error ending the private voice chat ${callId} by ${userAddress}, error: ${message}`)

    throw error
  }
}
