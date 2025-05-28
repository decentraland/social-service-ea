import { StartCallResponse } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'
import { UsersAlreadyInVoiceChatError, VoiceCallNotAllowedError } from '../../../logic/voice/errors'

export function startCallService({ components: { logs, voice } }: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('start-call-service')

  return async function (request: StartCallPayload, context: RpcServerContext): Promise<StartCallResponse> {
    try {
      const callId = await voice.startVoiceChat(context.address, request.callee)

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

      if (error instanceof VoiceCallNotAllowedError || error instanceof UsersAlreadyInVoiceChatError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
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
