import {
  RequestToSpeakInCommunityVoiceChatPayload,
  RequestToSpeakInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import { UserNotCommunityMemberError, CommunityVoiceChatNotFoundError } from '../../../logic/community-voice/errors'
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
      logger.info('Requesting to speak in community voice chat', {
        communityId: request.communityId,
        userAddress: context.address
      })

      if (!request.communityId) {
        logger.warn('Missing community ID in request')
        throw new Error('Community ID is required')
      }

      await commsGatekeeper.requestToSpeakInCommunityVoiceChat(request.communityId, context.address)

      logger.info('Request to speak sent successfully', {
        communityId: request.communityId,
        userAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'Request to speak sent successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to request to speak in community voice chat:', {
        errorMessage: errorMessage,
        communityId: request.communityId,
        userAddress: context.address
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

      // Handle validation errors
      if (errorMessage === 'Community ID is required') {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: errorMessage }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Failed to request to speak in community voice chat' }
        }
      }
    }
  }
}
