import {
  KickPlayerFromCommunityVoiceChatPayload,
  KickPlayerFromCommunityVoiceChatResponse
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
import { CommunityRole } from '../../../types/entities'

export function kickPlayerFromCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
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

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      // Check permissions: only owners and moderators can kick players
      const actingUserRole = await communitiesDb.getCommunityMemberRole(request.communityId, context.address)
      if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
        throw new CommunityVoiceChatPermissionError('Only community owners and moderators can kick players')
      }

      // Verify the target user is a member of the community
      const targetUserRole = await communitiesDb.getCommunityMemberRole(request.communityId, request.userAddress)
      if (targetUserRole === CommunityRole.None) {
        throw new UserNotCommunityMemberError(request.userAddress, request.communityId)
      }

      logger.info('Permission check passed: moderator/owner kicking player', {
        communityId: request.communityId,
        actingUserRole,
        targetUserAddress: request.userAddress,
        moderatorAddress: context.address
      })

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
          internalServerError: { message: 'Failed to kick player from community voice chat' }
        }
      }
    }
  }
}
