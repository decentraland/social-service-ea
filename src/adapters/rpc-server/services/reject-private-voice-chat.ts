import {
  RejectPrivateVoiceChatPayload,
  RejectPrivateVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { VoiceChatExpiredError } from '../../../logic/voice/errors'
import { VoiceChatNotFoundError } from '../../../logic/voice/errors'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'

export function rejectPrivateVoiceChatService({ components: { logs, voice } }: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('start-call-service')

  return async function (
    request: RejectPrivateVoiceChatPayload,
    context: RpcServerContext
  ): Promise<RejectPrivateVoiceChatResponse> {
    try {
      await voice.rejectPrivateVoiceChat(request.callId, context.address)

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
      logger.error(`Error starting call: ${errorMessage}`)

      if (error instanceof VoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFound',
            notFound: {
              message: errorMessage
            }
          }
        }
      } else if (error instanceof VoiceChatExpiredError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: errorMessage
            }
          }
        }
      }

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
