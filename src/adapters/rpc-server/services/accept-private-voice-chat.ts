import {
  AcceptPrivateVoiceChatPayload,
  AcceptPrivateVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { VoiceChatExpiredError, VoiceChatNotAllowedError, VoiceChatNotFoundError } from '../../../logic/voice/errors'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'

export function acceptPrivateVoiceChatService({ components: { logs, voice } }: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('start-call-service')

  return async function (
    request: AcceptPrivateVoiceChatPayload,
    context: RpcServerContext
  ): Promise<AcceptPrivateVoiceChatResponse> {
    try {
      const { token, url } = await voice.acceptPrivateVoiceChat(request.callId, context.address)

      return {
        response: {
          $case: 'ok',
          ok: {
            callId: request.callId,
            token,
            url
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error accepting private voice chat: ${errorMessage}`)

      if (error instanceof VoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFound',
            notFound: {
              message: errorMessage
            }
          }
        }
      } else if (error instanceof VoiceChatNotAllowedError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: {
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
