import { Empty } from '@dcl/protocol/out-ts/google/protobuf/empty.gen'
import { GetIncomingPrivateVoiceChatRequestResponse } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'
import { IncomingVoiceChatNotFoundError } from '../../../logic/voice/errors'

export function getIncomingPrivateVoiceChatRequestsService({
  components: { logs, voice }
}: RPCServiceContext<'logs' | 'voice'>) {
  const logger = logs.getLogger('get-incoming-private-voice-chat-requests-service')

  return async function (
    _request: Empty,
    context: RpcServerContext
  ): Promise<GetIncomingPrivateVoiceChatRequestResponse> {
    try {
      const privateVoiceChat = await voice.getIncomingPrivateVoiceChat(context.address)

      return {
        response: {
          $case: 'ok',
          ok: {
            callId: privateVoiceChat.id,
            caller: {
              address: privateVoiceChat.caller_address
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      if (error instanceof IncomingVoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFound',
            notFound: {
              message: errorMessage
            }
          }
        }
      }

      logger.error(`Error getting incoming private voice chat: ${errorMessage}`)

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
