import {
  PromoteSpeakerInCommunityVoiceChatPayload,
  PromoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import { UserNotCommunityMemberError, CommunityVoiceChatNotFoundError } from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function promoteSpeakerInCommunityVoiceChatService({
  components: { logs, commsGatekeeper }
}: RPCServiceContext<'logs' | 'commsGatekeeper'>) {
  const logger = logs.getLogger('promote-speaker-in-community-voice-chat-rpc')

  return async function (
    request: PromoteSpeakerInCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<PromoteSpeakerInCommunityVoiceChatResponse> {
    try {
      logger.info('Promoting speaker in community voice chat', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      if (!request.communityId) {
        logger.warn('Missing community ID in request')
        throw new Error('Community ID is required')
      }

      if (!request.userAddress) {
        logger.warn('Missing user address in request')
        throw new Error('User address is required')
      }

      await commsGatekeeper.promoteSpeakerInCommunityVoiceChat(request.communityId, request.userAddress)

      logger.info('Speaker promoted successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'User promoted to speaker successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to promote speaker in community voice chat:', {
        errorMessage: errorMessage,
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
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
      if (errorMessage === 'Community ID is required' || errorMessage === 'User address is required') {
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
          internalServerError: { message: 'Failed to promote speaker in community voice chat' }
        }
      }
    }
  }
}
