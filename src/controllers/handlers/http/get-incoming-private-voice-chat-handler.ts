import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { IncomingVoiceChatNotFoundError } from '../../../logic/voice/errors'

export async function getIncomingPrivateVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'voice' | 'logs', '/v1/private-voice-chats/incoming'>,
    'components' | 'verification'
  >
): Promise<HTTPResponse<{ callId: string; callerAddress: string }>> {
  const {
    components: { voice, logs },
    verification
  } = context

  const logger = logs.getLogger('get-incoming-private-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const privateVoiceChat = await voice.getIncomingPrivateVoiceChat(userAddress)

    return {
      status: 200,
      body: {
        data: {
          callId: privateVoiceChat.id,
          callerAddress: privateVoiceChat.caller_address
        }
      }
    }
  } catch (error) {
    // Not having an incoming call is the common answer, not a failure worth logging.
    if (!(error instanceof IncomingVoiceChatNotFoundError)) {
      const message = errorMessageOrDefault(error)
      logger.error(`Error getting the incoming private voice chat of ${userAddress}, error: ${message}`)
    }

    throw error
  }
}
