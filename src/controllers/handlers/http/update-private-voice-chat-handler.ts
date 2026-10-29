import { InvalidRequestError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { UpdatePrivateVoiceChatRequestBody } from './schemas'

/** The callee accepts the call, getting the credentials to join it, or rejects it. */
export async function updatePrivateVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'voice' | 'logs', '/v1/private-voice-chats/:callId'>,
    'components' | 'params' | 'request' | 'verification'
  >
): Promise<HTTPResponse<{ callId: string; connectionUrl: string }>> {
  const {
    components: { voice, logs },
    params: { callId },
    request,
    verification
  } = context

  const logger = logs.getLogger('update-private-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    if (!isValidUUID(callId)) {
      throw new InvalidRequestError('Invalid callId')
    }

    const { intention }: UpdatePrivateVoiceChatRequestBody = await request.json()

    if (intention === 'rejected') {
      await voice.rejectPrivateVoiceChat(callId, userAddress)
      return { status: 204 }
    }

    const { connectionUrl } = await voice.acceptPrivateVoiceChat(callId, userAddress)

    return {
      status: 200,
      body: {
        data: { callId, connectionUrl }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating the private voice chat ${callId} by ${userAddress}, error: ${message}`)

    throw error
  }
}
