import {
  DemoteSpeakerInCommunityVoiceChatPayload,
  DemoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  CommunityVoiceChatPermissionError
} from '../../../logic/community-voice'
import { isErrorWithMessage } from '../../../utils/errors'
import { demoteSpeakerInCommunityVoiceChat } from '../../../logic/community-voice/moderation'
import { InvalidGatekeeperIdentifierError } from '../../../adapters/comms-gatekeeper'

export function demoteSpeakerInCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
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

      const { isSelfDemote } = await demoteSpeakerInCommunityVoiceChat(
        { logs, commsGatekeeper, communitiesDb },
        request.communityId,
        context.address,
        request.userAddress
      )

      logger.info('Speaker demoted successfully', {
        communityId: request.communityId,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address,
        isSelfDemote: isSelfDemote.toString()
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            message: isSelfDemote
              ? 'You have been demoted to listener successfully'
              : 'User demoted to listener successfully'
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
          internalServerError: { message: 'Failed to demote speaker in community voice chat' }
        }
      }
    }
  }
}
