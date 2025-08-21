import {
  PromoteSpeakerInCommunityVoiceChatPayload,
  PromoteSpeakerInCommunityVoiceChatResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RPCServiceContext, RpcServerContext } from '../../../types/rpc'
import {
  UserNotCommunityMemberError,
  CommunityVoiceChatNotFoundError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  CommunityVoiceChatPermissionError,
  validateCommunityVoiceChatTargetUser
} from '../../../logic/community-voice'
import { isErrorWithMessage } from '../../../utils/errors'
import { CommunityRole } from '../../../types/entities'

export function promoteSpeakerInCommunityVoiceChatService({
  components: { logs, commsGatekeeper, communitiesDb }
}: RPCServiceContext<'logs' | 'commsGatekeeper' | 'communitiesDb'>) {
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

      if (!request.communityId || request.communityId.trim() === '') {
        logger.warn('Missing or empty community ID in request')
        throw new InvalidCommunityIdError()
      }

      if (!request.userAddress || request.userAddress.trim() === '') {
        logger.warn('Missing or empty user address in request')
        throw new InvalidUserAddressError()
      }

      // Check permissions: only owners and moderators can promote speakers
      const actingUserRole = await communitiesDb.getCommunityMemberRole(request.communityId, context.address)
      if (actingUserRole !== CommunityRole.Owner && actingUserRole !== CommunityRole.Moderator) {
        throw new CommunityVoiceChatPermissionError('Only community owners and moderators can promote speakers')
      }

      // Get community information to check privacy setting
      const community = await communitiesDb.getCommunity(request.communityId, context.address)
      if (!community) {
        throw new InvalidCommunityIdError()
      }

      // Validate target user can be promoted based on community privacy and membership
      await validateCommunityVoiceChatTargetUser(communitiesDb, community, request.communityId, request.userAddress)

      logger.info('Permission check passed: moderator/owner promoting speaker', {
        communityId: request.communityId,
        actingUserRole,
        targetUserAddress: request.userAddress,
        communityPrivacy: community.privacy,
        moderatorAddress: context.address
      })

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
          internalServerError: { message: 'Failed to promote speaker in community voice chat' }
        }
      }
    }
  }
}
