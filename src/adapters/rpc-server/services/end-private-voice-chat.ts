import {
  EndPrivateVoiceChatPayload,
  EndPrivateVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'

export function endPrivateVoiceChatService({ components: { logs, voice } }: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('end-private-voice-chat-service')

  return async function (
    request: EndPrivateVoiceChatPayload,
    context: RpcServerContext
  ): Promise<EndPrivateVoiceChatResponse> {
    try {
      await voice.endPrivateVoiceChat(request.callId, context.address)

      return {
        response: {
          $case: 'ok',
          ok: {
            callId: request.callId
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error ending private voice chat: ${errorMessage}`)

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: errorMessage
          }
        }
      }
    }
  }
}
