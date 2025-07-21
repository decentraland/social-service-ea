import {
  DemoteSpeakerInCommunityVoiceChatPayload,
  DemoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function demoteSpeakerInCommunityVoiceChatService({
  components: { logs, commsGatekeeper }
}: RPCServiceContext<'logs' | 'commsGatekeeper'>) {
  const logger = logs.getLogger('demote-speaker-in-community-voice-chat-rpc')

  return async function (
    request: DemoteSpeakerInCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<DemoteSpeakerInCommunityVoiceChatResponse> {
    try {
      logger.info('Demoting speaker in community voice chat', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      await commsGatekeeper.demoteSpeakerInCommunityVoiceChat(request.communityId, request.userAddress)

      logger.info('Speaker demoted successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'User demoted to listener successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to demote speaker in community voice chat:', {
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

      if (error instanceof InvalidCommunityIdError || error instanceof InvalidUserAddressError) {
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
          internalServerError: { message: 'Failed to demote speaker in community voice chat' }
        }
      }
    }
  }
}
