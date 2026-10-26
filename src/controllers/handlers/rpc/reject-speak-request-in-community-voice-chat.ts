import {
  RejectSpeakRequestInCommunityVoiceChatPayload,
  RejectSpeakRequestInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  CommunityVoiceChatPermissionError
} from '../../../logic/community-voice/errors'
import { isErrorWithMessage } from '../../../utils/errors'
import { rejectSpeakRequestInCommunityVoiceChat } from '../../../logic/community-voice/moderation'
import { InvalidGatekeeperIdentifierError } from '../../../adapters/comms-gatekeeper'

export function rejectSpeakRequestInCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
  const logger = logs.getLogger('reject-speak-request-in-community-voice-chat-rpc')

  return async function (
    request: RejectSpeakRequestInCommunityVoiceChatPayload,
    context: RpcServerContext
  ): Promise<RejectSpeakRequestInCommunityVoiceChatResponse> {
    try {
      logger.info('Rejecting speak request in community voice chat', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      await rejectSpeakRequestInCommunityVoiceChat(
        { logs, commsGatekeeper, communitiesDb },
        request.communityId,
        context.address,
        request.userAddress
      )

      logger.info('Speak request rejected successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: 'Speak request rejected successfully'
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
      logger.error('Failed to reject speak request in community voice chat:', {
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

      if (error instanceof CommunityVoiceChatPermissionError) {
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

      if (
        error instanceof InvalidCommunityIdError ||
        error instanceof InvalidUserAddressError ||
        error instanceof InvalidGatekeeperIdentifierError
      ) {
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
          internalServerError: { message: 'Failed to reject speak request in community voice chat' }
        }
      }
    }
  }
}
