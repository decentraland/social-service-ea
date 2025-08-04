import {
  EndCommunityVoiceChatPayload,
  EndCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'

import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatPermissionError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function endCommunityVoiceChatService({
  components: { logs, communityVoice }
}: RPCServiceContext<'logs' | 'communityVoice'>) {
  const logger = logs.getLogger('end-community-voice-chat-rpc')

  return async function (
    request: EndCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<EndCommunityVoiceChatResponse> {
    try {
      logger.info('Ending community voice chat', {
        communityId: request.communityId,
        userAddress: context.address
      })

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      await communityVoice.endCommunityVoiceChat(request.communityId, context.address)

      logger.info('Community voice chat ended successfully', {
        communityId: request.communityId,
        userAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'Community voice chat ended successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to end community voice chat:', {
        errorMessage: errorMessage,
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
          internalServerError: { message: 'Failed to end community voice chat' }
        }
      }
    }
  }
}
