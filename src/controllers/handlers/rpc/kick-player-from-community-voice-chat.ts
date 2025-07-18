import {
  KickPlayerFromCommunityVoiceChatPayload,
  KickPlayerFromCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import { UserNotCommunityMemberError, CommunityVoiceChatNotFoundError } from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function kickPlayerFromCommunityVoiceChatService({
  components: { logs, commsGatekeeper }
}: RPCServiceContext<'logs' | 'commsGatekeeper'>) {
  const logger = logs.getLogger('kick-player-from-community-voice-chat-rpc')

  return async function (
    request: KickPlayerFromCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<KickPlayerFromCommunityVoiceChatResponse> {
    try {
      logger.info('Kicking player from community voice chat', {
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

      await commsGatekeeper.kickUserFromCommunityVoiceChat(request.communityId, request.userAddress)

      logger.info('Player kicked successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'User kicked from voice chat successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to kick player from community voice chat:', {
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
          internalServerError: { message: 'Failed to kick player from community voice chat' }
        }
      }
    }
  }
}
