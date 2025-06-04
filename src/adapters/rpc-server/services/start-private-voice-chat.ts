import {
  StartPrivateVoiceChatPayload,
  StartPrivateVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'
import {
  UserAlreadyInVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatNotAllowedError
} from '../../../logic/voice/errors'

export function startPrivateVoiceChatService({ components: { logs, voice } }: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('start-private-voice-chat-service')

  return async function (
    request: StartPrivateVoiceChatPayload,
    context: RpcServerContext
  ): Promise<StartPrivateVoiceChatResponse> {
    try {
      if (!request.callee?.address) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: 'Callee address is missing in the request payload' }
          }
        }
      }

      const callId = await voice.startPrivateVoiceChat(context.address, request.callee.address)

      return {
        response: {
          $case: 'ok',
          ok: {
            callId
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error starting call: ${errorMessage}`)

      if (error instanceof VoiceChatNotAllowedError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: {
              message: error.message
            }
          }
        }
      } else if (error instanceof UsersAreCallingSomeoneElseError) {
        return {
          response: {
            $case: 'conflictingError',
            conflictingError: {
              message: error.message
            }
          }
        }
      } else if (error instanceof UserAlreadyInVoiceChatError) {
        return {
          response: {
            $case: 'conflictingError',
            conflictingError: {
              message: error.message
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
