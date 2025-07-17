import {
  JoinCommunityVoiceChatPayload,
  JoinCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import { CommunityVoiceChatNotFoundError, UserNotCommunityMemberError } from '../../../logic/community-voice/errors'

export function joinCommunityVoiceChatService({
  components: { logs, communityVoice }
}: RPCServiceContext<'logs' | 'communityVoice'>) {
  const logger = logs.getLogger('join-community-voice-chat-rpc')

  return async function (
    request: JoinCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<JoinCommunityVoiceChatResponse> {
    try {
      logger.info('Joining community voice chat', {
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

      const { connectionUrl } = await communityVoice.joinCommunityVoiceChat(request.communityId, context.address)

      logger.info('Community voice chat joined successfully', {
        communityId: request.communityId,
        userAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            voiceChatId: request.communityId,
            credentials: {
              connectionUrl
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to join community voice chat:', {
        errorMessage: error.message,
        communityId: request.communityId,
        userAddress: context.address
      })

      // Handle specific error types
      if (error instanceof CommunityVoiceChatNotFoundError) {
        return {
          response: {
            $case: 'notFoundError',
            notFoundError: { message: error.message }
          }
        }
      }

      if (error instanceof UserNotCommunityMemberError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Failed to join community voice chat' }
        }
      }
    }
  }
}
