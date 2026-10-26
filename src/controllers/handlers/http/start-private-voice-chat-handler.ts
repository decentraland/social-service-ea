import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { StartPrivateVoiceChatRequestBody } from './schemas'

export async function startPrivateVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'voice' | 'logs', '/v1/private-voice-chats'>,
    'components' | 'request' | 'verification'
  >
): Promise<HTTPResponse<{ callId: string }>> {
  const {
    components: { voice, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('start-private-voice-chat-handler')
  const callerAddress = normalizeAddress(verification!.auth)
  let calleeAddress: string | undefined

  try {
    const body: StartPrivateVoiceChatRequestBody = await request.json()
    calleeAddress = normalizeAddress(body.calleeAddress)

    if (!EthAddress.validate(calleeAddress)) {
      throw new InvalidRequestError('Invalid calleeAddress')
    }

    if (calleeAddress === callerAddress) {
      throw new InvalidRequestError('You cannot call yourself')
    }

    const callId = await voice.startPrivateVoiceChat(callerAddress, calleeAddress)

    return {
      status: 201,
      body: {
        data: { callId }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error starting a private voice chat from ${callerAddress} to ${calleeAddress}, error: ${message}`)

    throw error
  }
}
