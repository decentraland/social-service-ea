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
import {
  validateCommunityVoiceChatModerator,
  validateCommunityVoiceChatTargetMembership
} from '../../../logic/community-voice/validation'
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

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      // Owner/moderator gate, owner protection and community lookup issued together. Authorization
      // is reported first on purpose: a caller with no role learns nothing about the community.
      const [community, { actingUserRole, targetUserRole }] = await Promise.all([
        communitiesDb.getCommunity(request.communityId, context.address),
        validateCommunityVoiceChatModerator(
          communitiesDb,
          request.communityId,
          context.address,
          request.userAddress,
          'reject speak requests'
        )
      ])

      if (!community) {
        throw new InvalidCommunityIdError()
      }

      // Public guests can raise a hand; a banned target stays rejectable since denying grants nothing.
      validateCommunityVoiceChatTargetMembership(community, request.communityId, request.userAddress, targetUserRole)

      logger.info('Permission check passed: moderator/owner rejecting speak request', {
        communityId: request.communityId,
        actingUserRole,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

      await commsGatekeeper.rejectSpeakRequestInCommunityVoiceChat(request.communityId, request.userAddress)

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
