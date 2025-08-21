import {
  RequestToSpeakInCommunityVoiceChatPayload,
  RequestToSpeakInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function requestToSpeakInCommunityVoiceChatService({
  components: { logs, commsGatekeeper }
}: RPCServiceContext<'logs' | 'commsGatekeeper'>) {
  const logger = logs.getLogger('request-to-speak-in-community-voice-chat-rpc')

  return async function (
    request: RequestToSpeakInCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<RequestToSpeakInCommunityVoiceChatResponse> {
    try {
      // cast all addresses to lowercase
      context.address = context.address.toLowerCase()

      const action = request.isRaisingHand ? 'raising hand' : 'lowering hand'
      logger.info(`${action} in community voice chat`, {
        communityId: request.communityId,
        userAddress: context.address,
        isRaisingHand: String(request.isRaisingHand)
      })

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      await commsGatekeeper.requestToSpeakInCommunityVoiceChat(
        request.communityId,
        context.address,
        request.isRaisingHand
      )

      const successMessage = request.isRaisingHand ? 'Request to speak sent successfully' : 'Hand lowered successfully'
      logger.info(successMessage, {
        communityId: request.communityId,
        userAddress: context.address,
        isRaisingHand: String(request.isRaisingHand)
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: successMessage
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to update hand status in community voice chat:', {
        errorMessage: errorMessage,
        communityId: request.communityId,
        userAddress: context.address,
        isRaisingHand: String(request.isRaisingHand)
      })

      // Handle specific error types
      if (error instanceof UserNotCommunityMemberError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      if (error instanceof CommunityVoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFoundError',
            notFoundError: { message: error.message }
          }
        }
      }

      if (error instanceof InvalidCommunityIdError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Failed to update hand status in community voice chat' }
        }
      }
    }
  }
}
