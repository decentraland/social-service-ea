import {
  StartCommunityVoiceChatPayload,
  StartCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatPermissionError,
  CommunityVoiceChatAlreadyActiveError
} from '../../../logic/community-voice/errors'

export function startCommunityVoiceChatService({
  components: { logs, communityVoice }
}: RPCServiceContext<'logs' | 'communityVoice'>) {
  const logger = logs.getLogger('start-community-voice-chat-rpc')

  return async function (
    request: StartCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<StartCommunityVoiceChatResponse> {
    try {
      logger.info('Starting community voice chat', {
        communityId: request.communityId,
        userAddress: context.address
      })

      if (!request.communityId) {
        logger.warn('Missing community ID in request')
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: 'Community ID is required' }
          }
        }
      }

      const { connectionUrl } = await communityVoice.startCommunityVoiceChat(request.communityId, context.address)

      logger.info('Community voice chat started successfully', {
        communityId: request.communityId,
        userAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            credentials: {
              connectionUrl
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to start community voice chat:', {
        errorMessage: error.message,
        communityId: request.communityId,
        userAddress: context.address
      })

      // Handle specific error types
      if (error instanceof UserNotCommunityMemberError || error instanceof CommunityVoiceChatPermissionError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      if (error instanceof CommunityVoiceChatAlreadyActiveError) {
        return {
          response: {
            $case: 'conflictingError',
            conflictingError: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Failed to start community voice chat' }
        }
      }
    }
  }
}
