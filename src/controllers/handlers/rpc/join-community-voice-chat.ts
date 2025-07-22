import {
  JoinCommunityVoiceChatPayload,
  JoinCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import {
  CommunityVoiceChatNotFoundError,
  UserNotCommunityMemberError,
  InvalidCommunityIdError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

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

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
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
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to join community voice chat:', {
        errorMessage: errorMessage,
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

      if (error instanceof NotAuthorizedError) {
        return {
          response: {
            $case: 'forbiddenError',
            forbiddenError: { message: error.message }
          }
        }
      }

      // Handle validation errors
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
          internalServerError: { message: 'Failed to join community voice chat' }
        }
      }
    }
  }
}
